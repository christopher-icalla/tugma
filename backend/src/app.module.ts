import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EvidenceController } from './api/evidence.controller';
import { ExceptionsController } from './api/exceptions.controller';
import { OverviewController } from './api/overview.controller';
import { TransactionsController } from './api/transactions.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { MailService } from './auth/mail.service';
import { AuditService } from './common/audit.service';
import { DetailExceptionFilter, PlainJsonInterceptor } from './common/http';
import { EngineService } from './engine/engine.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { SeedService } from './seed/seed.service';
import { AttestationService } from './stellar/attestation.service';
import { SorobanService } from './stellar/soroban.service';
import { StellarController } from './stellar/stellar.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    OverviewController,
    TransactionsController,
    ExceptionsController,
    EvidenceController,
    StellarController,
  ],
  providers: [
    PrismaService,
    MailService,
    AuditService,
    EngineService,
    SeedService,
    SorobanService,
    AttestationService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: DetailExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: PlainJsonInterceptor },
  ],
})
export class AppModule {}
