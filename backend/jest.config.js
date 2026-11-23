/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  // @stellar/stellar-sdk v17 depends on ESM-only packages. Node loads them natively,
  // but Jest's CommonJS runtime can't, so transpile just those.
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    // pnpm nests packages as node_modules/.pnpm/<name>@<ver>/node_modules/<name>, with
    // "/" in scoped names written as "+", so allow both layouts.
    '/node_modules/(?!(\.pnpm/)?(@exodus[/+]bytes|@noble[/+]ed25519|@noble[/+]hashes|axios|proxy-from-env|eventsource|eventsource-parser|is-retry-allowed|smol-toml|uint8array-extras)[@/])',
  ],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 120000,
};
