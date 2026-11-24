# Attestation contract interface and trust model

Source: [`contracts/contracts/attestation/src/lib.rs`](../contracts/contracts/attestation/src/lib.rs). Public Testnet deployment: [`CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH`](https://stellar.expert/explorer/testnet/contract/CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH), WASM hash `90e859d243cb53174b1dfe94ec8d0d36ebc1db16f3d2eacd9b3939f60143d948`.

## Functions

| Function | Authorization | Result |
|---|---|---|
| `__constructor(admin: Address)` | Deployment | Sets the admin |
| `admin()` | None | `Address` |
| `set_admin(new_admin: Address)` | Admin | Replaces the admin |
| `add_signer(org: String, signer: Address)` | Admin | Authorizes a wallet for one organization |
| `remove_signer(org: String, signer: Address)` | Admin | Revokes it; earlier attestations stay |
| `is_signer(org: String, signer: Address)` | None | `bool` |
| `attest(attester: Address, org: String, package_id: String, period_start: String, period_end: String, hash: BytesN<32>)` | `attester`, an authorized signer | `u32` version, from 1 |
| `countersign(verifier: Address, org: String, package_id: String, version: u32)` | `verifier`, an authorized signer other than the attester | |
| `get(org, package_id, version)` | None | `Attestation` |
| `latest(org, package_id)` | None | `Attestation` |
| `version_count(org, package_id)` | None | `u32` |
| `verify(hash: BytesN<32>)` | None | `Option<Attestation>` |

## Errors

| Code | Name | Raised when |
|---|---|---|
| 1 | `NotAuthorizedSigner` | The wallet is not a signer for the organization |
| 2 | `HashAlreadyAttested` | The hash already has a record, in any organization |
| 3 | `NotFound` | No such package or version |
| 4 | `AlreadyVerified` | The version is already countersigned |
| 5 | `SelfVerification` | The attester tries to countersign |

Storage keys, the `Attestation` fields and events are listed in [onchain-footprint.md](onchain-footprint.md).

## Guarantees

- A version's hash, attester, period and time are never overwritten; a new attestation appends a version.
- A hash is recorded at most once.
- Only wallets the admin authorized can attest or countersign, and one wallet cannot do both for a version.
- The contract has no upgrade function, so its code cannot be replaced at this contract id.

## Trust and limits

- **The admin is trusted.** It is a single key that can authorize wallets. It could authorize two wallets it controls.
- **Wallets are not people.** The contract checks that two addresses differ. TUGMA's server separately checks that the users differ.
- **Integrity only.** The contract cannot tell whether a package's contents are true.
- **Contract choice matters.** Anyone can deploy the same code. Verifiers take the contract id from their own settings, never from a package.
- **First use of a hash.** A hash is unique across the contract, so a signer of one organization who learned another's unattested hash could record it first. The verifier would then report `MISMATCH`.
- **Storage lifetime.** Entries are extended to the network's maximum TTL when written, and the record again when it is loaded in a submitted transaction. Reads by simulation do not extend it. An entry that expires must be restored before it can be read; there is no automated TTL job.
- **Testnet.** Stellar resets Testnet periodically. The archived JSON in [`validation/archive`](validation/archive) stays readable after a reset.
