/**
 * Deterministic TUGMA control engine.
 *
 * Runs the five controls against the synthetic dataset and control evidence,
 * producing genuine PASS / FAIL / WARNING / NOT_TESTABLE results. Persists
 * append-only control test runs, upserts exceptions (preserving any workflow
 * status already set), writes per-transaction result flags for fast filtering,
 * and refreshes the rolling draft evidence package.
 */
import { Injectable } from '@nestjs/common';
import { PaymentTransaction, Prisma } from '@prisma/client';
import { DEMO_ORG_ID } from '../config';
import { php, sha256, shortId } from '../common/util';
import { PrismaService } from '../prisma.service';
import { HERO_TX } from '../seed/dataset';

export const TOLERANCE = 0.01; // PHP — CTRL-005 configured tolerance

type Defect =
  | 'settlement_discrepancy'
  | 'payout_threshold_breach'
  | 'duplicate_transaction'
  | 'missing_approval'
  | 'segregation_of_duty'
  | 'missing_evidence';

const SEVERITY_OF: Record<Defect, 'HIGH' | 'MEDIUM'> = {
  settlement_discrepancy: 'HIGH',
  payout_threshold_breach: 'HIGH',
  duplicate_transaction: 'MEDIUM',
  missing_approval: 'MEDIUM',
  segregation_of_duty: 'HIGH',
  missing_evidence: 'MEDIUM',
};

/** 5-state workflow spread for freshly detected demo exceptions (TX-847291 is forced OPEN). */
const WORKFLOW_CYCLE = ['OPEN', 'OPEN', 'IN_REVIEW', 'REMEDIATION', 'RESOLVED', 'VERIFIED', 'OPEN'];

type Explanation = {
  check: string;
  expected: string;
  actual: string;
  variance: string | null;
  tolerance: string;
  result: 'FAILED' | 'WARNING';
  narrative: string;
};

type Finding = { code: string; tx: PaymentTransaction; defect: Defect; explanation: Explanation };

type Counts = {
  records_tested: number;
  passed_count: number;
  failed_count: number;
  warning_count: number;
  not_testable_count: number;
};

const explain = (
  check: string, expected: string, actual: string, variance: number | null,
  result: Explanation['result'], narrative: string,
): Explanation => ({
  check, expected, actual,
  variance: variance === null ? null : php(variance),
  tolerance: variance === null ? 'n/a' : `${TOLERANCE.toFixed(2)} PHP`,
  result, narrative,
});

const DAY = 86_400_000;
const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());

@Injectable()
export class EngineService {
  constructor(private readonly prisma: PrismaService) {}

