import {
  BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Res, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, PublicUser, RequirePerm } from '../auth/auth.guard';
import { AuditService } from '../common/audit.service';
import { config } from '../config';
import { canonicalJson, isoDay, parse, sha256, shortId } from '../common/util';
import { PrismaService } from '../prisma.service';
import { AttestationService } from '../stellar/attestation.service';
import { buildEvidenceExport, evidenceFileName, EvidenceNotExportableError, evidenceHashInput } from './evidence-export';
import { buildPackageExport, exportFileName, PackageNotExportableError } from './package-export';
import { buildTimeline } from './package-timeline';

const optional = z.string().nullish();
const EvidenceInput = z.object({
  name: z.string().trim().min(1),
  evidence_type: z.string().trim().min(1),
  description: optional,
  source_system: optional,
  content: optional,
  requirement_id: optional,
  control_id: optional,
  control_test_id: optional,
  exception_id: optional,
  transaction_id: optional,
  remediation_id: optional,
});
const PackageInput = z.object({
  name: optional,
  period_start: z.string().date('period_start must be YYYY-MM-DD'),
  period_end: z.string().date('period_end must be YYYY-MM-DD'),
});

/** Evidence Center, evidence packages (SHA-256 manifests) and reports. */
@Controller('api')
export class EvidenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attestations: AttestationService,
  ) {}

  private packagesFor(orgId: string) {
    return this.prisma.evidencePackage.findMany({ where: { organization_id: orgId }, orderBy: { generated_at: 'desc' } });
  }

  @Get('evidence')
  async listEvidence(@CurrentUser() user: PublicUser) {
    const [evidence, packages] = await Promise.all([
      this.prisma.evidence.findMany({ where: { organization_id: user.organization_id }, orderBy: { created_at: 'desc' }, take: 200 }),
      this.packagesFor(user.organization_id),
    ]);
    return { evidence, packages: await this.attestations.decorate(packages) };
  }

  @Post('evidence')
  @HttpCode(200)
  @RequirePerm('evidence:create')
  async createEvidence(@Body() body: unknown, @CurrentUser() user: PublicUser) {
    const input = parse(EvidenceInput, body);
    if (input.exception_id) {
      const exc = await this.prisma.controlException.findFirst({ where: { id: input.exception_id, organization_id: user.organization_id } });
      if (!exc) throw new BadRequestException('exception_id does not belong to this organization.');
    }
    const now = new Date();
    const content_hash = sha256(canonicalJson(evidenceHashInput({
      name: input.name, evidence_type: input.evidence_type, content: input.content ?? null, source_system: input.source_system ?? null,
    })));
    const evidence = await this.prisma.evidence.create({
      data: {
        id: shortId('evd', 5), organization_id: user.organization_id, evidence_type: input.evidence_type,
        name: input.name, description: input.description ?? null, source_system: input.source_system ?? null,
        content: input.content ?? null, requirement_id: input.requirement_id ?? null, control_id: input.control_id ?? null,
        control_test_id: input.control_test_id ?? null, exception_id: input.exception_id ?? null,
        transaction_id: input.transaction_id ?? null, remediation_id: input.remediation_id ?? null,
        captured_at: now, captured_by: user.name, content_hash, valid_from: now, verification_status: 'CAPTURED', created_at: now,
      },
    });
    await this.audit.record(user, 'evidence:upload', 'evidence', evidence.id, null, { name: input.name, hash: content_hash });
    return { message: 'Evidence recorded.', evidence };
  }

  /**
   * Download one evidence record with the exact input its content hash was
   * computed from, so it can be checked against a package's manifest line
   * without sharing any other document.
   */
  @Get('evidence/:id/export')
  async exportEvidence(
    @Param('id') id: string,
    @CurrentUser() user: PublicUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [ev, org] = await Promise.all([
      this.prisma.evidence.findFirst({ where: { id, organization_id: user.organization_id } }),
      this.prisma.organization.findUnique({ where: { id: user.organization_id }, select: { chain_org_id: true } }),
    ]);
    if (!ev || !org) throw new NotFoundException('Evidence not found.');
    let out;
    try {
      out = buildEvidenceExport(ev, org.chain_org_id);
    } catch (e) {
      if (e instanceof EvidenceNotExportableError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
    await this.audit.record(user, 'evidence:export', 'evidence', id, null, { content_hash: ev.content_hash });
    res.setHeader('Content-Disposition', `attachment; filename="${evidenceFileName(ev.id)}"`);
    res.setHeader('Cache-Control', 'no-store');
    return out;
  }

  @Get('evidence/completeness')
  async completeness(@CurrentUser() user: PublicUser) {
    const org = { organization_id: user.organization_id };
    const [total, withEvidence, byControl] = await Promise.all([
      this.prisma.controlException.count({ where: org }),
      this.prisma.evidence.findMany({ where: { ...org, exception_id: { not: null } }, distinct: ['exception_id'], select: { exception_id: true } }),
      this.prisma.evidence.groupBy({ by: ['control_id'], where: { ...org, control_id: { not: null } }, _count: { _all: true } }),
    ]);
    return {
      total_exceptions: total,
      exceptions_with_evidence: withEvidence.length,
      completeness: total ? Math.round((100 * withEvidence.length) / total) : 0,
      by_control: Object.fromEntries(byControl.map((g) => [g.control_id, g._count._all])),
    };
  }

  // ------------------------------------------------------ packages

  @Post('evidence-packages/generate')
  @HttpCode(200)
  @RequirePerm('package:generate')
  async generate(@Body() body: unknown, @CurrentUser() user: PublicUser) {
    const input = parse(PackageInput, body);
    const orgId = user.organization_id;
    const ps = input.period_start;
    const pe = input.period_end;
    if (ps > pe) throw new BadRequestException('period_start must be on or before period_end.');
    const inPeriod = (d: Date | null) => {
      const day = isoDay(d);
      return !!day && ps <= day && day <= pe;
    };

    const [sources, requirements, controls, latestRuns, periodTx, allExceptions, allEvidence] = await Promise.all([
      this.prisma.regulatorySource.findMany({ select: { id: true } }),
      this.prisma.regulatoryRequirement.findMany({ select: { id: true } }),
      this.prisma.control.findMany({ where: { organization_id: orgId }, select: { control_code: true } }),
      this.prisma.controlTestRun.findMany({
        where: { organization_id: orgId }, orderBy: [{ control_code: 'asc' }, { completed_at: 'desc' }],
        distinct: ['control_code'], select: { id: true },
      }),
      // Period membership follows the underlying payment activity date, not detection time.
      this.prisma.paymentTransaction.findMany({
        where: { organization_id: orgId, transaction_timestamp: { gte: new Date(`${ps}T00:00:00.000Z`), lte: new Date(`${pe}T23:59:59.999Z`) } },
        select: { transaction_id: true },
      }),
      this.prisma.controlException.findMany({ where: { organization_id: orgId } }),
      this.prisma.evidence.findMany({ where: { organization_id: orgId } }),
    ]);
    const periodTxIds = new Set(periodTx.map((t) => t.transaction_id));
    const exceptions = allExceptions.filter((e) =>
      e.transaction_id ? periodTxIds.has(e.transaction_id) : inPeriod(e.detected_at));
    const exceptionIds = new Set(exceptions.map((e) => e.id));
    const txIds = [...new Set(exceptions.map((e) => e.transaction_id).filter((t): t is string => !!t))].sort();
    const remediations = await this.prisma.remediationAction.findMany({
      where: { exception_code: { in: exceptions.map((e) => e.exception_code) } }, select: { id: true },
    });
    const evidence = allEvidence.filter((ev) => (ev.exception_id && exceptionIds.has(ev.exception_id)) || inPeriod(ev.created_at));
    const withEvidence = new Set(evidence.map((ev) => ev.exception_id).filter((id): id is string => !!id && exceptionIds.has(id)));
    const completeness = exceptions.length ? Math.round((100 * withEvidence.size) / exceptions.length) : 0;

    const manifest = {
      period: [ps, pe],
      regulatory_sources: sources.map((s) => s.id).sort(),
      requirements: requirements.map((r) => r.id).sort(),
      controls: controls.map((c) => c.control_code).sort(),
      test_runs: latestRuns.map((r) => r.id).sort(),
      transactions: txIds,
      exceptions: exceptions.map((e) => e.exception_code).sort(),
      remediations: remediations.map((r) => r.id).sort(),
      evidence: evidence.map((ev) => `${ev.id}:${ev.content_hash}`).sort(),
      counts: {
        controls: controls.length, transactions: txIds.length, exceptions: exceptions.length,
        evidence: evidence.length, completeness,
      },
    };
    const canonical_hash = sha256(canonicalJson(manifest));

    const id = `pkg-${ps}-${pe}`;
    const data = {
      organization_id: orgId, name: input.name || `Evidence Package ${ps} → ${pe}`, period_start: ps, period_end: pe,
      controls_count: controls.length, transactions_count: txIds.length, exceptions_count: exceptions.length,
      evidence_count: evidence.length, completeness_score: completeness, canonical_hash,
      manifest: manifest as Prisma.InputJsonValue, generated_at: new Date(), generated_by: user.name, status: 'FINALIZED',
    };
    const pkg = await this.prisma.evidencePackage.upsert({ where: { id }, update: data, create: { id, ...data } });
    await this.audit.record(user, 'package:generate', 'evidence_package', id, null, { canonical_hash, counts: manifest.counts });
    return { message: 'Evidence package generated.', package: (await this.attestations.decorate([pkg]))[0] };
  }

  @Get('evidence-packages')
  async listPackages(@CurrentUser() user: PublicUser) {
    return { packages: await this.attestations.decorate(await this.packagesFor(user.organization_id)) };
  }

  @Get('evidence-packages/:id')
  async packageDetail(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    const pkg = await this.prisma.evidencePackage.findFirst({ where: { id, organization_id: user.organization_id } });
    if (!pkg) throw new NotFoundException('Package not found.');
    return { package: (await this.attestations.decorate([pkg]))[0] };
  }

  /** Generated, attested, countersigned, downloaded and synced, in time order, with Stellar transaction links. */
  @Get('evidence-packages/:id/timeline')
  async packageTimeline(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    const orgId = user.organization_id;
    const pkg = await this.prisma.evidencePackage.findFirst({ where: { id, organization_id: orgId } });
    if (!pkg) throw new NotFoundException('Package not found.');
    const [audits, attestations] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { organization_id: orgId, entity_type: 'evidence_package', entity_id: id }, orderBy: { timestamp: 'asc' }, take: 500 }),
      this.prisma.stellarAttestation.findMany({ where: { organization_id: orgId, evidence_package_id: id }, orderBy: { version: 'asc' } }),
    ]);
    return { package_id: id, events: buildTimeline(pkg, audits, attestations, config().STELLAR_EXPLORER_URL) };
  }

  /**
   * Download a finalized package in canonical form, with the hash, opaque
   * on-chain organization id and Testnet contract a verifier needs to check it
   * without calling this API.
   */
  @Get('evidence-packages/:id/export')
  async exportPackage(
    @Param('id') id: string,
    @CurrentUser() user: PublicUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const [pkg, org] = await Promise.all([
      this.prisma.evidencePackage.findFirst({ where: { id, organization_id: user.organization_id } }),
      this.prisma.organization.findUnique({ where: { id: user.organization_id }, select: { chain_org_id: true } }),
    ]);
    if (!pkg || !org) throw new NotFoundException('Package not found.');
    const cfg = this.attestations.publicConfig();
    let out;
    try {
      out = buildPackageExport(pkg, org.chain_org_id, {
        name: cfg.network, passphrase: cfg.network_passphrase, contract_id: cfg.contract_id,
      });
    } catch (e) {
      if (e instanceof PackageNotExportableError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
    await this.audit.record(user, 'package:export', 'evidence_package', id, null, { canonical_hash: pkg.canonical_hash });
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(pkg.id)}"`);
    res.setHeader('Cache-Control', 'no-store');
    return out;
  }

  @Get('reports')
  async reports(@CurrentUser() user: PublicUser) {
    return this.listPackages(user);
  }
}
