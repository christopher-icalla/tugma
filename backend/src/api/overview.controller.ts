import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, PublicUser, publicUserSelect, RequirePerm } from '../auth/auth.guard';
import { ROLES } from '../auth/permissions';
import { parse } from '../common/util';
import { EngineService } from '../engine/engine.service';
import { PrismaService } from '../prisma.service';

const OPEN_STATES = ['OPEN', 'IN_REVIEW', 'REMEDIATION'];
const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Organization, dashboard, regulatory intelligence, controls and audit reads. */
@Controller('api')
export class OverviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: EngineService,
  ) {}

  /** Newest run per control code. */
  private async latestRuns(orgId: string) {
    const runs = await this.prisma.controlTestRun.findMany({
      where: { organization_id: orgId },
      orderBy: [{ control_code: 'asc' }, { completed_at: 'desc' }],
      distinct: ['control_code'],
    });
    return new Map(runs.map((r) => [r.control_code, r]));
  }

  @Get('organization')
  async organization(@CurrentUser() user: PublicUser) {
    const [organization, users] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: user.organization_id } }),
      this.prisma.user.findMany({ where: { organization_id: user.organization_id }, select: publicUserSelect, orderBy: { created_at: 'asc' } }),
    ]);
    return { organization, users, roles: ROLES };
  }

  @Get('dashboard/summary')
  async dashboard(@CurrentUser() user: PublicUser) {
    const org = { organization_id: user.organization_id };
    const [controls, latest, totalTx, totalExc, highRisk, openRemediation, withEvidence, open] = await Promise.all([
      this.prisma.control.findMany({ where: org, orderBy: { control_code: 'asc' } }),
      this.latestRuns(user.organization_id),
      this.prisma.paymentTransaction.count({ where: org }),
      this.prisma.controlException.count({ where: org }),
      this.prisma.controlException.count({ where: { ...org, severity: 'HIGH' } }),
      this.prisma.controlException.count({ where: { ...org, status: { in: OPEN_STATES } } }),
      this.prisma.evidence.findMany({ where: { ...org, exception_id: { not: null } }, distinct: ['exception_id'], select: { exception_id: true } }),
      this.prisma.controlException.findMany({ where: { ...org, status: { in: OPEN_STATES } } }),
    ]);

    const control_health = controls.map((c) => {
      const r = latest.get(c.control_code);
      return {
        control_code: c.control_code, name: c.name, risk_level: c.risk_level, status: c.status, automated: c.automated,
        records_tested: r?.records_tested ?? null, passed_count: r?.passed_count ?? null,
        failed_count: r?.failed_count ?? null, warning_count: r?.warning_count ?? null,
        not_testable_count: r?.not_testable_count ?? null, last_run: r?.completed_at ?? null,
      };
    });

    open.sort((a, b) =>
      (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
      a.detected_at.getTime() - b.detected_at.getTime() ||
      a.exception_code.localeCompare(b.exception_code));

    return {
      kpis: {
        transactions_analyzed: totalTx,
        controls_tested: control_health.filter((c) => c.last_run).length,
        exceptions: totalExc,
        high_risk: highRisk,
        evidence_readiness: totalExc ? Math.round((100 * withEvidence.length) / totalExc) : 0,
        open_remediation: openRemediation,
      },
      control_health,
      priority_exceptions: open.slice(0, 8),
      engine_status: 'LIVE',
    };
  }

  @Get('regulatory/sources')
  async regulatorySources(@CurrentUser() user: PublicUser) {
    const [sources, requirements, controls] = await Promise.all([
      this.prisma.regulatorySource.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.regulatoryRequirement.findMany({ orderBy: { requirement_code: 'asc' } }),
      this.prisma.control.findMany({ where: { organization_id: user.organization_id }, orderBy: { control_code: 'asc' } }),
    ]);
    return {
      sources: sources.map((s) => ({
        ...s,
        requirements: requirements
          .filter((r) => r.source_id === s.id)
          .map((r) => ({
            ...r,
            mapped_controls: controls
              .filter((c) => c.requirement_id === r.id)
              .map((c) => ({ control_code: c.control_code, name: c.name, interpretation: c.interpretation })),
          })),
      })),
    };
  }

  @Get('controls')
  async controls(@CurrentUser() user: PublicUser) {
    const [controls, latest] = await Promise.all([
      this.prisma.control.findMany({ where: { organization_id: user.organization_id }, orderBy: { control_code: 'asc' } }),
      this.latestRuns(user.organization_id),
    ]);
    return { controls: controls.map((c) => ({ ...c, run: latest.get(c.control_code) ?? null })) };
  }

  // Declared before `controls/:code` so "run" isn't captured as a code.
  @Post('controls/run')
  @HttpCode(200)
  @RequirePerm('controls:run')
  async runControls(@CurrentUser() user: PublicUser) {
    const result = await this.engine.runAllControls(user.email);
    return { message: 'Control run completed.', result: result.runs, exceptions_detected: result.exceptions };
  }

  @Get('controls/:code')
  async controlDetail(@Param('code') code: string, @CurrentUser() user: PublicUser) {
    const orgId = user.organization_id;
    const controlCode = code.toUpperCase();
    const control = await this.prisma.control.findUnique({
      where: { organization_id_control_code: { organization_id: orgId, control_code: controlCode } },
    });
    if (!control) throw new NotFoundException(`Control ${code} not found.`);
    const requirement = await this.prisma.regulatoryRequirement.findUnique({ where: { id: control.requirement_id } });
    const [test, source, runs, exceptions, exceptionsCount] = await Promise.all([
      this.prisma.controlTest.findUnique({ where: { control_id: control.id } }),
      requirement ? this.prisma.regulatorySource.findUnique({ where: { id: requirement.source_id } }) : null,
      this.prisma.controlTestRun.findMany({ where: { organization_id: orgId, control_code: controlCode }, orderBy: { completed_at: 'desc' }, take: 100 }),
      this.prisma.controlException.findMany({ where: { organization_id: orgId, control_code: controlCode }, orderBy: [{ detected_at: 'desc' }, { exception_code: 'asc' }], take: 50 }),
      this.prisma.controlException.count({ where: { organization_id: orgId, control_code: controlCode } }),
    ]);
    return {
      control, test, requirement, source, latest_run: runs[0] ?? null, runs,
      exceptions_count: exceptionsCount, exceptions,
    };
  }

  @Get('audit-logs')
  @RequirePerm('audit:read')
  async auditLogs(@CurrentUser() user: PublicUser, @Query() query: unknown) {
    const q = parse(
      z.object({ entity_id: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }),
      query,
    );
    const audit_logs = await this.prisma.auditLog.findMany({
      where: { organization_id: user.organization_id, ...(q.entity_id ? { entity_id: q.entity_id } : {}) },
      orderBy: { timestamp: 'desc' },
      take: q.limit,
    });
    return { audit_logs };
  }
}
