/**
 * One package's history in time order: generated, exported, attested and
 * countersigned on Stellar (with transaction links), and synced from the
 * contract. Attestation events come from the attestation rows, which carry
 * the transaction hash and ledger; the rest come from the audit log, including
 * the two-party (multisig) steps: signed by TUGMA, then by the reviewer.
 */
type Pkg = { id: string; generated_at: Date; generated_by: string | null; canonical_hash: string };
type Audit = { action: string; user_name: string | null; user_role: string | null; timestamp: Date; after_state: unknown };
type Attestation = {
  version: number; attestation_hash: string; attester_name: string; attester_address: string;
  transaction_hash: string | null; ledger: number; submitted_at: Date;
  verifier_name: string | null; verifier_address: string | null;
  countersign_tx_hash: string | null; countersign_ledger: number | null; verified_at: Date | null;
  verification_status?: string; multisig_signers?: unknown;
};

export type TimelineEvent = {
  at: string;
  kind: 'generated' | 'exported' | 'cosign' | 'attested' | 'countersigned' | 'synced';
  title: string;
  actor: string | null;
  detail: string | null;
  tx_hash: string | null;
  ledger: number | null;
  link: string | null;
};

const ORDER: Record<TimelineEvent['kind'], number> = { generated: 0, cosign: 1, attested: 2, countersigned: 3, synced: 4, exported: 5 };
const field = (v: unknown, k: string) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined);

export function buildTimeline(pkg: Pkg, audits: Audit[], attestations: Attestation[], explorerUrl: string): TimelineEvent[] {
  const tx = (hash: string | null) => (hash ? `${explorerUrl.replace(/\/+$/, '')}/tx/${hash}` : null);
  const events: TimelineEvent[] = [];
  const who = (a: Audit) => (a.user_name ? `${a.user_name}${a.user_role ? ` (${a.user_role})` : ''}` : null);

  const generated = audits.filter((a) => a.action === 'package:generate');
  if (generated.length === 0) {
    events.push({ at: pkg.generated_at.toISOString(), kind: 'generated', title: 'Package generated', actor: pkg.generated_by, detail: `SHA-256 ${pkg.canonical_hash}`, tx_hash: null, ledger: null, link: null });
  }
  for (const a of audits) {
    const hash = field(a.after_state, 'canonical_hash');
    if (a.action === 'package:generate') {
      events.push({ at: a.timestamp.toISOString(), kind: 'generated', title: 'Package generated', actor: who(a), detail: typeof hash === 'string' ? `SHA-256 ${hash}` : null, tx_hash: null, ledger: null, link: null });
    } else if (a.action === 'package:export') {
      events.push({ at: a.timestamp.toISOString(), kind: 'exported', title: 'Package file downloaded', actor: who(a), detail: typeof hash === 'string' ? `SHA-256 ${hash}` : null, tx_hash: null, ledger: null, link: null });
    } else if (a.action === 'package:report') {
      events.push({ at: a.timestamp.toISOString(), kind: 'exported', title: 'Audit report opened', actor: who(a), detail: null, tx_hash: null, ledger: null, link: null });
    } else if (a.action === 'package:cosign-request') {
      const account = field(a.after_state, 'attestation_account');
      const expires = field(a.after_state, 'expires_at');
      events.push({
        at: a.timestamp.toISOString(), kind: 'cosign', title: 'Signed by TUGMA, awaiting reviewer signature', actor: who(a),
        detail: typeof account === 'string' ? `Attestation account ${account}${typeof expires === 'string' ? ` · reviewer can sign until ${expires}` : ''}` : null,
        tx_hash: null, ledger: null, link: null,
      });
    } else if (a.action === 'package:cosign') {
      const signers = field(a.after_state, 'signers');
      const reviewer = field(signers, 'reviewer');
      const hashTx = field(a.after_state, 'transaction_hash');
      const ledger = field(a.after_state, 'ledger');
      events.push({
        at: a.timestamp.toISOString(), kind: 'cosign', title: 'Signed by the independent reviewer',
        actor: typeof reviewer === 'string' ? `Independent reviewer · ${reviewer}` : who(a), detail: null,
        tx_hash: typeof hashTx === 'string' ? hashTx : null, ledger: typeof ledger === 'number' ? ledger : null,
        link: typeof hashTx === 'string' ? tx(hashTx) : null,
      });
    } else if (a.action === 'package:sync') {
      const n = field(a.after_state, 'versions');
      events.push({ at: a.timestamp.toISOString(), kind: 'synced', title: 'Synced from the contract', actor: who(a), detail: typeof n === 'number' ? `${n} version(s) on-chain` : null, tx_hash: null, ledger: null, link: null });
    }
  }
  for (const s of attestations) {
    const cosigned = s.verification_status === 'CO_SIGNED' || Array.isArray(s.multisig_signers);
    const signers = Array.isArray(s.multisig_signers) ? (s.multisig_signers as { role?: string; key?: string }[]) : [];
    const keyOf = (role: string) => signers.find((x) => x.role === role)?.key;
    events.push({
      at: s.submitted_at.toISOString(), kind: 'attested',
      title: cosigned ? `Version ${s.version} attested on Stellar by TUGMA and the reviewer (2-of-2)` : `Version ${s.version} attested on Stellar`,
      actor: cosigned && signers.length
        ? `TUGMA ${keyOf('tugma')} + reviewer ${keyOf('reviewer')} · account ${s.attester_address}`
        : `${s.attester_name} · ${s.attester_address}`,
      detail: `SHA-256 ${s.attestation_hash}`,
      tx_hash: s.transaction_hash, ledger: s.ledger, link: tx(s.transaction_hash),
    });
    if (s.verified_at) {
      events.push({
        at: s.verified_at.toISOString(), kind: 'countersigned', title: `Version ${s.version} countersigned`,
        actor: `${s.verifier_name ?? 'Unknown'} · ${s.verifier_address ?? ''}`, detail: null,
        tx_hash: s.countersign_tx_hash, ledger: s.countersign_ledger, link: tx(s.countersign_tx_hash),
      });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || ORDER[a.kind] - ORDER[b.kind]);
}
