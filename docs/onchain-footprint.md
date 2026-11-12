# On-chain footprint

What TUGMA writes to Stellar when it attests an evidence package, field by field, and what stays off-chain. Everything listed under **Public** is readable by anyone, forever, through the contract, the Soroban RPC or a block explorer. Nothing else leaves TUGMA's database.

Contract: `contracts/contracts/attestation/src/lib.rs` (Soroban, unchanged by this document). Testnet deployment: `CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH`.

## Summary

| Public on Stellar | Off-chain only (TUGMA database) |
|---|---|
| Opaque organization id (`org_` + 32 hex) | Organization name, readable id, country, industry |
| Package id (`pkg-<period_start>-<period_end>`) and its period dates | Package name, counts, completeness score |
| SHA-256 `canonical_hash` of the package manifest | The manifest itself and every record it lists |
| Version number of each attestation | Payment transactions, amounts, merchants, customers |
| Attester and countersigner Stellar addresses | Exceptions, remediation, evidence files and their contents |
| Ledger numbers and ledger timestamps | User names, emails and roles |
| Admin address and the signer allow-list | The mapping from opaque id to organization |
| Transaction hashes, fees and signatures | Audit log |

## Organization identifier

The contract keys everything by an `org` string. TUGMA used to pass the organization's readable id (`org-tugma-demo-psp`). It now passes **`organizations.chain_org_id`**:

- `org_` followed by 128 random bits, for example `org_3f9c0b1e7a2d4c58b6e1f0a9d2c3b4e5`.
- Generated once when the organization is created and never rotated, because on-chain records are keyed by it.
- Not derived from the organization's id or name. Linking it to an organization requires TUGMA's database.

The contract did not change: the opaque value goes in the same `org` argument. Signers authorized and attestations made under the old readable id stay on-chain as they were. Wallets need `add_signer` once with the new id, and old attestations remain verifiable by hash on `/stellar`.

## Contract storage

Each entry below is ledger state that anyone can read.

### Instance storage

| Key | Value | Written by |
|---|---|---|
| `Admin` | Admin `Address` | constructor, `set_admin` |

### Persistent storage

| Key | Value | Written by |
|---|---|---|
| `Signer(org, address)` | `true` while the address may sign for `org` | `add_signer` (removed by `remove_signer`) |
| `VersionCount(org, package_id)` | `u32`: number of attested versions | `attest` |
| `Record(org, package_id, version)` | `Attestation` (below) | `attest`, `countersign` |
| `ByHash(hash)` | `(org, package_id, version)` | `attest` |

### `Attestation` record

| Field | Type | Content | Sensitive? |
|---|---|---|---|
| `org` | `String` | Opaque organization id | No |
| `package_id` | `String` | `pkg-<period_start>-<period_end>` | No: derived only from the period |
| `version` | `u32` | 1, 2, 3… one per re-attestation | No |
| `hash` | `BytesN<32>` | SHA-256 of the canonical package manifest | No: a digest, not the contents |
| `period_start` | `String` | `YYYY-MM-DD` | No |
| `period_end` | `String` | `YYYY-MM-DD` | No |
| `attester` | `Address` | Attesting wallet | Pseudonymous; see [Wallet addresses](#wallet-addresses) |
| `attested_at` | `u64` | Ledger close time (Unix seconds) | No |
| `attested_ledger` | `u32` | Ledger sequence of the attestation | No |
| `verifier` | `Option<Address>` | Countersigning wallet, once countersigned | Pseudonymous |
| `verified_at` | `Option<u64>` | Ledger close time of the countersignature | No |

## Events

Events are public and kept by RPC providers for a limited window (on public Testnet RPCs, about a week). Each event's topics start with the event name.

| Event | Topics | Data | Emitted by |
|---|---|---|---|
| `attested` | `org`, `package_id` | `version`, `hash`, `attester` | `attest` |
| `countersigned` | `org`, `package_id` | `version`, `verifier` | `countersign` |
| `signer_changed` | `org` | `signer`, `authorized` | `add_signer`, `remove_signer` |

## Transactions

Every call is a Stellar transaction, so its envelope is public too: the source account, sequence number, fee, signatures, the function name and its arguments.

| Function | Arguments |
|---|---|
| `attest` | `attester`, `org`, `package_id`, `period_start`, `period_end`, `hash` |
| `countersign` | `verifier`, `org`, `package_id`, `version` |
| `add_signer`, `remove_signer` | `org`, `signer` |
| `set_admin` | `new_admin` |
| `get`, `latest`, `version_count`, `verify`, `is_signer`, `admin` | Read-only. TUGMA calls these as simulations, which are never submitted |

The arguments carry no more than the record above. The signed off-chain message used to link a wallet (`Organization: …`, user email, nonce) is checked by the API and never submitted to the network.

## The transaction hash stays with the package

Contract state records the ledger of an attestation but not its transaction hash. TUGMA stores the hash alongside each package version:

- **Attest in the app:** the hash returned by the network is saved with the attestation.
- **Sync from chain** (after a CLI attestation, or a confirmation the app missed): TUGMA reads the `attested` event the contract published in the recorded ledger and saves that event's transaction hash. A hash already stored is never replaced or cleared.
- **Past the RPC's event retention window:** the hash cannot be read back. Sync says which versions are affected; the ledger number still locates the transaction on an explorer or archive.

## Package hash

`canonical_hash` is the SHA-256 of the package manifest in canonical JSON (sorted keys). The manifest lists **identifiers only**: the period, regulatory source and requirement ids, control codes, test-run ids, transaction ids, exception codes, remediation ids, `evidence id:content hash` pairs, and counts. The manifest and every record it points to stay in TUGMA's database. Publishing the hash proves the package existed in exactly that form at that ledger without revealing any of it.

## Wallet addresses

Attester and countersigner addresses are public keys. They don't name anyone on-chain. They become linkable to a person only if the same account is used elsewhere under that person's name. Use a dedicated wallet for attestation.

## Off-chain only

Kept in TUGMA's PostgreSQL database and never sent to Stellar:

- Payment data: transactions, amounts, currencies, merchants, channels, settlement and status.
- Customer data of any kind.
- Exceptions, remediation actions and approvals.
- Evidence files, their contents and their metadata (only an evidence id and content hash appear, inside the hashed manifest).
- Users: names, emails, roles, password hashes, sessions.
- The organization's name, readable id and the mapping to its opaque on-chain id.
- The audit log.
