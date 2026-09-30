// Test environment. CI provides DATABASE_URL; locally, point TEST_DATABASE_URL
// at a throwaway database — the e2e suite resets it.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tugma_test?schema=public';
// Fixed test secrets: always override, so a developer's backend/.env (which Prisma
// loads into process.env) can't leak into or break the suite.
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.ADMIN_EMAIL = 'admin@tugma.test';
process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.DEMO_USER_PASSWORD = 'demo-test-password';
// The suite logs in many times from one IP; the rate-limit test re-enables it explicitly.
process.env.RATE_LIMIT ??= 'off';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.COOKIE_SECURE ??= 'false';
