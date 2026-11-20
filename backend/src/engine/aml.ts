/**
 * CTRL-003: AMLC covered transactions and structuring red flags.
 *
 * Pure and deterministic so it can be tested against the synthetic dataset
 * without a database. The engine turns the result into exceptions.
 */
import { COVERED_THRESHOLD } from '../seed/dataset';

/** Structuring: a merchant's same-day transactions each within this share of the threshold. */
export const STRUCTURING_BAND = 0.9;
const MANILA_OFFSET = 8 * 3_600_000;

/** Calendar date in Manila (UTC+8), YYYY-MM-DD. */
export const manilaDate = (d: Date) => new Date(d.getTime() + MANILA_OFFSET).toISOString().slice(0, 10);

export type AmlInput = { transaction_id: string; merchant_id: string; amount: number; timestamp: Date };

export type AmlFinding =
  | { transaction_id: string; defect: 'covered_transaction'; amount: number }
  | {
      transaction_id: string;
      defect: 'possible_structuring';
      amount: number;
      merchant_id: string;
      date: string;
      total: number;
      count: number;
      with: string[];
    };

/**
 * Covered: a single transaction above COVERED_THRESHOLD.
 * Structuring: two or more transactions for one merchant on one Manila day,
 * each between STRUCTURING_BAND x and 1 x the threshold, together above it.
 */
export function amlScreen(txns: AmlInput[]): Map<string, AmlFinding> {
  const out = new Map<string, AmlFinding>();
  const near = new Map<string, AmlInput[]>();
  for (const t of txns) {
    if (t.amount > COVERED_THRESHOLD) {
      out.set(t.transaction_id, { transaction_id: t.transaction_id, defect: 'covered_transaction', amount: t.amount });
    } else if (t.amount >= STRUCTURING_BAND * COVERED_THRESHOLD) {
      const key = `${t.merchant_id}|${manilaDate(t.timestamp)}`;
      near.set(key, [...(near.get(key) ?? []), t]);
    }
  }
  for (const grp of near.values()) {
    const total = Math.round(grp.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    if (grp.length < 2 || total <= COVERED_THRESHOLD) continue;
    for (const t of grp) {
      out.set(t.transaction_id, {
        transaction_id: t.transaction_id, defect: 'possible_structuring', amount: t.amount,
        merchant_id: t.merchant_id, date: manilaDate(t.timestamp), total, count: grp.length,
        with: grp.filter((x) => x !== t).map((x) => x.transaction_id).sort(),
      });
    }
  }
  return out;
}
