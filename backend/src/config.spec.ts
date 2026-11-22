import { Keypair } from '@stellar/stellar-sdk';
import { configSchema, multisigSettings } from './config';

const base = {
  DATABASE_URL: 'postgresql://localhost/tugma_test',
  JWT_SECRET: 'x'.repeat(48),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'a-strong-admin-password',
  DEMO_USER_PASSWORD: 'a-strong-demo-password',
};

describe('config validation', () => {
  it('accepts strong secrets and defaults to SameSite=Lax without proxy trust', () => {
    const cfg = configSchema.parse(base);
    expect(cfg).toMatchObject({ COOKIE_SAMESITE: 'lax', TRUST_PROXY: 0, COOKIE_SECURE: true });
  });

  it.each([
    ['ADMIN_PASSWORD', 'change-me'],
    ['DEMO_USER_PASSWORD', 'change-me'],
    ['DEMO_USER_PASSWORD', 'short'],
    ['JWT_SECRET', 'change-me-to-a-long-random-string'],
    ['JWT_SECRET', 'too-short'],
  ])('rejects %s=%s', (key, value) => {
    expect(configSchema.safeParse({ ...base, [key]: value }).success).toBe(false);
  });

  it('is Testnet-only: rejects a Mainnet network name or passphrase', () => {
    expect(configSchema.safeParse({ ...base, STELLAR_NETWORK: 'PUBLIC' }).success).toBe(false);
    expect(
      configSchema.safeParse({ ...base, STELLAR_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015' }).success,
    ).toBe(false);
    expect(configSchema.parse({ ...base, STELLAR_NETWORK: 'testnet' }).STELLAR_NETWORK_PASSPHRASE).toBe(
      'Test SDF Network ; September 2015',
    );
  });
});

describe('two-party attestation settings', () => {
  const account = Keypair.random().publicKey();
  const reviewer = Keypair.random().publicKey();
  const secret = Keypair.random().secret();
  const all = { MULTISIG_ATTESTATION_ACCOUNT: account, MULTISIG_TUGMA_SIGNER_SECRET: secret, MULTISIG_REVIEWER_PUBLIC_KEY: reviewer };

  it('is off when none are set, including blank values from .env.example', () => {
    expect(multisigSettings(configSchema.parse(base))).toBeNull();
    expect(multisigSettings(configSchema.parse({ ...base, MULTISIG_ATTESTATION_ACCOUNT: '', MULTISIG_TUGMA_SIGNER_SECRET: ' ', MULTISIG_REVIEWER_PUBLIC_KEY: '' }))).toBeNull();
  });

  it('is on with all three, with a 24-hour signing window by default', () => {
    expect(multisigSettings(configSchema.parse({ ...base, ...all }))).toEqual({ account, tugmaSecret: secret, reviewer, ttlHours: 24 });
  });

  it('refuses a partial setup, swapped key types and a reused key', () => {
    expect(() => multisigSettings(configSchema.parse({ ...base, MULTISIG_ATTESTATION_ACCOUNT: account }))).toThrow(/all of/);
    const swapped = configSchema.safeParse({ ...base, ...all, MULTISIG_TUGMA_SIGNER_SECRET: reviewer, MULTISIG_REVIEWER_PUBLIC_KEY: secret });
    expect(swapped.success).toBe(false);
    // Errors name the setting but never echo its value.
    expect(JSON.stringify(swapped.error)).not.toContain(secret);
    expect(() => multisigSettings(configSchema.parse({ ...base, ...all, MULTISIG_REVIEWER_PUBLIC_KEY: account }))).toThrow(/must differ/);
  });
});