  async runAllControls(triggeredBy = 'system') {
    const started = new Date();
    const orgId = DEMO_ORG_ID;
    const txns = await this.prisma.paymentTransaction.findMany({ where: { organization_id: orgId } });

    // Genuine duplicate detection: group by idempotency key, flag all but the earliest.
    const groups = new Map<string, PaymentTransaction[]>();
    for (const t of txns) groups.set(t.idempotency_key, [...(groups.get(t.idempotency_key) ?? []), t]);
    const duplicateIds = new Set<string>();
    for (const grp of groups.values()) {
      if (grp.length < 2) continue;
      grp.sort((a, b) => a.transaction_timestamp.getTime() - b.transaction_timestamp.getTime());
      grp.slice(1).forEach((d) => duplicateIds.add(d.transaction_id));
    }

    const findings: Finding[] = [];
    const counts = new Map<string, Counts>();
    const bump = (code: string, key: keyof Counts) => {
      const c = counts.get(code) ?? { records_tested: 0, passed_count: 0, failed_count: 0, warning_count: 0, not_testable_count: 0 };
      c[key] += 1;
      counts.set(code, c);
    };
    const fail = (code: string, tx: PaymentTransaction, defect: Defect, explanation: Explanation) => {
      bump(code, explanation.result === 'WARNING' ? 'warning_count' : 'failed_count');
      findings.push({ code, tx, defect, explanation });
    };

    // ---- CTRL-005 Settlement Reconciliation (per transaction) ------------
    for (const t of txns) {
      bump('CTRL-005', 'records_tested');
      const actualSettlement = num(t.actual_settlement);
      const actualPayout = num(t.actual_payout);
      if (t.payment_status !== 'SETTLED' || actualSettlement === null || actualPayout === null) {
        bump('CTRL-005', 'not_testable_count');
        continue;
      }
      const expectedSettlement = t.expected_settlement.toNumber();
      const expectedPayout = t.expected_payout.toNumber();
      const settleVar = t.expected_settlement.minus(t.actual_settlement!).toNumber();
      const payoutVar = t.expected_payout.minus(t.actual_payout!).toNumber();
      if (Math.abs(settleVar) > TOLERANCE) {
        fail('CTRL-005', t, 'settlement_discrepancy', explain(
          'Settlement variance', php(expectedSettlement), php(actualSettlement), settleVar, 'FAILED',
          'Actual settlement differs from processor amount beyond the configured tolerance.'));
      } else if (Math.abs(payoutVar) > TOLERANCE) {
        fail('CTRL-005', t, 'payout_threshold_breach', explain(
          'Payout variance', php(expectedPayout), php(actualPayout), payoutVar, 'FAILED',
          'Actual merchant payout differs from expected payout beyond the configured tolerance.'));
      } else if (duplicateIds.has(t.transaction_id)) {
        fail('CTRL-005', t, 'duplicate_transaction', explain(
          'Duplicate transaction', 'Unique idempotency key', `Duplicate of ${t.duplicate_of}`, null, 'FAILED',
          'A second transaction shares an idempotency key with an earlier settled transaction.'));
      } else {
        bump('CTRL-005', 'passed_count');
      }
    }

    // ---- CTRL-002 IT Risk Control Evidence (authorization / SoD) ---------
    for (const t of txns) {
      bump('CTRL-002', 'records_tested');
      if (t.approval_status === 'MISSING') {
        fail('CTRL-002', t, 'missing_approval', explain(
          'Authorization evidence', 'Approval recorded', 'No approval on file', null, 'FAILED',
          'Transaction was processed without a recorded authorization.'));
      } else if (t.initiated_by === t.approved_by) {
        fail('CTRL-002', t, 'segregation_of_duty', explain(
          'Segregation of duties', 'Initiator ≠ approver', `${t.initiated_by} initiated and approved`, null, 'FAILED',
          'The same operator both initiated and approved the transaction.'));
      } else {
        bump('CTRL-002', 'passed_count');
      }
    }

    // ---- CTRL-004 Merchant / End-User Protection (evidence completeness) -
    for (const t of txns) {
      bump('CTRL-004', 'records_tested');
      if (!t.has_evidence) {
        fail('CTRL-004', t, 'missing_evidence', explain(
          'Supporting evidence', 'Evidence record attached', 'No evidence record', null, 'WARNING',
          'Required supporting evidence for this transaction is missing.'));
      } else {
        bump('CTRL-004', 'passed_count');
      }
    }

    // ---- CTRL-001 Critical Third-Party Oversight (vendor evidence) -------
    for (const v of await this.prisma.vendor.findMany({ where: { organization_id: orgId } })) {
      bump('CTRL-001', 'records_tested');
      bump('CTRL-001', v.due_diligence_status === 'CURRENT' ? 'passed_count' : 'warning_count');
    }

    // ---- CTRL-003 AML/CTPF Control Evidence (program evidence absent) ----
    bump('CTRL-003', 'records_tested');
    bump('CTRL-003', 'not_testable_count');

    const completed = new Date();
    const controls = await this.prisma.control.findMany({ where: { organization_id: orgId } });
    const controlByCode = new Map(controls.map((c) => [c.control_code, c]));
    const owners = new Map<string, { id: string; name: string }>();
    for (const u of await this.prisma.user.findMany({ where: { organization_id: orgId }, orderBy: { created_at: 'asc' } })) {
      if (!owners.has(u.role)) owners.set(u.role, u);
    }

    // ---- persist append-only control test runs ---------------------------
    const runIds = new Map<string, string>();
    await this.prisma.controlTestRun.createMany({
      data: [...counts].map(([code, c]) => {
        const id = shortId('run');
        runIds.set(code, id);
        return {
          id, organization_id: orgId, control_id: controlByCode.get(code)?.id ?? null, control_code: code,
          control_test_id: `tst-${code.toLowerCase()}`, started_at: started, completed_at: completed,
          ...c, status: 'COMPLETED', triggered_by: triggeredBy,
          execution_metadata: { engine: 'deterministic', seed: 42, tolerance: TOLERANCE },
        };
      }),
    });

    // ---- upsert exceptions (preserve existing workflow status) -----------
    const existing = new Set(
      (await this.prisma.controlException.findMany({ where: { organization_id: orgId }, select: { exception_code: true } }))
        .map((e) => e.exception_code),
    );
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    findings.forEach(({ code, tx, defect, explanation }, i) => {
      const ctl = controlByCode.get(code);
      const exceptionCode = `EXC-${code}-${tx.transaction_id}`;
      const detected = {
        control_id: ctl?.id ?? null, control_code: code, control_test_run_id: runIds.get(code) ?? null,
        transaction_id: tx.transaction_id, defect_type: defect,
        title: `${explanation.check} — ${tx.transaction_id}`, description: explanation.narrative,
        explanation, severity: SEVERITY_OF[defect], updated_at: completed,
      };
      if (existing.has(exceptionCode)) {
        writes.push(this.prisma.controlException.update({ where: { exception_code: exceptionCode }, data: detected }));
        return;
      }
      const status = tx.transaction_id === HERO_TX ? 'OPEN' : WORKFLOW_CYCLE[i % WORKFLOW_CYCLE.length];
      const owner = ctl ? owners.get(ctl.owner_role) : undefined;
      const due = new Date(started.getTime() + 5 * DAY);
      writes.push(this.prisma.controlException.create({
        data: {
          ...detected, id: shortId('exc'), organization_id: orgId, exception_code: exceptionCode, status,
          detected_at: started, due_date: due, owner_role: ctl?.owner_role ?? null,
          owner_id: owner?.id ?? null, owner_name: owner?.name ?? null,
          // keep resolved/verified timestamps coherent for freshly seeded states
          resolved_at: status === 'RESOLVED' || status === 'VERIFIED' ? new Date(started.getTime() + DAY) : null,
          verified_at: status === 'VERIFIED' ? new Date(started.getTime() + 2 * DAY) : null,
        },
      }));
      writes.push(this.prisma.remediationAction.upsert({
        where: { exception_code: exceptionCode },
        update: {},
        create: {
          id: shortId('rem'), exception_code: exceptionCode,
          action: `Investigate and remediate: ${explanation.check.toLowerCase()}`,
          owner_role: ctl?.owner_role ?? null, due_date: due, status: 'PENDING',
        },
      }));
    });

    // ---- per-transaction result flags ------------------------------------
    // Reset everything to its clean result, then flag the handful that failed.
    writes.push(this.prisma.paymentTransaction.updateMany({
      where: { organization_id: orgId },
      data: { has_exception: false, failed_controls: [], defect_types: [], exception_severity: 'NORMAL', test_status: 'PASS' },
    }));
    writes.push(this.prisma.paymentTransaction.updateMany({
      where: { organization_id: orgId, payment_status: { not: 'SETTLED' } },
      data: { test_status: 'NOT_TESTABLE' },
    }));
    const flags = new Map<string, { controls: Set<string>; defects: Set<string>; severity: string }>();
    for (const f of findings) {
      const entry = flags.get(f.tx.transaction_id) ?? { controls: new Set(), defects: new Set(), severity: 'NORMAL' };
      entry.controls.add(f.code);
      entry.defects.add(f.defect);
      const sev = SEVERITY_OF[f.defect];
      entry.severity = sev === 'HIGH' || entry.severity === 'HIGH' ? 'HIGH' : 'MEDIUM';
      flags.set(f.tx.transaction_id, entry);
    }
    for (const [transaction_id, f] of flags) {
      const failed = [...f.controls].sort();
      writes.push(this.prisma.paymentTransaction.update({
        where: { transaction_id },
        data: {
          has_exception: true, failed_controls: failed, defect_types: [...f.defects].sort(),
          test_status: failed.length === 1 && failed[0] === 'CTRL-004' ? 'WARNING' : 'FAIL',
          exception_severity: f.severity,
        },
      }));
    }
    await this.prisma.$transaction(writes);

    await this.buildDraftPackage(started);

    return {
      runs: Object.fromEntries(counts),
      exceptions: findings.length,
      run_ids: Object.fromEntries(runIds),
      started_at: started.toISOString(),
    };
  }

