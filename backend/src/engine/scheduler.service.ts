import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.guard';
import { FollowUpsService } from '../api/follow-ups.service';
import { config, DEMO_ORG_ID } from '../config';
import { EngineService } from './engine.service';
import { nextRunAt } from './schedule';

export const SCHEDULER_ACTOR = 'scheduler';

/** Audit identity for work the schedule does on its own. */
const systemUser = (organization_id: string): PublicUser => ({
  id: 'system', email: 'scheduler@system', name: 'Daily schedule', role: 'SYSTEM', title: null, organization_id,
  token_version: 0, created_at: new Date(0), stellar_address: null, stellar_linked_at: null,
});

/**
 * Runs every control once a day at CONTROL_SCHEDULE (Manila time) and, with
 * SCHEDULE_REMINDERS=true, emails follow-up reminders afterwards. An in-process
 * timer: run it on one API instance and set CONTROL_SCHEDULE=off on others.
 */
@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private next: Date | null = null;
  private running = false;

  constructor(
    private readonly engine: EngineService,
    private readonly followUps: FollowUpsService,
  ) {}

  /** What the dashboard shows about the schedule. */
  status(now = new Date()) {
    const { CONTROL_SCHEDULE, SCHEDULE_REMINDERS } = config();
    return {
      enabled: CONTROL_SCHEDULE !== 'off',
      daily_at: CONTROL_SCHEDULE === 'off' ? null : CONTROL_SCHEDULE,
      timezone: 'Asia/Manila',
      reminders: SCHEDULE_REMINDERS,
      next_run: (this.next ?? nextRunAt(now, CONTROL_SCHEDULE))?.toISOString() ?? null,
    };
  }

  start() {
    const { CONTROL_SCHEDULE } = config();
    this.next = nextRunAt(new Date(), CONTROL_SCHEDULE);
    if (!this.next) {
      this.logger.log('Daily control run is off (CONTROL_SCHEDULE=off).');
      return;
    }
    // setTimeout tops out near 24.8 days; a day's wait is well inside it.
    this.timer = setTimeout(() => void this.fire(), this.next.getTime() - Date.now());
    this.timer.unref();
    this.logger.log(`Next scheduled control run: ${this.next.toISOString()} (${CONTROL_SCHEDULE} Asia/Manila).`);
  }

  private async fire() {
    try {
      await this.runOnce();
    } finally {
      this.start();
    }
  }

  /** One scheduled run: every control, then reminders if enabled. Skips if one is already running. */
  async runOnce() {
    if (this.running) return null;
    this.running = true;
    try {
      const result = await this.engine.runAllControls(SCHEDULER_ACTOR);
      this.logger.log(`Scheduled control run: ${result.exceptions} exceptions detected.`);
      const reminders = config().SCHEDULE_REMINDERS ? await this.followUps.remind(DEMO_ORG_ID, systemUser(DEMO_ORG_ID)) : null;
      return { exceptions: result.exceptions, reminders };
    } catch (e) {
      this.logger.error(`Scheduled control run failed: ${(e as Error).message}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearTimeout(this.timer);
  }
}
