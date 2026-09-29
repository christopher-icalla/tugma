import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, PublicUser, RequirePerm } from '../auth/auth.guard';
import { can } from '../auth/permissions';
import { AuditService } from '../common/audit.service';
import { parse, shortId } from '../common/util';
import { PrismaService } from '../prisma.service';

const ALLOWED_NEXT: Record<string, string[]> = {
  OPEN: ['IN_REVIEW'],
  IN_REVIEW: ['REMEDIATION'],
  REMEDIATION: ['RESOLVED'],
  RESOLVED: ['VERIFIED'],
  VERIFIED: [],
};

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  control: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
});
const AssignInput = z.object({ owner_id: z.string(), due_date: z.string().datetime({ offset: true }).or(z.string().date()).nullish() });
const TransitionInput = z.object({ to_status: z.string() });
const RemediationInput = z.object({
  action: z.string().nullish(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).nullish(),
  completion_note: z.string().nullish(),
});
const CommentInput = z.object({ text: z.string().trim().min(1, 'Comment cannot be empty') });

type Comment = { author: string; role: string; text: string; at: string };

@Controller('api/exceptions')
export class ExceptionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getException(orgId: string, code: string) {
    const exc = await this.prisma.controlException.findFirst({ where: { organization_id: orgId, exception_code: code } });
    if (!exc) throw new NotFoundException(`Exception ${code} not found.`);
    return exc;
  }

  @Get()
  async list(@CurrentUser() user: PublicUser, @Query() query: unknown) {
    const q = parse(ListQuery, query);
    const org = { organization_id: user.organization_id };
    const where: Prisma.ControlExceptionWhereInput = { ...org };
    if (q.search) {
      where.OR = ['exception_code', 'title', 'transaction_id'].map((f) => ({ [f]: { contains: q.search, mode: 'insensitive' } }));
    }
    if (q.control) where.control_code = q.control.toUpperCase();
    if (q.severity) where.severity = q.severity;
    if (q.status) where.status = q.status;

    const [total, exceptions, byControl] = await Promise.all([
      this.prisma.controlException.count({ where }),
      this.prisma.controlException.findMany({
        where,
        orderBy: [{ detected_at: 'desc' }, { exception_code: 'asc' }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
      }),
      this.prisma.controlException.groupBy({ by: ['control_code'], where: org, _count: { _all: true } }),
    ]);
    return {
      exceptions, total, page: q.page, page_size: q.page_size, pages: Math.ceil(total / q.page_size),
      facets: { by_control: Object.fromEntries(byControl.map((g) => [g.control_code, g._count._all])) },
    };
  }

  @Get(':code')
  async detail(@Param('code') code: string, @CurrentUser() user: PublicUser) {
    const orgId = user.organization_id;
    const exception =
      (await this.prisma.controlException.findFirst({ where: { organization_id: orgId, exception_code: code } })) ??
      (await this.prisma.controlException.findFirst({ where: { organization_id: orgId, id: code } }));
    if (!exception) throw new NotFoundException(`Exception ${code} not found.`);

    const [transaction, control, remediation_actions, test_run, evidence, audit] = await Promise.all([
      exception.transaction_id
        ? this.prisma.paymentTransaction.findFirst({ where: { organization_id: orgId, transaction_id: exception.transaction_id } })
        : null,
      exception.control_id ? this.prisma.control.findUnique({ where: { id: exception.control_id } }) : null,
      this.prisma.remediationAction.findMany({ where: { exception_code: exception.exception_code } }),
      exception.control_test_run_id ? this.prisma.controlTestRun.findUnique({ where: { id: exception.control_test_run_id } }) : null,
      this.prisma.evidence.findMany({ where: { organization_id: orgId, exception_id: exception.id }, orderBy: { created_at: 'asc' } }),
      this.prisma.auditLog.findMany({ where: { organization_id: orgId, entity_id: exception.id }, orderBy: { timestamp: 'desc' }, take: 100 }),
    ]);
    const role = user.role;
    return {
      exception, transaction, control, remediation_actions, test_run, evidence, audit,
      permissions: {
        can_assign: can(role, 'exception:assign'),
        can_transition: can(role, 'exception:transition'),
        can_remediate: can(role, 'exception:remediate'),
        can_comment: can(role, 'exception:comment'),
        can_add_evidence: can(role, 'evidence:create'),
        can_verify: can(role, 'exception:verify'),
      },
    };
  }

  @Post(':code/assign')
  @HttpCode(200)
  @RequirePerm('exception:assign')
  async assign(@Param('code') code: string, @Body() body: unknown, @CurrentUser() user: PublicUser) {
    const input = parse(AssignInput, body);
    const exc = await this.getException(user.organization_id, code);
    const owner = await this.prisma.user.findFirst({ where: { id: input.owner_id, organization_id: user.organization_id } });
    if (!owner) throw new NotFoundException('Assignee not found in this organization.');

    const before = { owner_id: exc.owner_id, due_date: exc.due_date };
    const after = {
      owner_id: owner.id, owner_name: owner.name, owner_role: owner.role,
      due_date: input.due_date ? new Date(input.due_date) : exc.due_date, assigned_at: new Date(),
    };
    await this.prisma.controlException.update({ where: { exception_code: code }, data: { ...after, updated_at: new Date() } });
    await this.audit.record(user, 'exception:assign', 'exception', exc.id, before, after);
    return { message: `Assigned to ${owner.name}.`, ...after };
  }

  @Post(':code/transition')
  @HttpCode(200)
  async transition(@Param('code') code: string, @Body() body: unknown, @CurrentUser() user: PublicUser) {
    const to = parse(TransitionInput, body).to_status.toUpperCase();
    const exc = await this.getException(user.organization_id, code);
    const current = exc.status;

    // Role gate first, so a role-denied write always returns 403 (never 400).
    if (to === 'VERIFIED') {
      if (!can(user.role, 'exception:verify')) throw new ForbiddenException(`Your role (${user.role}) cannot verify exceptions.`);
    } else if (!can(user.role, 'exception:transition')) {
      throw new ForbiddenException(`Your role (${user.role}) cannot change exception status.`);
    }

    if (!(ALLOWED_NEXT[current] ?? []).includes(to)) {
      throw new BadRequestException(`Illegal transition ${current} → ${to}.`);
    }

    // Independent verification (segregation of duties).
    if (to === 'VERIFIED' && exc.resolved_by && exc.resolved_by === user.id) {
      throw new ForbiddenException(
        'Independent verification required: the verifier must differ from the user who resolved the exception (segregation of duties).',
      );
    }

    // RESOLVED requires evidence + a completed remediation action.
    if (to === 'RESOLVED') {
      const [evidence, done] = await Promise.all([
        this.prisma.evidence.count({ where: { organization_id: user.organization_id, exception_id: exc.id } }),
        this.prisma.remediationAction.count({ where: { exception_code: code, status: 'COMPLETED' } }),
      ]);
      if (evidence === 0) throw new BadRequestException('Cannot resolve: at least one resolution evidence record must be attached first.');
      if (done === 0) throw new BadRequestException('Cannot resolve: a remediation action must be marked complete first.');
    }

    const now = new Date();
    const updates: Prisma.ControlExceptionUpdateInput = { status: to, updated_at: now };
    if (to === 'RESOLVED') Object.assign(updates, { resolved_by: user.id, resolved_at: now });
    if (to === 'VERIFIED') {
      Object.assign(updates, { verified_by: user.id, verified_by_name: user.name, verified_at: now, verification_status: 'VERIFIED' });
    }
    // Conditional on the status we validated against, so concurrent transitions can't both win.
    const result = await this.prisma.controlException.updateMany({ where: { exception_code: code, status: current }, data: updates as Prisma.ControlExceptionUpdateManyMutationInput });
    if (result.count !== 1) throw new BadRequestException('Exception status changed concurrently. Reload and try again.');
    await this.audit.record(user, 'exception:transition', 'exception', exc.id, { status: current }, { status: to });
    return { message: `Status changed to ${to}.`, status: to };
  }

  @Post(':code/remediation')
  @HttpCode(200)
  @RequirePerm('exception:remediate')
  async remediation(@Param('code') code: string, @Body() body: unknown, @CurrentUser() user: PublicUser) {
    const input = parse(RemediationInput, body);
    const exc = await this.getException(user.organization_id, code);
    const now = new Date();
    const existing = await this.prisma.remediationAction.findUnique({ where: { exception_code: code } });

    let after: object;
    if (!existing) {
      after = await this.prisma.remediationAction.create({
        data: {
          id: shortId('rem', 5), exception_code: code, action: input.action || 'Remediation action',
          owner_role: exc.owner_role, due_date: exc.due_date, status: input.status || 'IN_PROGRESS',
          completion_note: input.completion_note ?? null, completed_at: input.status === 'COMPLETED' ? now : null,
        },
      });
    } else {
      const updates: Prisma.RemediationActionUpdateInput = {};
      if (input.action) updates.action = input.action;
      if (input.status) {
        updates.status = input.status;
        if (input.status === 'COMPLETED') updates.completed_at = now;
      }
      if (input.completion_note !== undefined && input.completion_note !== null) updates.completion_note = input.completion_note;
      await this.prisma.remediationAction.update({ where: { exception_code: code }, data: updates });
      after = updates;
    }
    await this.audit.record(user, 'exception:remediation', 'exception', exc.id, null, after);
    return { message: 'Remediation updated.', remediation: after };
  }

  @Post(':code/comment')
  @HttpCode(200)
  @RequirePerm('exception:comment')
  async comment(@Param('code') code: string, @Body() body: unknown, @CurrentUser() user: PublicUser) {
    const { text } = parse(CommentInput, body);
    const exc = await this.getException(user.organization_id, code);
    const comment: Comment = { author: user.name, role: user.role, text, at: new Date().toISOString() };
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.controlException.findUniqueOrThrow({ where: { exception_code: code }, select: { comments: true } });
      const comments = [...((row.comments as Comment[] | null) ?? []), comment];
      await tx.controlException.update({ where: { exception_code: code }, data: { comments } });
    });
    await this.audit.record(user, 'exception:comment', 'exception', exc.id, null, { text });
    return { message: 'Comment added.', comment };
  }

  @Get(':code/chain')
  async chain(@Param('code') code: string, @CurrentUser() user: PublicUser) {
    const orgId = user.organization_id;
    const exc = await this.getException(orgId, code);
    const control = exc.control_id ? await this.prisma.control.findUnique({ where: { id: exc.control_id } }) : null;
    const requirement = control ? await this.prisma.regulatoryRequirement.findUnique({ where: { id: control.requirement_id } }) : null;
    const [source, test, tx, remediations, evidenceCount] = await Promise.all([
      requirement ? this.prisma.regulatorySource.findUnique({ where: { id: requirement.source_id } }) : null,
      control ? this.prisma.controlTest.findUnique({ where: { control_id: control.id } }) : null,
      exc.transaction_id ? this.prisma.paymentTransaction.findFirst({ where: { organization_id: orgId, transaction_id: exc.transaction_id } }) : null,
      this.prisma.remediationAction.findMany({ where: { exception_code: code } }),
      this.prisma.evidence.count({ where: { organization_id: orgId, exception_id: exc.id } }),
    ]);
    return {
      chain: [
        { step: 'REGULATION', label: source ? `${source.regulator} · ${source.title}` : null, route: '/app/regulatory-intelligence' },
        { step: 'REQUIREMENT', label: requirement ? `${requirement.requirement_code} — ${requirement.title}` : null, route: '/app/regulatory-intelligence' },
        { step: 'CONTROL', label: control ? `${control.control_code} — ${control.name}` : null, route: '/app/controls' },
        { step: 'TEST', label: test?.name ?? null, route: '/app/controls' },
        { step: 'TRANSACTION', label: tx?.transaction_id ?? 'n/a', route: tx ? `/app/transactions/${tx.transaction_id}` : null },
        { step: 'EXCEPTION', label: exc.exception_code, route: `/app/exceptions/${exc.exception_code}` },
        { step: 'REMEDIATION', label: remediations[0]?.status ?? 'None', route: null },
        { step: 'EVIDENCE', label: `${evidenceCount} record(s)`, route: '/app/evidence' },
      ],
    };
  }
}
