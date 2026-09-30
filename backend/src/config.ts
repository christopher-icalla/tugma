import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? 'true').toLowerCase() !== 'false');

// Placeholders from .env.example and passwords that were once committed to this
// public repository. Refuse to seed accounts with them.
const KNOWN_BAD_SECRETS = new Set([
  'change-me',
  'change-me-to-a-long-random-string',
  'TugmaAdmin!2026',
  'TugmaDemo!2026',
  'admin123',
]);

const password = (name: string) =>
  z
    .string()
    .min(12, `${name} must be at least 12 characters`)
    .refine((v) => !KNOWN_BAD_SECRETS.has(v), `${name} is a placeholder or a leaked password; choose a new one`);

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
    .refine((v) => !KNOWN_BAD_SECRETS.has(v), 'JWT_SECRET is still the placeholder'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: password('ADMIN_PASSWORD'),
  DEMO_USER_PASSWORD: password('DEMO_USER_PASSWORD'),
  EMAIL_API_URL: z.string().optional().default(''),
  EMAIL_API_KEY: z.string().optional().default(''),
  EMAIL_FROM_NAME: z.string().optional().default('TUGMA'),
  STELLAR_NETWORK: z.string().default('TESTNET'),
  STELLAR_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  STELLAR_CONTRACT_ID: z
    .string()
    .regex(/^C[A-Z2-7]{55}$/, 'STELLAR_CONTRACT_ID must be a Soroban contract id (C...)')
    .default('CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH'),
  STELLAR_EXPLORER_URL: z.string().default('https://stellar.expert/explorer/testnet'),
});

export type Config = z.infer<typeof configSchema>;

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
