import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { parse } from '../common/util';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Public, PublicUser, publicUserSelect } from './auth.guard';
import { MailService } from './mail.service';
import { AuthRateLimit } from '../common/rate-limits';

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;
const RESET_WINDOW_SECONDS = 900;
const RESET_MAX_REQUESTS = 5;
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 7 * 24 * 60 * 60;
const GENERIC_RESET = { message: 'If that email is registered, a reset link has been sent.' };

const LoginInput = z.object({ email: z.string(), password: z.string() });
const ForgotInput = z.object({ email: z.string() });
const ResetInput = z.object({ token: z.string(), password: z.string().min(8, 'Password must be at least 8 characters') });

export const hashPassword = (password: string) => bcrypt.hashSync(password, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compareSync(plain, hash);

// Compared against when the email doesn't exist, so a login takes the same time
// either way and response timing doesn't reveal which emails have accounts.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

const sign = (payload: object, ttl: number) =>
  jwt.sign(payload, config().JWT_SECRET, { algorithm: 'HS256', expiresIn: ttl });

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(LoginInput, body);
    const email = input.email.trim().toLowerCase();
    const identifier = `${req.ip ?? 'unknown'}:${email}`;

    if (await this.isLocked(identifier)) {
      throw new HttpException('Too many failed attempts. Try again in 15 minutes.', 429);
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      await this.recordFailure(identifier, email);
      throw new UnauthorizedException('Invalid email or password.');
    }
    await this.prisma.loginAttempt.deleteMany({ where: { identifier } });

    this.setCookie(res, 'access_token', sign({ sub: user.id, email, ver: user.token_version, type: 'access' }, ACCESS_TTL_S), ACCESS_TTL_S);
    this.setCookie(res, 'refresh_token', sign({ sub: user.id, ver: user.token_version, type: 'refresh' }, REFRESH_TTL_S), REFRESH_TTL_S);
    const { password_hash: _, ...pub } = user;
    return pub;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', this.cookieOptions());
    res.clearCookie('refresh_token', this.cookieOptions());
    return { message: 'Logged out' };
  }

  @Get('me')
  me(@CurrentUser() user: PublicUser) {
    return user;
  }

  @Public()
  @AuthRateLimit()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string | undefined = req.cookies?.refresh_token;
    if (!token) throw new UnauthorizedException('Not authenticated');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');
    const user = await this.prisma.user.findUnique({ where: { id: String(payload.sub) }, select: publicUserSelect });
    if (!user || (payload.ver ?? 0) !== user.token_version) throw new UnauthorizedException('Session expired');
    this.setCookie(res, 'access_token', sign({ sub: user.id, email: user.email, ver: user.token_version, type: 'access' }, ACCESS_TTL_S), ACCESS_TTL_S);
    return { message: 'refreshed' };
  }

  @Public()
  @AuthRateLimit()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown) {
    const email = parse(ForgotInput, body).email.trim().toLowerCase();
    const now = new Date();
    const windowStart = new Date(now.getTime() - RESET_WINDOW_SECONDS * 1000);
    // Only the current window matters; drop older rows so the table can't grow unbounded.
    await this.prisma.passwordResetRequest.deleteMany({ where: { created_at: { lt: windowStart } } });
    await this.prisma.passwordResetRequest.create({ data: { email, created_at: now } });
    const recent = await this.prisma.passwordResetRequest.count({
      where: { email, created_at: { gte: windowStart } },
    });
    if (recent > RESET_MAX_REQUESTS) return GENERIC_RESET;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return GENERIC_RESET;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        token_hash: createHash('sha256').update(token).digest('hex'),
        user_id: user.id,
        email,
        expires_at: new Date(now.getTime() + 60 * 60 * 1000),
      },
    });
    // Fire-and-forget so response timing doesn't reveal whether the email exists.
    void this.mail.sendPasswordReset(user.email, token);
    return GENERIC_RESET;
  }

  @Public()
  @AuthRateLimit()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    const input = parse(ResetInput, body);
    const tokenHash = createHash('sha256').update(input.token).digest('hex');

    // Atomically claim the token so it can only be used once.
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { token_hash: tokenHash, used: false, expires_at: { gt: new Date() } },
      data: { used: true },
    });
    if (claimed.count !== 1) throw new BadRequestException('Invalid or expired reset link.');
    const record = await this.prisma.passwordResetToken.findUniqueOrThrow({ where: { token_hash: tokenHash } });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.user_id },
        data: { password_hash: hashPassword(input.password), token_version: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.deleteMany({ where: { user_id: record.user_id, used: false } }),
      this.prisma.loginAttempt.deleteMany({ where: { email: record.email } }),
    ]);
    return { message: 'Password updated. You can now sign in.' };
  }

  // ------------------------------------------------------------ helpers

  private cookieOptions() {
    const { COOKIE_SECURE, COOKIE_SAMESITE } = config();
    // Browsers reject SameSite=None cookies that aren't Secure.
    const secure = COOKIE_SECURE || COOKIE_SAMESITE === 'none';
    return { httpOnly: true, secure, sameSite: COOKIE_SAMESITE, path: '/' };
  }

  private setCookie(res: Response, name: string, value: string, maxAgeSeconds: number) {
    res.cookie(name, value, { ...this.cookieOptions(), maxAge: maxAgeSeconds * 1000 });
  }

  private async isLocked(identifier: string) {
    const doc = await this.prisma.loginAttempt.findUnique({ where: { identifier } });
    return !!doc && doc.count >= MAX_FAILED && !!doc.locked_until && doc.locked_until > new Date();
  }

  private async recordFailure(identifier: string, email: string) {
    const now = new Date();
    const doc = await this.prisma.loginAttempt.findUnique({ where: { identifier } });
    const count = (doc?.count ?? 0) + 1;
    const locked_until = count >= MAX_FAILED ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : doc?.locked_until ?? null;
    await this.prisma.loginAttempt.upsert({
      where: { identifier },
      create: { identifier, email, count, locked_until, updated_at: now },
      update: { count, locked_until, updated_at: now },
    });
  }
}
