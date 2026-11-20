import { buildTimeline } from './package-timeline';

const t = (s: string) => new Date(`2026-11-${s}Z`);
const pkg = { id: 'pkg-1', generated_at: t('10T01:00:00'), generated_by: 'ana@x', canonical_hash: 'ab'.repeat(32) };

describe('package timeline', () => {
  it('orders generation, attestation, countersignature and downloads, with Stellar links', () => {
    const events = buildTimeline(pkg, [
      { action: 'package:export', user_name: 'Rey', user_role: 'AUDITOR', timestamp: t('12T00:00:00'), after_state: { canonical_hash: 'ab'.repeat(32) } },
      { action: 'package:generate', user_name: 'Ana', user_role: 'COMPLIANCE', timestamp: t('10T01:00:00'), after_state: { canonical_hash: 'ab'.repeat(32) } },
      { action: 'package:attest', user_name: 'Ana', user_role: 'COMPLIANCE', timestamp: t('10T02:00:00'), after_state: {} },
      { action: 'package:sync', user_name: 'Ana', user_role: 'COMPLIANCE', timestamp: t('13T00:00:00'), after_state: { versions: 1 } },
    ], [{
      version: 1, attestation_hash: 'ab'.repeat(32), attester_name: 'Ana', attester_address: 'GANA', transaction_hash: 'f1'.repeat(32), ledger: 100,
      submitted_at: t('10T02:00:00'), verifier_name: 'Rio', verifier_address: 'GRIO', countersign_tx_hash: 'f2'.repeat(32), countersign_ledger: 120, verified_at: t('11T00:00:00'),
    }], 'https://stellar.expert/explorer/testnet/');

    expect(events.map((e) => e.kind)).toEqual(['generated', 'attested', 'countersigned', 'exported', 'synced']);
    expect(events[0]).toMatchObject({ actor: 'Ana (COMPLIANCE)', detail: `SHA-256 ${'ab'.repeat(32)}` });
    expect(events[1]).toMatchObject({ ledger: 100, link: `https://stellar.expert/explorer/testnet/tx/${'f1'.repeat(32)}`, actor: 'Ana · GANA' });
    expect(events[2]).toMatchObject({ title: 'Version 1 countersigned', ledger: 120 });
    expect(events[3]).toMatchObject({ actor: 'Rey (AUDITOR)', title: 'Package file downloaded' });
    expect(events[4].detail).toBe('1 version(s) on-chain');
  });

  it('falls back to the package row when the audit log has no generation entry', () => {
    const [e] = buildTimeline(pkg, [], [], 'https://x');
    expect(e).toMatchObject({ kind: 'generated', actor: 'ana@x', at: pkg.generated_at.toISOString() });
  });

  it('shows an attestation without a transaction hash, and no countersignature yet', () => {
    const events = buildTimeline(pkg, [], [{
      version: 2, attestation_hash: 'cd'.repeat(32), attester_name: 'Ana', attester_address: 'GANA', transaction_hash: null, ledger: 50,
      submitted_at: t('14T00:00:00'), verifier_name: null, verifier_address: null, countersign_tx_hash: null, countersign_ledger: null, verified_at: null,
    }], 'https://x');
    expect(events.map((e) => e.kind)).toEqual(['generated', 'attested']);
    expect(events[1].link).toBeNull();
  });
});
