import { Account, Keypair, Networks, StrKey } from '@stellar/stellar-sdk';

// Plain Node script (scripts/create-attestation-account.js), loaded as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const setup = require('../scripts/create-attestation-account.js');

const tugma = Keypair.random().publicKey();
const reviewer = Keypair.random().publicKey();
const accountId = Keypair.random().publicKey();
const build = (over: Record<string, unknown> = {}) =>
  setup.buildSetupTransaction({ account: new Account(accountId, '100'), tugmaSigner: tugma, reviewer, networkPassphrase: Networks.TESTNET, ...over });

describe('two-party attestation account setup (setOptions builder)', () => {
  it('labels both signers, adds them with weight 1, and makes both keys required', () => {
    const tx = build();
    expect(tx.source).toBe(accountId);
    const ops = tx.operations as Array<Record<string, unknown>>;
    expect(ops.map((o) => o.type)).toEqual(['manageData', 'manageData', 'setOptions', 'setOptions', 'setOptions']);
    expect(ops[0]).toMatchObject({ name: 'tugma.signer.tugma' });
    expect(StrKey.encodeEd25519PublicKey(ops[0].value as Buffer)).toBe(tugma);
    expect(ops[1]).toMatchObject({ name: 'tugma.signer.reviewer' });
    expect(StrKey.encodeEd25519PublicKey(ops[1].value as Buffer)).toBe(reviewer);
    expect(ops[2].signer).toEqual({ ed25519PublicKey: tugma, weight: 1 });
    expect(ops[3].signer).toEqual({ ed25519PublicKey: reviewer, weight: 1 });
    expect(ops[4]).toMatchObject({ masterWeight: 0, lowThreshold: 2, medThreshold: 2, highThreshold: 2 });
  });

  it('refuses any network but Testnet, and bad or duplicate keys', () => {
    expect(() => build({ networkPassphrase: Networks.PUBLIC })).toThrow(/Testnet only/);
    expect(() => build({ reviewer: tugma })).toThrow(/different keys/);
    expect(() => build({ reviewer: 'not-a-key' })).toThrow(/public key/);
    expect(() => build({ tugmaSigner: accountId })).toThrow(/must differ/);
  });

  it('accepts public keys only on the command line', () => {
    expect(() => setup.parseArgs(['--tugma-signer', Keypair.random().secret(), '--reviewer', reviewer])).toThrow(/secret key/);
    expect(() => setup.parseArgs(['--tugma-signer', tugma])).toThrow(/--reviewer/);
    expect(setup.parseArgs(['--self-test'])).toEqual({ selfTest: true });
  });

  it('reads an account back from Horizon and says whether both keys are required', () => {
    const label = (k: string) => Buffer.from(StrKey.decodeEd25519PublicKey(k)).toString('base64');
    const horizon = (masterWeight: number, med: number) => ({
      account_id: accountId,
      signers: [
        { key: tugma, weight: 1, type: 'ed25519_public_key' },
        { key: reviewer, weight: 1, type: 'ed25519_public_key' },
        { key: accountId, weight: masterWeight, type: 'ed25519_public_key' },
      ],
      thresholds: { low_threshold: 2, med_threshold: med, high_threshold: 2 },
      data: { 'tugma.signer.tugma': label(tugma), 'tugma.signer.reviewer': label(reviewer) },
    });
    const good = setup.describeAccount(horizon(0, 2), tugma, reviewer);
    expect(good).toMatchObject({ requires_both: true, thresholds: { low: 2, med: 2, high: 2 }, labels: { tugma, reviewer } });
    expect(setup.describeAccount(horizon(1, 2), tugma, reviewer).requires_both).toBe(false); // master key still active
    expect(setup.describeAccount(horizon(0, 1), tugma, reviewer).requires_both).toBe(false); // one key reaches medium
  });
});
