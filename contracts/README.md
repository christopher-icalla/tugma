# TUGMA Attestation Registry (Soroban)

Anchors the SHA-256 `canonical_hash` of a TUGMA evidence package on Stellar.

| Function | Auth | Purpose |
|---|---|---|
| `__constructor(admin)` | — | Set the admin at deploy time |
| `set_admin(new_admin)` | admin | Rotate the admin key |
| `add_signer(org, signer)` / `remove_signer(org, signer)` | admin | Authorize addresses to sign for an org |
| `attest(attester, org, package_id, period_start, period_end, hash)` → `u32` | attester | Anchor a hash; re-attesting a package appends a new version |
| `countersign(verifier, org, package_id, version)` | verifier | Independent verification; verifier must differ from attester |
| `get(org, package_id, version)` / `latest(org, package_id)` / `version_count(org, package_id)` | — | Reads |
| `verify(hash)` → `Option<Attestation>` | — | Public lookup of a package hash |
| `is_signer(org, signer)` / `admin()` | — | Reads |

Errors: `1 NotAuthorizedSigner`, `2 HashAlreadyAttested`, `3 NotFound`, `4 AlreadyVerified`, `5 SelfVerification`.

Events: `Attested`, `Countersigned`, `SignerChanged` (topics: org, package_id).

## Testnet deployment

| | |
|---|---|
| Contract ID | `CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH` (CLI alias `tugma-attestation`) |
| Admin | `GADNTW5DPTTUOJWRQ3A6PTPMB6QCOHIT74KWWBBHNLH4T6EFZJFN5UFW` (key `tugma-admin`) |
| Signers under the legacy readable org id `org-tugma-demo-psp` (before opaque ids; re-authorize them with the opaque id) | `GCP64OOU5TINJDB35RYRE6X5J7E2DGNIAZ7XUP5QG5FGXE4LSWN4DBN7` (`tugma-compliance`), `GBRJFTHVW7D6SQPAIHSCXSFRNZ7GUGKSSNBX6TADYAD3KKXGNV3XLRP7` (`tugma-risk`) |
| Explorer | https://lab.stellar.org/r/testnet/contract/CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH |

Secret keys live in the Stellar CLI's local identity store (`~/.config/stellar/identity/`), not in this repo.
Package `smoke-test` v1 was attested and countersigned as a deployment check.

## Using it from the TUGMA app

The API (`backend/src/stellar/`) talks to this contract through Soroban RPC. It never
holds keys: it builds and simulates `attest` / `countersign` calls, the user's Freighter
wallet signs them in the browser, and the API submits the signed envelope after checking
that it is exactly the transaction it prepared. Reads (`verify`, `get`, `version_count`,
`is_signer`) run as simulations.

A user's wallet can sign only after the admin authorizes it for the organization:

```sh
stellar contract invoke --id CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH \
  --source tugma-admin --network testnet -- \
  add_signer --org <opaque on-chain org id> --signer <user's G... address>
```

The `org` argument is the organization's opaque on-chain id (`org_` + 32 hex), shown under **Settings → Stellar Signers**; TUGMA never sends its readable organization id. Every field and event the contract makes public is listed in [`docs/onchain-footprint.md`](../docs/onchain-footprint.md).

Point the API at a different deployment with `STELLAR_CONTRACT_ID`.

Optional two-party attestation needs no contract change: a 2-of-2 multisig account (TUGMA's key + an independent reviewer's key) is authorized with `add_signer` and attests as its own transaction source, so `attester.require_auth()` holds only when both keys have signed. See [`docs/two-party-attestation.md`](../docs/two-party-attestation.md).

## Build & test

```sh
cd contracts
cargo test
stellar contract build   # -> target/wasm32v1-none/release/attestation.wasm
```

> Windows: if the build says the `wasm32v1-none` target is missing, a non-rustup Rust
> (e.g. Chocolatey) is ahead of `~/.cargo/bin` on PATH. Put `~/.cargo/bin` first.

## Deploy to testnet

```sh
stellar keys generate tugma-admin --network testnet --fund

stellar contract deploy \
  --wasm target/wasm32v1-none/release/attestation.wasm \
  --source tugma-admin --network testnet \
  -- --admin tugma-admin
```

## Example calls

```sh
C=<contract id>

stellar contract invoke --id $C --source tugma-admin --network testnet -- \
  add_signer --org <opaque on-chain org id> --signer <G... address>

stellar contract invoke --id $C --source <attester key> --network testnet -- \
  attest --attester <attester G...> --org <opaque on-chain org id> \
  --package_id pkg-2026-01-01-2026-03-31 \
  --period_start 2026-01-01 --period_end 2026-03-31 \
  --hash <64-char hex canonical_hash>

stellar contract invoke --id $C --network testnet -- verify --hash <64-char hex>
```
