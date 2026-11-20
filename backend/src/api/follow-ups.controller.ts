import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, PublicUser, RequirePerm } from '../auth/auth.guard';
import { ReminderRateLimit } from '../common/rate-limits';
import { FollowUpsService } from './follow-ups.service';

/** Overdue exceptions, their ageing, attestations awaiting countersignature, and reminder emails. */
@Controller('api/follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  async list(@CurrentUser() user: PublicUser) {
    const f = await this.followUps.load(user.organization_id);
    return { ...f, overdue_total: f.overdue.length, overdue: f.overdue.slice(0, 50), email_configured: this.followUps.emailConfigured() };
  }

  @Post('remind')
  @HttpCode(200)
  @RequirePerm('reminders:send')
  @ReminderRateLimit()
  async remind(@CurrentUser() user: PublicUser) {
    return this.followUps.remind(user.organization_id, user);
  }
}
