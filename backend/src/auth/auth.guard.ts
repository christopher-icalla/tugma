import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { can, Permission } from './permissions';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string | null;
  organization_id: string;
  token_version: number;
  created_at: Date;
  stellar_address: string | null;
  stellar_linked_at: Date | null;
};

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  title: true,
  organization_id: true,
  token_version: true,
  created_at: true,
  stellar_address: true,
  stellar_linked_at: true,
} as const;

const PUBLIC = 'tugma:public';
const PERMISSION = 'tugma:permission';

/** Route needs no session. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route needs a session whose role holds `action` (403 otherwise). */
export const RequirePerm = (action: Permission) => SetMetadata(PERMISSION, action);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request & { user: PublicUser }>().user,
);

/** Global guard: authenticates every non-@Public route, then enforces @RequirePerm. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: PublicUser }>();
    req.user = await this.authenticate(req);

    const action = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION, targets);
    if (action && !can(req.user.role, action)) {
      throw new ForbiddenException(
        `Your role (${req.user.role}) is not permitted to ${action.replace(':', ' ')}.`,
      );
    }
    return true;
  }

  private async authenticate(req: Request): Promise<PublicUser> {
    let token: string | undefined = req.cookies?.access_token;
    const header = req.headers.authorization ?? '';
    if (!token && header.startsWith('Bearer ')) token = header.slice(7);
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token',
      );
    }
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: publicUserSelect,
    });
    if (!user) throw new UnauthorizedException('User not found');
    if ((payload.ver ?? 0) !== user.token_version) throw new UnauthorizedException('Session expired');
    return user;
  }
}
