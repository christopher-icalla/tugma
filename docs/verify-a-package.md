# Verify an evidence package without TUGMA

Before this feature, a reviewer could only look up a hash that TUGMA supplied. Now anyone holding a package file can check it against Stellar themselves: download the package in canonical form, then run the open-source verifier (command line or browser). The verifier rebuilds the canonical representation, recalculates the SHA-256 hash and reads the attestation directly from the Stellar Testnet contract through Soroban RPC. It never calls TUGMA's API.

> **What a match proves.** A `VALID` result establishes **package integrity**: the file is byte-for-byte the package that was attested on Stellar, by the attester shown, at the ledger shown. It does **not** establish that the contents are true, that the underlying payments happened as recorded, or that the organization is compliant with any regulation.

## 1. Download the package

In TUGMA, open **Reports** and click **Download canonical package** on a finalized package. Any signed-in user of the organization can do this, including read-only roles such as Auditor. Each download is recorded in the audit log.

Users with a linked Stellar wallet can also click **Download signed copy**. Freighter then signs a [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) message naming the package id, organization, SHA-256, network and time, and the signature is added to the file as `export_signature`. It proves which account exported this exact package; it does not change the manifest or its hash.

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

To check many packages at once, for example every quarter an auditor received, pass a folder or several files to `batch`. It prints one line per file and exits `0` only if every file is valid:

```bash
node bin/tugma-verify.js batch ~/Downloads/tugma-packages/
```

```text
1 of 3 package(s) are VALID; 2 NOT VALID.

  [ok]   tugma-pkg-2026-01-01-2026-03-31.json  VALID          pkg-2026-01-01-2026-03-31 v1 of 1, countersigned
  [FAIL] tugma-pkg-2026-04-01-2026-06-30.json  TAMPERED       Canonical form: canonical_manifest differs from the canonical form of the manifest
  [FAIL] notes.json                            INVALID FILE   not readable as JSON (…)
```

To see what changed between two packages, for example version 1 and a re-attested version 2, use `diff`. It recomputes both hashes, says which on-chain version each file is, and lists entries added or removed, evidence whose content hash changed, and changes to the period and counts. Add `--offline` to compare without reading Stellar. It exits `0` if the manifests are identical and `1` if they differ:

```bash
node bin/tugma-verify.js diff tugma-pkg-v1.json tugma-pkg-v2.json
```

Output for two test packages (neither is attested on Testnet, which the report says for each file):

```text
DIFFERENT: the packages' manifests differ.

  Old  tugma-pkg-v1.json: pkg-2026-01-01-2026-03-31, b51ee955ffc869d3…, not attested on-chain
  New  tugma-pkg-v2.json: pkg-2026-01-01-2026-03-31, 1554e8f0b5294156…, not attested on-chain

  counts.controls: 3 -> 4

  controls: +1 added, -0 removed
    + CTRL-009

  evidence: +0 added, -0 removed, ~1 changed
    ~ evd-0a1b2c3d4e  content hash 9f86d081884c7d65… -> cccccccccccccccc…
```

To audit who signed a package, use `signers`. For every on-chain version of the package the file names, it lists the attesting and countersigning wallets with timestamps, whether each wallet is still an authorized signer for the organization, and signer additions and removals that the RPC still holds (`signer_changed` events; Soroban RPC keeps about seven days on Testnet). It exits `1` if any version is not countersigned or was countersigned by its own attester:

```bash
node bin/tugma-verify.js signers tugma-pkg-2026-01-01-2026-03-31.json
```

## 2b. Verify in a browser

**Hosted:** https://christopher-icalla.github.io/tugma/verifier/web/ is published from this repository on GitHub Pages by [`jekyll-gh-pages.yml`](../.github/workflows/jekyll-gh-pages.yml), so it does not depend on any TUGMA server.

**Locally:**

```bash
cd verifier
npm run web        # serves http://localhost:8787/web/
```

Open the page and drop the file on it, or drop several files to check them together and get one row per file. The file is read and hashed inside the browser and is never uploaded anywhere. The page talks only to the Soroban RPC endpoint shown under **Network settings** and to the CDN that serves the pinned Stellar SDK (checked with a Subresource Integrity hash). `verifier/web/` is plain static files, so it can also be hosted on any static host.

## What the verifier checks

1. **Export format**: the file is a version 1 TUGMA package export.
2. **Canonical form**: `canonical_manifest` equals the canonical form rebuilt from `manifest`.
3. **Recomputed SHA-256**: the rebuilt hash equals the hash written in the file.
4. **On-chain attestation**: the contract's `verify(hash)` returns a record for the **recomputed** hash.
5. **Package, organization and period**: that record is for this package id, organization and period.

For a signed export it also checks the SEP-53 signature and reports whether the signer is currently an authorized signer for the organization on the contract. It lists every attested version of the package, newest first (up to 25), with its hash, time and countersign status, and marks the version the file matches; for a `NOT_ATTESTED` file it shows the attested versions it fails to match. It also reports whether the attestation was countersigned and whether a newer version of the package has since been attested.

| Result | Meaning |
|---|---|
| `VALID` | All checks pass |
| `TAMPERED` | The contents were changed after export (checks 2 or 3 fail) |
| `NOT_ATTESTED` | No attestation exists for the recomputed hash, for example when the contents *and* the hash in the file were both edited |
| `MISMATCH` | An attestation exists for this hash, but for a different package, organization or period |
| `BAD_SIGNATURE` | The file carries an export signature that is not a valid signature by its signer, or that names a different package, organization or hash |
| `INVALID_FILE` | Not a TUGMA package export |

The hash written in the file is never trusted on its own, and the contract id always comes from the verifier's settings (TUGMA's Testnet contract `CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH` by default), never from the file. If the file names a different contract, the verifier says so.

## Check one document without the others

In **Evidence**, click **Export** on a record to download it as `tugma-evidence-<id>.json` (`GET /api/evidence/:id/export`). The file holds exactly the input the record's `content_hash` was computed from. Give it to a reviewer together with the package file, which lists only ids and hashes, never other documents' contents:

```bash
node bin/tugma-verify.js evidence tugma-evidence-evd-….json --package tugma-pkg-….json
```

The verifier recomputes the record's hash, checks that its `id:content_hash` line is in the package manifest, and verifies the package on Stellar. Results: `VALID`, `TAMPERED` (record changed), `NOT_IN_PACKAGE`, `PACKAGE_NOT_VALID` or `INVALID_FILE`.

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
