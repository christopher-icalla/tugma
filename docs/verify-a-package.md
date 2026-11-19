# Verify an evidence package without TUGMA

Before this feature, a reviewer could only look up a hash that TUGMA supplied. Now anyone holding a package file can check it against Stellar themselves: download the package in canonical form, then run the open-source verifier (command line or browser). The verifier rebuilds the canonical representation, recalculates the SHA-256 hash and reads the attestation directly from the Stellar Testnet contract through Soroban RPC. It never calls TUGMA's API.

> **What a match proves.** A `VALID` result establishes **package integrity**: the file is byte-for-byte the package that was attested on Stellar, by the attester shown, at the ledger shown. It does **not** establish that the contents are true, that the underlying payments happened as recorded, or that the organization is compliant with any regulation.

## 1. Download the package

In TUGMA, open **Reports** and click **Download canonical package** on a finalized package. Any signed-in user of the organization can do this, including read-only roles such as Auditor. Each download is recorded in the audit log.

The file (`tugma-pkg-<start>-<end>.json`) is produced by `GET /api/evidence-packages/:id/export` and contains:

| Field | Meaning |
|---|---|
| `format`, `format_version` | `tugma.evidence-package`, `1` |
| `package_id`, `period_start`, `period_end` | The package and its period |
| `org` | The opaque on-chain organization id (`org_…`), as in [onchain-footprint.md](onchain-footprint.md) |
| `manifest` | The package manifest: ids of the sources, requirements, controls, test runs, transactions, exceptions, remediations and evidence (`id:content_hash`) it covers |
| `canonical_manifest` | The manifest in canonical form: keys sorted at every level, no whitespace, UTF-8 |
| `canonical_hash` | `sha256(canonical_manifest)` in hex: the value attested on-chain |
| `network` | Testnet passphrase and the contract id TUGMA used (informational; see below) |

The file contains identifiers and hashes, not the evidence contents themselves. Treat it as confidential like any audit working paper.

## 2a. Verify from the command line

Requires Node.js 22.12 or later.

```bash
cd verifier
npm ci
node bin/tugma-verify.js ~/Downloads/tugma-pkg-2026-01-01-2026-03-31.json
```

Options: `--json` for machine-readable output, `--rpc <url>` to use another Soroban RPC provider, `--contract <C…>` to check a different contract. Exit codes: `0` valid, `1` not valid, `2` bad input, `3` network unreachable.

## 2b. Verify in a browser

```bash
cd verifier
npm run web        # serves http://localhost:8787/web/
```

Open the page and drop the file on it. The file is read and hashed inside the browser and is never uploaded anywhere. The page talks only to the Soroban RPC endpoint shown under **Network settings** and to the CDN that serves the pinned Stellar SDK (checked with a Subresource Integrity hash). `verifier/web/` is plain static files, so it can also be hosted on any static host.

## What the verifier checks

1. **Export format**: the file is a version 1 TUGMA package export.
2. **Canonical form**: `canonical_manifest` equals the canonical form rebuilt from `manifest`.
3. **Recomputed SHA-256**: the rebuilt hash equals the hash written in the file.
4. **On-chain attestation**: the contract's `verify(hash)` returns a record for the **recomputed** hash.
5. **Package, organization and period**: that record is for this package id, organization and period.

It also reports whether the attestation was countersigned and whether a newer version of the package has since been attested.

| Result | Meaning |
|---|---|
| `VALID` | All checks pass |
| `TAMPERED` | The contents were changed after export (checks 2 or 3 fail) |
| `NOT_ATTESTED` | No attestation exists for the recomputed hash, for example when the contents *and* the hash in the file were both edited |
| `MISMATCH` | An attestation exists for this hash, but for a different package, organization or period |
| `INVALID_FILE` | Not a TUGMA package export |

The hash written in the file is never trusted on its own, and the contract id always comes from the verifier's settings (TUGMA's Testnet contract `CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH` by default), never from the file. If the file names a different contract, the verifier says so.

## Demonstration: a valid package passes, a modified one fails

**Offline, reproducible** (also runs in CI):

```bash
cd verifier && npm run demo
```

It runs the real verifier on three files against an in-memory stand-in for the contract that holds one attestation: the package as exported (`VALID`), the same package with its exception removed (`TAMPERED`), and the edited package with its hash also edited to match (`NOT_ATTESTED`).

**Live, on Stellar Testnet:**

1. In TUGMA, generate a package, then attest and countersign it from **Reports** (see [Setting up Stellar signing](../README.md#setting-up-stellar-signing)).
2. Click **Download canonical package**.
3. `node bin/tugma-verify.js tugma-pkg-….json` prints `VALID` with the attester, ledger and countersigner, read from the Testnet contract.
4. Make a copy and change one entry, for example remove an id from `manifest.exceptions`. The verifier prints `NOT VALID (TAMPERED)` and exits `1`.
5. Recompute and replace `canonical_manifest` and `canonical_hash` in the copy. The verifier prints `NOT VALID (NOT ATTESTED)`: no attestation exists for the forged hash.

## Limits

- Integrity only, as stated above. A package built from false records verifies as long as it is the package that was attested.
- The verifier depends on a reachable Soroban RPC endpoint. Contract state is current; contract events are only kept for a limited window, and the verifier does not need them.
- Testnet only. TUGMA does not run on Mainnet.
- The canonical form must stay identical between the API and the verifier. Both are tested against `verifier/test/vectors.json`.
