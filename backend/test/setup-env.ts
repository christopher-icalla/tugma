// Test environment. CI provides DATABASE_URL; locally, point TEST_DATABASE_URL
// at a throwaway database — the e2e suite resets it.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tugma_test?schema=public';
process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-hs256';
process.env.ADMIN_EMAIL ??= 'admin@tugma.test';
process.env.ADMIN_PASSWORD ??= 'admin-test-password';
process.env.DEMO_USER_PASSWORD ??= 'demo-test-password';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.COOKIE_SECURE ??= 'false';
