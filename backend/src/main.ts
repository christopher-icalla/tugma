import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './config';
import { SeedService } from './seed/seed.service';

export function configureApp(app: NestExpressApplication) {
  const cfg = config();
  app.use(cookieParser());
  // Behind one reverse proxy (e.g. a PaaS router) so req.ip is the client, for login throttling.
  app.set('trust proxy', 1);
  app.enableCors({ origin: cfg.FRONTEND_URL.split(',').map((o) => o.trim()), credentials: true });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const cfg = config();
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
  await app.get(SeedService).run();
  await app.listen(cfg.PORT);
  new Logger('TUGMA').log(`API listening on :${cfg.PORT}`);
}

if (require.main === module) void bootstrap();
