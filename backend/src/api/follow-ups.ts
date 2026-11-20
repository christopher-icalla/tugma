/**
 * Follow-ups: open exceptions past their due date, grouped by how late they
 * are, and attestations still waiting for a countersignature. Pure, so the
 * rules are unit-tested without a database.
 */
export const OPEN_STATES = ['OPEN', 'IN_REVIEW', 'REMEDIATION'];
const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const DAY = 86_400_000;

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

export type AgeingBucket = 'not_due' | 'overdue_1_7' | 'overdue_8_30' | 'overdue_30_plus';

export function bucketOf(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return 'not_due';
  if (daysOverdue <= 7) return 'overdue_1_7';
  if (daysOverdue <= 30) return 'overdue_8_30';
  return 'overdue_30_plus';
}

type ExceptionRow = {
  exception_code: string; title: string; severity: string; status: string; due_date: Date;
  owner_id: string | null; owner_name: string | null; owner_role: string | null;
};
type AttestationRow = {
  evidence_package_id: string; version: number; attester_name: string; attester_user_id: string | null;
  submitted_at: Date; verifier_address: string | null;
};

export function followUps(now: Date, exceptions: ExceptionRow[], attestations: AttestationRow[]) {
  const ageing: Record<AgeingBucket, number> = { not_due: 0, overdue_1_7: 0, overdue_8_30: 0, overdue_30_plus: 0 };
  const overdue = [];
  for (const e of exceptions) {
    if (!OPEN_STATES.includes(e.status)) continue;
    const days = daysBetween(e.due_date, now);
    const bucket = bucketOf(days);
    ageing[bucket] += 1;
    if (bucket !== 'not_due') {
      overdue.push({
        exception_code: e.exception_code, title: e.title, severity: e.severity, status: e.status,
        due_date: e.due_date.toISOString(), days_overdue: days, bucket,
        owner_id: e.owner_id, owner_name: e.owner_name, owner_role: e.owner_role,
      });
    }
  }
  overdue.sort((a, b) => b.days_overdue - a.days_overdue
    || (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
    || a.exception_code.localeCompare(b.exception_code));

  const awaiting_countersign = attestations
    .filter((a) => !a.verifier_address)
    .map((a) => ({
      evidence_package_id: a.evidence_package_id, version: a.version, attester_name: a.attester_name,
      attester_user_id: a.attester_user_id, submitted_at: a.submitted_at.toISOString(),
      days_waiting: Math.max(0, daysBetween(a.submitted_at, now)),
    }))
    .sort((a, b) => b.days_waiting - a.days_waiting || a.evidence_package_id.localeCompare(b.evidence_package_id));

  return { as_of: now.toISOString(), ageing, overdue, awaiting_countersign };
}

/** One reminder email per person: their overdue exceptions and packages to countersign. */
export type Reminder = { user_id: string; overdue: string[]; countersign: string[] };

export function planReminders(
  f: ReturnType<typeof followUps>,
  countersigners: { id: string }[],
): Reminder[] {
  const by = new Map<string, Reminder>();
  const get = (id: string) => {
    if (!by.has(id)) by.set(id, { user_id: id, overdue: [], countersign: [] });
    return by.get(id)!;
  };
  for (const e of f.overdue) {
    if (e.owner_id) get(e.owner_id).overdue.push(`${e.exception_code} (${e.severity}, ${e.days_overdue} day(s) overdue): ${e.title}`);
  }
  for (const a of f.awaiting_countersign) {
    // The contract refuses a countersignature from the attesting wallet, so never ask the attester.
    for (const u of countersigners) {
      if (u.id !== a.attester_user_id) get(u.id).countersign.push(`${a.evidence_package_id} v${a.version}, attested by ${a.attester_name} ${a.days_waiting} day(s) ago`);
    }
  }
  return [...by.values()];
}
