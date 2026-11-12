import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { attestTxHashFromEvents } from './soroban.service';

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
