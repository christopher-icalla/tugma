import { Injectable } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.guard';
import { MailService } from '../auth/mail.service';
import { PERMISSIONS } from '../auth/permissions';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma.service';
import { followUps, OPEN_STATES, planReminders } from './follow-ups';

/** Loads follow-ups and sends reminder emails; used by the API and the daily schedule. */
@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  emailConfigured() {
    return this.mail.configured();
  }

  async load(orgId: string, now = new Date()) {
    const [exceptions, attestations] = await Promise.all([
      this.prisma.controlException.findMany({ where: { organization_id: orgId, status: { in: OPEN_STATES } } }),
      this.prisma.stellarAttestation.findMany({ where: { organization_id: orgId, verifier_address: null } }),
    ]);
    return followUps(now, exceptions, attestations);
  }

  /** Emails each person their follow-ups, and audits the send as `actor`. */
  async remind(orgId: string, actor: PublicUser) {
    const f = await this.load(orgId);
    const users = await this.prisma.user.findMany({ where: { organization_id: orgId }, select: { id: true, email: true, name: true, role: true } });
    const countersigners = users.filter((u) => (PERMISSIONS['package:countersign'] as string[]).includes(u.role));
    const plan = planReminders(f, countersigners);
    const byId = new Map(users.map((u) => [u.id, u]));

    let sent = 0;
    for (const r of plan) {
      const u = byId.get(r.user_id);
      if (u && (await this.mail.sendFollowUp(u.email, u.name, r.overdue, r.countersign))) sent += 1;
    }
    const result = {
      recipients: plan.length,
      sent,
      not_sent: plan.length - sent,
      email_configured: this.mail.configured(),
      overdue_exceptions: f.overdue.length,
      awaiting_countersign: f.awaiting_countersign.length,
    };
    await this.audit.record(actor, 'reminders.send', 'follow_ups', orgId, null, result);
    return result;
  }
}
