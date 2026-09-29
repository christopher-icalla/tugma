/**
 * Deterministic synthetic payment dataset for TUGMA Demo PSP.
 *
 * Generates exactly 10,000 reproducible transactions (fixed seed) for 150
 * merchants, with a precise, traceable set of injected demonstration defects.
 * Detection is performed genuinely by the control engine against transaction
 * fields — nothing here is read back as an "answer".
 */
import { DEMO_ORG_ID } from '../config';
import { round2 } from '../common/util';

export const SEED = 42;
export const TOTAL = 10_000;
const N_MERCHANTS = 150;
const FEE_RATE = 0.018;
export const HERO_TX = 'TX-847291';

/** Exact, traceable defect counts (disjoint transaction sets). */
export const DEFECT_SPEC = {
  settlement_discrepancy: 60,
  payout_threshold_breach: 7,
  duplicate_transaction: 15,
  missing_approval: 25,
  segregation_of_duty: 5,
  missing_evidence: 10,
} as const;
/** Not yet settled -> NOT_TESTABLE for CTRL-005 (genuine, not a defect). */
export const N_PENDING = 150;

const OPERATORS = Array.from({ length: 12 }, (_, i) => `opuser-${String(i + 1).padStart(2, '0')}`);
const BASE_TIME = Date.UTC(2026, 0, 1);

export type SyntheticTransaction = {
  id: string;
  organization_id: string;
  transaction_id: string;
  merchant_id: string;
  currency: string;
  transaction_amount: number;
  processor_amount: number;
  expected_settlement: number;
  actual_settlement: number | null;
  expected_payout: number;
  actual_payout: number | null;
  transaction_timestamp: Date;
  settlement_timestamp: Date | null;
  payout_timestamp: Date | null;
  payment_status: string;
  risk_status: string;
  idempotency_key: string;
  approval_status: string;
  initiated_by: string;
  approved_by: string;
  has_evidence: boolean;
  duplicate_of: string | null;
  created_at: Date;
};

/** Small seeded PRNG (mulberry32) so every environment builds the same dataset. */
class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  choice<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)];
  }
  shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }
  /** k distinct integers from [lo, hi). */
  sample(lo: number, hi: number, k: number): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    while (out.length < k) {
      const n = this.int(lo, hi - 1);
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  }
}

const minutes = (m: number) => m * 60_000;

export function generateTransactions(): SyntheticTransaction[] {
  const rng = new Rng(SEED);
  const merchants = Array.from({ length: N_MERCHANTS }, (_, i) => `MERCH-${String(i + 1).padStart(4, '0')}`);

  // Guarantee the hero demo transaction TX-847291 exists at index 0.
  const numbers = rng.sample(100_000, 1_000_000, TOTAL).filter((n) => n !== 847291);
  numbers.length = TOTAL - 1;
  numbers.unshift(847291);

  const txns: SyntheticTransaction[] = numbers.map((num, i) => {
    const ts = new Date(BASE_TIME + minutes(i * 4) + rng.int(0, 59) * 1000);
    const amount = round2(rng.uniform(500, 60_000));
    const expectedPayout = round2(amount * (1 - FEE_RATE));
    const initiator = rng.choice(OPERATORS);
    const approver = rng.choice(OPERATORS.filter((o) => o !== initiator));
    return {
      id: `txn-${num}`,
      organization_id: DEMO_ORG_ID,
      transaction_id: `TX-${num}`,
      merchant_id: rng.choice(merchants),
      currency: 'PHP',
      transaction_amount: amount,
      processor_amount: amount,
      expected_settlement: amount,
      actual_settlement: amount,
      expected_payout: expectedPayout,
      actual_payout: expectedPayout,
      transaction_timestamp: ts,
      settlement_timestamp: new Date(ts.getTime() + minutes(120)),
      payout_timestamp: new Date(ts.getTime() + minutes(24 * 60)),
      payment_status: 'SETTLED',
      risk_status: 'NORMAL',
      idempotency_key: `IK-${num}`,
      approval_status: 'APPROVED',
      initiated_by: initiator,
      approved_by: approver,
      has_evidence: true,
      duplicate_of: null,
      created_at: ts,
    };
  });

  // ---- deterministic defect assignment (disjoint indices) -----------------
  const pool = rng.shuffle(Array.from({ length: TOTAL - 1 }, (_, i) => i + 1)); // index 0 is the hero tx
  let cursor = 0;
  const take = (n: number) => pool.slice(cursor, (cursor += n));

  const settlementIdx = [0, ...take(DEFECT_SPEC.settlement_discrepancy - 1)];
  const payoutIdx = take(DEFECT_SPEC.payout_threshold_breach);
  const duplicateIdx = take(DEFECT_SPEC.duplicate_transaction);
  const approvalIdx = take(DEFECT_SPEC.missing_approval);
  const sodIdx = take(DEFECT_SPEC.segregation_of_duty);
  const evidenceIdx = take(DEFECT_SPEC.missing_evidence);
  const pendingIdx = take(N_PENDING);
  const originalIdx = take(DEFECT_SPEC.duplicate_transaction); // clean originals for duplicates

  for (const idx of settlementIdx) {
    const t = txns[idx];
    if (idx === 0) {
      // TX-847291: the exact walkthrough scenario (PHP 10,000 processed, 9,500 settled).
      Object.assign(t, {
        transaction_amount: 10_000, processor_amount: 10_000, expected_settlement: 10_000,
        actual_settlement: 9_500, expected_payout: 9_500, actual_payout: 9_500,
      });
    } else {
      t.actual_settlement = round2(t.expected_settlement - round2(rng.uniform(50, 3_500)));
    }
    t.risk_status = 'HIGH';
  }

  for (const idx of payoutIdx) {
    const t = txns[idx];
    t.actual_payout = round2(t.expected_payout - round2(rng.uniform(75, 2_500)));
    t.risk_status = 'HIGH';
  }

  // Duplicates share an idempotency key with a distinct clean original, 3 minutes later.
  duplicateIdx.forEach((d, k) => {
    const orig = txns[originalIdx[k]];
    Object.assign(txns[d], {
      merchant_id: orig.merchant_id,
      transaction_amount: orig.transaction_amount,
      processor_amount: orig.processor_amount,
      expected_settlement: orig.expected_settlement,
      actual_settlement: orig.actual_settlement,
      expected_payout: orig.expected_payout,
      actual_payout: orig.actual_payout,
      idempotency_key: orig.idempotency_key,
      duplicate_of: orig.transaction_id,
      risk_status: 'MEDIUM',
      transaction_timestamp: new Date(orig.transaction_timestamp.getTime() + minutes(3)),
    });
  });

  for (const idx of approvalIdx) {
    txns[idx].approval_status = 'MISSING';
    txns[idx].risk_status = 'MEDIUM';
  }

  for (const idx of sodIdx) {
    txns[idx].approved_by = txns[idx].initiated_by;
    txns[idx].risk_status = 'HIGH';
  }

  for (const idx of evidenceIdx) txns[idx].has_evidence = false;

  for (const idx of pendingIdx) {
    Object.assign(txns[idx], {
      payment_status: 'PENDING', actual_settlement: null, actual_payout: null,
      settlement_timestamp: null, payout_timestamp: null,
    });
  }

  return txns;
}
