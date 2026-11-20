import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, PublicUser, RequirePerm } from '../auth/auth.guard';
import { MailService } from '../auth/mail.service';
import { PERMISSIONS } from '../auth/permissions';
import { AuditService } from '../common/audit.service';
import { ReminderRateLimit } from '../common/rate-limits';
import { PrismaService } from '../prisma.service';
import { followUps, OPEN_STATES, planReminders } from './follow-ups';

/** Overdue exceptions, their ageing, attestations awaiting countersignature, and reminder emails. */
@Controller('api/follow-ups')
export class FollowUpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  private async load(orgId: string) {
    const [exceptions, attestations] = await Promise.all([
      this.prisma.controlException.findMany({ where: { organization_id: orgId, status: { in: OPEN_STATES } } }),
      this.prisma.stellarAttestation.findMany({ where: { organization_id: orgId, verifier_address: null } }),
    ]);
    return followUps(new Date(), exceptions, attestations);
  }

  @Get()
  async list(@CurrentUser() user: PublicUser) {
    const f = await this.load(user.organization_id);
    return { ...f, overdue_total: f.overdue.length, overdue: f.overdue.slice(0, 50), email_configured: this.mail.configured() };
  }

  @Post('remind')
  @HttpCode(200)
  @RequirePerm('reminders:send')
  @ReminderRateLimit()
  async remind(@CurrentUser() user: PublicUser) {
    const orgId = user.organization_id;
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
    await this.audit.record(user, 'reminders.send', 'follow_ups', orgId, null, result);
    return result;
  }
}
