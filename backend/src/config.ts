import { StrKey } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? 'true').toLowerCase() !== 'false');

// Placeholders from .env.example. Refuse to seed accounts with them.
const PLACEHOLDERS = new Set(['change-me', 'change-me-to-a-long-random-string']);
// SHA-256 of passwords that were once committed to this public repository (kept
// hashed so the values themselves aren't republished here).
const LEAKED_SHA256 = new Set([
  '0223e3a4aef3f0cb763e802f7f0aae6d2a00d8860862224652873d63264bf3fa',
  'baf3f9790c0382cc9b5a01b66916ec4a2944eccf27dca21bb8d293e6bac1a436',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
]);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const isKnownBad = (v: string) => PLACEHOLDERS.has(v) || LEAKED_SHA256.has(sha256(v));

const password = (name: string) =>
  z
    .string()
    .min(12, `${name} must be at least 12 characters`)
    .refine((v) => !isKnownBad(v), `${name} is a placeholder or a leaked password; choose a new one`);

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8001),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: bool,
  // "lax" when the web app and API share a site (e.g. tugmaapp.com + api.tugmaapp.com);
  // "none" only if they are on different sites. Lax blocks cross-site form posts.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // Number of reverse proxies in front of the API (0 = none). Only trust
  // X-Forwarded-For when a proxy you control sets it, or clients can spoof their IP.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((v) => !isKnownBad(v), 'JWT_SECRET is still the placeholder'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: password('ADMIN_PASSWORD'),
  DEMO_USER_PASSWORD: password('DEMO_USER_PASSWORD'),
  EMAIL_API_URL: z.string().optional().default(''),
  EMAIL_API_KEY: z.string().optional().default(''),
  EMAIL_FROM_NAME: z.string().optional().default('TUGMA'),
  // Daily control run at this Manila time (HH:MM, 24-hour), or "off".
  CONTROL_SCHEDULE: z
    .string()
    .default('02:00')
    .refine((v) => /^(off|([01]\d|2[0-3]):[0-5]\d)$/.test(v), 'CONTROL_SCHEDULE must be HH:MM (Manila time) or "off"'),
  // After each scheduled run, email follow-up reminders (needs email configured).
  SCHEDULE_REMINDERS: z
    .string()
    .optional()
    .transform((v) => (v ?? 'false').toLowerCase() === 'true'),
  // Testnet only: TUGMA attests synthetic demonstration packages and is not
  // production financial infrastructure. Refuse to start against any other
  // network rather than risk a Mainnet transaction. The passphrase decides
  // which network a signed transaction is valid on, so it is checked too.
  STELLAR_NETWORK: z
    .string()
    .default('TESTNET')
    .refine((v) => v.toUpperCase() === 'TESTNET', 'STELLAR_NETWORK must be TESTNET; TUGMA does not run on Mainnet'),
  STELLAR_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .default(TESTNET_PASSPHRASE)
    .refine((v) => v === TESTNET_PASSPHRASE, `STELLAR_NETWORK_PASSPHRASE must be the Testnet passphrase ("${TESTNET_PASSPHRASE}")`),
  STELLAR_CONTRACT_ID: z
    .string()
    .regex(/^C[A-Z2-7]{55}$/, 'STELLAR_CONTRACT_ID must be a Soroban contract id (C...)')
    .default('CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH'),
  STELLAR_EXPLORER_URL: z.string().default('https://stellar.expert/explorer/testnet'),
  // Two-party (multisig) attestation, off unless all three are set. The
  // attestation account needs both TUGMA's key and the reviewer's key to sign
  // (scripts/create-attestation-account.js). The reviewer's secret key never
  // reaches TUGMA: only its public key is configured.
  MULTISIG_ATTESTATION_ACCOUNT: optionalKey('MULTISIG_ATTESTATION_ACCOUNT', (v) => StrKey.isValidEd25519PublicKey(v), 'a Stellar account id (G...)'),
  MULTISIG_TUGMA_SIGNER_SECRET: optionalKey('MULTISIG_TUGMA_SIGNER_SECRET', (v) => StrKey.isValidEd25519SecretSeed(v), 'a Stellar secret key (S...)'),
  MULTISIG_REVIEWER_PUBLIC_KEY: optionalKey('MULTISIG_REVIEWER_PUBLIC_KEY', (v) => StrKey.isValidEd25519PublicKey(v), 'a Stellar public key (G...)'),
  // How long the reviewer has to sign a prepared attestation (its time bounds).
  MULTISIG_COSIGN_TTL_HOURS: z.coerce.number().positive().max(24 * 30).default(24),
});

export type Config = z.infer<typeof configSchema>;

/** An optional key-shaped setting; blank counts as unset. The value is never echoed in errors. */
function optionalKey(name: string, valid: (v: string) => boolean, what: string) {
  return z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine((v) => v === undefined || valid(v), `${name} must be ${what}`);
}

export type MultisigSettings = { account: string; tugmaSecret: string; reviewer: string; ttlHours: number };

/**
 * Two-party attestation settings, or null when the feature is off (none of the
 * three keys set). Setting only some of them, or reusing one key in two roles,
 * is a configuration error rather than a silent fallback.
 */
export function multisigSettings(cfg: Config = config()): MultisigSettings | null {
  const { MULTISIG_ATTESTATION_ACCOUNT: account, MULTISIG_TUGMA_SIGNER_SECRET: tugmaSecret, MULTISIG_REVIEWER_PUBLIC_KEY: reviewer } = cfg;
  const set = [account, tugmaSecret, reviewer].filter(Boolean).length;
  if (set === 0) return null;
  if (set !== 3) {
    throw new Error(
      'Two-party attestation needs all of MULTISIG_ATTESTATION_ACCOUNT, MULTISIG_TUGMA_SIGNER_SECRET and ' +
        'MULTISIG_REVIEWER_PUBLIC_KEY, or none of them.',
    );
  }
  if (account === reviewer) throw new Error('MULTISIG_REVIEWER_PUBLIC_KEY must differ from MULTISIG_ATTESTATION_ACCOUNT.');
  return { account: account!, tugmaSecret: tugmaSecret!, reviewer: reviewer!, ttlHours: cfg.MULTISIG_COSIGN_TTL_HOURS };
}

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n  ${issues.join('\n  ')}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Fixed identifier for the single synthetic demonstration organization. */
export const DEMO_ORG_ID = 'org-tugma-demo-psp';
