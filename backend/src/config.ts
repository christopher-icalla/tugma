import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? 'true').toLowerCase() !== 'false');

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8001),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: bool,
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),
  DEMO_USER_PASSWORD: z.string().min(1),
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

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
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