  /** Rolling Q1 draft package (summary hash) shown before a package is generated. */
  async buildDraftPackage(generatedAt: Date) {
    const orgId = DEMO_ORG_ID;
    const [totalTx, totalExc, withEvidence, evidenceCount] = await Promise.all([
      this.prisma.paymentTransaction.count({ where: { organization_id: orgId } }),
      this.prisma.controlException.count({ where: { organization_id: orgId } }),
      this.prisma.evidence.findMany({
        where: { organization_id: orgId, exception_id: { not: null } },
        distinct: ['exception_id'], select: { exception_id: true },
      }),
      this.prisma.evidence.count({ where: { organization_id: orgId } }),
    ]);
    const readiness = totalExc ? Math.round((100 * withEvidence.length) / totalExc) : 0;
    const canonical = sha256(`tugma|tx=${totalTx}|exc=${totalExc}|ev_exc=${withEvidence.length}|evidence=${evidenceCount}`);
    const data = {
      organization_id: orgId, name: 'Q1 2026 Control Evidence Package', period_start: '2026-01-01',
      period_end: '2026-03-31', controls_count: 5, transactions_count: totalTx, exceptions_count: totalExc,
      evidence_count: evidenceCount, completeness_score: readiness, canonical_hash: canonical,
      generated_at: generatedAt, status: 'DRAFT',
    };
    await this.prisma.evidencePackage.upsert({ where: { id: 'pkg-2026-q1' }, update: data, create: { id: 'pkg-2026-q1', ...data } });
  }
}
