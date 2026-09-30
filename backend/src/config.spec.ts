import { configSchema } from './config';

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
});
