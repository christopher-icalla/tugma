import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';
import { SeedService } from './seed/seed.service';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence in depth (on top of SameSite cookies): a browser always sends
 * Origin on cross-site POST/PUT/PATCH/DELETE, so reject those unless they come
 * from the web app. Non-browser clients send no Origin and carry no cookies
 * from a victim, so they're unaffected.
 */
function requireAllowedOrigin(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (UNSAFE_METHODS.has(req.method) && origin && !allowed.includes(origin)) {
      res.status(403).json({ detail: 'Cross-origin request blocked.' });
      return;
    }
    next();
  };
}

export function configureApp(app: NestExpressApplication) {
  const cfg = config();
  const origins = cfg.FRONTEND_URL.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);

  if (cfg.TRUST_PROXY > 0) app.set('trust proxy', cfg.TRUST_PROXY);
  app.disable('x-powered-by');
  // JSON API: no CSP needed for HTML, but keep the rest of helmet's headers (HSTS, nosniff, frameguard…).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(requireAllowedOrigin(origins));
  // JSON only (no urlencoded/multipart), so HTML forms on other sites can't post to the API.
  app.use(json({ limit: '100kb' }));
  // Body-parser errors (malformed JSON, too large) as { detail }, never an HTML stack trace.
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (!err.type?.startsWith('entity.')) return next(err);
    const status = err.status ?? 400;
    res.status(status).json({ detail: status === 413 ? 'Request body too large.' : 'Malformed JSON body.' });
  });
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const cfg = config();
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false }));
  await app.get(SeedService).run();
  await app.listen(cfg.PORT);
  new Logger('TUGMA').log(`API listening on :${cfg.PORT}`);
}

if (require.main === module) void bootstrap();
