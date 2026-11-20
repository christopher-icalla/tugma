/**
 * Data for the printable audit report of a finalized package: summary,
 * control results, the exceptions and evidence the manifest lists, and the
 * on-chain attestations. Pure, so the joining rules are unit-tested.
 */
const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

type Manifest = { exceptions?: string[]; evidence?: string[]; controls?: string[] };
type Exc = { exception_code: string; control_code: string; severity: string; status: string; title: string; transaction_id: string | null; due_date: Date; verified_at: Date | null };
type Ev = { id: string; name: string; evidence_type: string; captured_at: Date; captured_by: string; content_hash: string; exception_id: string | null };
type Ctl = { control_code: string; name: string; requirement_code: string | null; regulator: string | null; run: null | { records_tested: number; passed_count: number; failed_count: number; warning_count: number; not_testable_count: number; completed_at: Date } };

export function buildReport(manifest: Manifest, exceptions: Exc[], evidence: Ev[], controls: Ctl[]) {
  const listedExc = new Set(manifest.exceptions ?? []);
  const exc = exceptions
    .filter((e) => listedExc.has(e.exception_code))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || a.exception_code.localeCompare(b.exception_code))
    .map((e) => ({ ...e, due_date: e.due_date.toISOString(), verified_at: e.verified_at?.toISOString() ?? null }));

  const count = (key: 'status' | 'severity') => {
    const out: Record<string, number> = {};
    for (const e of exc) out[e[key]] = (out[e[key]] ?? 0) + 1;
    return out;
  };

  const byId = new Map(evidence.map((e) => [e.id, e]));
  const evidenceIndex = (manifest.evidence ?? []).map((entry) => {
    const i = entry.lastIndexOf(':');
    const id = i > 0 ? entry.slice(0, i) : entry;
    const hash = i > 0 ? entry.slice(i + 1) : null;
    const ev = byId.get(id);
    return {
      id,
      hash_in_package: hash,
      name: ev?.name ?? null,
      evidence_type: ev?.evidence_type ?? null,
      captured_at: ev?.captured_at.toISOString() ?? null,
      captured_by: ev?.captured_by ?? null,
      // The record as it stands now still hashes to what the package attested.
      unchanged: !!ev && ev.content_hash === hash,
    };
  });

  const listedCtl = new Set(manifest.controls ?? []);
  const controlRows = controls
    .filter((c) => listedCtl.has(c.control_code))
    .sort((a, b) => a.control_code.localeCompare(b.control_code))
    .map((c) => ({ ...c, run: c.run && { ...c.run, completed_at: c.run.completed_at.toISOString() } }));

  return {
    controls: controlRows,
    exceptions: exc,
    exceptions_by_status: count('status'),
    exceptions_by_severity: count('severity'),
    evidence: evidenceIndex,
    evidence_changed: evidenceIndex.filter((e) => !e.unchanged).length,
  };
}
