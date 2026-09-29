import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PublicUser } from '../auth/auth.guard';
import { PrismaService } from '../prisma.service';
import { shortId, toPlain } from './util';

/** Append-only audit trail. There is deliberately no update/delete path. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    user: PublicUser,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown = null,
    after: unknown = null,
  ) {
    const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (toPlain(v) as Prisma.InputJsonValue));
    await this.prisma.auditLog.create({
      data: {
        id: shortId('aud'),
        organization_id: user.organization_id,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        action,
        entity_type: entityType,
        entity_id: entityId,
        before_state: json(before),
        after_state: json(after),
      },
    });
  }
}
