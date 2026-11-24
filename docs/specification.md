# Evidence-package specification

Format `tugma.evidence-package`, version 1. The reference implementations are [`backend/src/api/package-export.ts`](../backend/src/api/package-export.ts) and [`verifier/src/`](../verifier/src/); both are tested against [`verifier/test/vectors.json`](../verifier/test/vectors.json).

## Package file

| Field | Type | Rule |
|---|---|---|
| `format` | string | `tugma.evidence-package` |
| `format_version` | integer | `1`; raised if any field changes meaning |
| `package_id` | string | `pkg-<period_start>-<period_end>` |
| `period_start`, `period_end` | string | `YYYY-MM-DD`, inclusive |
| `org` | string | Opaque on-chain id: `org_` + 32 hex |
| `manifest` | object | Below |
| `canonical_manifest` | string | Canonical form of `manifest` |
| `canonical_hash` | string | SHA-256 of `canonical_manifest`, 64 lowercase hex |
| `hash_algorithm` | string | `sha256` |
| `canonicalization` | string | `json-sorted-keys-compact-utf8` |
| `network` | object | `name`, `passphrase`, `contract_id`. Informational; never used to choose a contract |
| `export_signature` | object, optional | SEP-53 signature by the exporting wallet; not part of the manifest or hash |

## Manifest

`period` (`[start, end]`), then sorted lists of ids: `regulatory_sources`, `requirements`, `controls`, `test_runs`, `transactions`, `exceptions`, `remediations`, and `evidence` as `id:content_hash`. `counts` holds `controls`, `transactions`, `exceptions`, `evidence` and `completeness` (a whole percentage).

The manifest holds identifiers and hashes, not payment amounts, customer data or evidence contents. Two limits follow:

- `exceptions` and `remediations` are ids only. The manifest does not commit to their status or text.
- `test_runs` holds the latest run of each control, so a new control run changes the hash of a package generated after it. A finalized package does not change until it is generated again.

## Canonicalization

1. Sort object keys at every level with JavaScript's default string order (UTF-16 code units).
2. Keep array order.
3. Serialize with `JSON.stringify` and no whitespace.
4. Encode as UTF-8 and hash with SHA-256.

The manifest contains only strings, whole numbers, arrays and objects, so number formatting is not a source of difference. This is not a claim of RFC 8785 conformance.

JavaScript moves integer-like keys ahead of other keys; manifests contain none. A verifier in another language should reject such keys.

## Evidence record

Format `tugma.evidence-item`, version 1. `content_hash` is the SHA-256 of the canonical form of `hash_input` (`name`, `type`, `content`, `source`). The package lists it as `<evidence_id>:<content_hash>`.

## Verification

The verifier recomputes the hash from `manifest` and looks up the **recomputed** hash on the contract set in its own configuration.

| Status | Exit code | Condition |
|---|---|---|
| `VALID` | 0 | Canonical form, hash, attestation, package id, organization and period all match |
| `TAMPERED` | 1 | `canonical_manifest` or `canonical_hash` does not match the manifest |
| `NOT_ATTESTED` | 1 | The contract has no record of the recomputed hash |
| `MISMATCH` | 1 | The record is for another package, organization or period |
| `BAD_SIGNATURE` | 1 | `export_signature` is present and does not check out |
| `INVALID_FILE`, or unreadable input | 2 | Not a package file |
| Network error | 3 | Soroban RPC could not be reached; no verdict is given |

A superseded version stays `VALID`; the result reports the latest version number and warns that a newer one exists. A missing countersignature is also a warning, not a failure.
