# @tugma/verify

Standalone, open-source (MIT) verifier for TUGMA evidence packages. Give it a package file downloaded from TUGMA and it rebuilds the canonical JSON, recalculates the SHA-256 and reads the attestation from the Stellar Testnet contract through Soroban RPC. For a two-party (multisig) attestation it also reads the attester account and its transaction from Stellar Horizon and verifies both signatures. It never calls TUGMA's API.

A `VALID` result establishes package integrity, not that the contents are true or that the organization is compliant.

```bash
corepack enable && pnpm install --frozen-lockfile
node bin/tugma-verify.js tugma-pkg-2026-01-01-2026-03-31.json   # command line
node bin/tugma-verify.js batch ./packages/                      # many packages at once
node bin/tugma-verify.js diff v1.json v2.json                   # what changed between two packages
node bin/tugma-verify.js signers pkg.json                       # who attested and countersigned each version (and both signers of a two-party attestation)
pnpm web                                                         # browser: http://localhost:8787/web/
pnpm demo                                                        # valid vs. modified package, offline
pnpm test
```

| Path | |
|---|---|
| `src/canonical.js`, `src/hash.js` | Canonical JSON and SHA-256 (Web Crypto), identical to the API's |
| `src/chain.js` | Read-only contract client over Soroban RPC; the Stellar SDK is passed in |
| `src/verify.js` | The checks and results |
| `src/bulk.js` | Checking many packages at once |
| `src/diff.js` | Comparing two packages |
| `src/signers.js` | Signer history audit |
| `src/multisig.js` | Two-party attestations: the attester account's signers and thresholds (Horizon) and each signature on the attestation transaction, verified locally |
| `src/cli.js`, `bin/tugma-verify.js` | Command line |
| `web/` | Browser page (static files) |
| `test/vectors.json` | Test vectors shared with the backend |

Full guide: [docs/verify-a-package.md](../docs/verify-a-package.md).
