import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { AccountSigners, attestTxHashFromEvents, requiresBoth, SorobanService, StaleTransactionError } from './soroban.service';

const HASH = 'ab'.repeat(32);
const attester = Keypair.random().publicKey();

/** The data of an `Attested` event as the contract publishes it: a map of version, hash and attester. */
const attested = (version: number, hashHex: string) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('attester'), val: nativeToScVal(attester, { type: 'address' }) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('hash'), val: xdr.ScVal.scvBytes(Buffer.from(hashHex, 'hex')) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('version'), val: nativeToScVal(version, { type: 'u32' }) }),
  ]);

/** A `Countersigned` event in the same ledger: same topics, no hash. */
const countersigned = (version: number) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('verifier'), val: nativeToScVal(attester, { type: 'address' }) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('version'), val: nativeToScVal(version, { type: 'u32' }) }),
  ]);

describe('attestTxHashFromEvents', () => {
  it('returns the transaction hash of the Attested event for that version and hash', () => {
    const events = [
      { txHash: 'tx-countersign', value: countersigned(1) },
      { txHash: 'tx-other-version', value: attested(2, 'cd'.repeat(32)) },
      { txHash: 'tx-attest', value: attested(1, HASH) },
    ];
    expect(attestTxHashFromEvents(events, 1, HASH)).toBe('tx-attest');
    expect(attestTxHashFromEvents(events, 1, HASH.toUpperCase())).toBe('tx-attest');
  });

  it('ignores events from failed calls and returns null when nothing matches', () => {
    expect(attestTxHashFromEvents([{ txHash: 'tx-failed', value: attested(1, HASH), inSuccessfulContractCall: false }], 1, HASH)).toBeNull();
    expect(attestTxHashFromEvents([{ txHash: 'tx-1', value: attested(1, HASH) }], 2, HASH)).toBeNull();
    expect(attestTxHashFromEvents([{ txHash: 'tx-c', value: countersigned(1) }], 1, HASH)).toBeNull();
    expect(attestTxHashFromEvents([], 1, HASH)).toBeNull();
  });
});

describe('requiresBoth (two-party attestation account)', () => {
  const a = Keypair.random().publicKey();
  const b = Keypair.random().publicKey();
  const account = (over: Partial<AccountSigners> = {}): AccountSigners => ({
    account_id: Keypair.random().publicKey(), sequence: '1', master_weight: 0, thresholds: { low: 2, med: 2, high: 2 },
    signers: [{ key: a, weight: 1 }, { key: b, weight: 1 }], ...over,
  });

  it('holds for two weight-1 signers, master weight 0 and thresholds of 2', () => {
    expect(requiresBoth(account(), a, b)).toBe(true);
  });

  it('fails when one key alone is enough, or both together are not', () => {
    expect(requiresBoth(account({ master_weight: 2 }), a, b)).toBe(false);
    expect(requiresBoth(account({ thresholds: { low: 1, med: 2, high: 2 } }), a, b)).toBe(false);
    expect(requiresBoth(account({ signers: [{ key: a, weight: 2 }, { key: b, weight: 1 }] }), a, b)).toBe(false);
    expect(requiresBoth(account({ thresholds: { low: 2, med: 2, high: 3 } }), a, b)).toBe(false);
    expect(requiresBoth(account({ thresholds: { low: 0, med: 0, high: 0 } }), a, b)).toBe(false);
    expect(requiresBoth(account(), a, Keypair.random().publicKey())).toBe(false);
    expect(requiresBoth(account(), a, a)).toBe(false);
  });
});

describe('submit with staleAware', () => {
  const rejected = (code: string) => {
    const svc = new SorobanService();
    (svc as unknown as { server: unknown }).server = {
      sendTransaction: async () => ({ status: 'ERROR', hash: 'h', errorResult: { result: { type: code }, toXDR: () => '' } }),
    };
    return svc;
  };
  const tx = {} as never;

  it('turns a used sequence number or passed time bounds into StaleTransactionError', async () => {
    await expect(rejected('txBadSeq').submit(tx, { staleAware: true })).rejects.toMatchObject({ reason: 'sequence' });
    await expect(rejected('txTooLate').submit(tx, { staleAware: true })).rejects.toBeInstanceOf(StaleTransactionError);
  });

  it('keeps the old message for every other caller and code', async () => {
    await expect(rejected('txBadSeq').submit(tx)).rejects.toThrow(/may have expired or the account sequence changed/);
    await expect(rejected('txBadAuth').submit(tx, { staleAware: true })).rejects.not.toBeInstanceOf(StaleTransactionError);
  });
});
