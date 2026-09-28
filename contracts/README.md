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
| Signers for `org-tugma-demo-psp` | `GCP64OOU5TINJDB35RYRE6X5J7E2DGNIAZ7XUP5QG5FGXE4LSWN4DBN7` (`tugma-compliance`), `GBRJFTHVW7D6SQPAIHSCXSFRNZ7GUGKSSNBX6TADYAD3KKXGNV3XLRP7` (`tugma-risk`) |
| Explorer | https://lab.stellar.org/r/testnet/contract/CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH |

Secret keys live in the Stellar CLI's local identity store (`~/.config/stellar/identity/`), not in this repo.
Package `smoke-test` v1 was attested and countersigned as a deployment check.

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
  add_signer --org org-tugma-demo-psp --signer <G... address>

stellar contract invoke --id $C --source <attester key> --network testnet -- \
  attest --attester <attester G...> --org org-tugma-demo-psp \
  --package_id pkg-2026-01-01-2026-03-31 \
  --period_start 2026-01-01 --period_end 2026-03-31 \
  --hash <64-char hex canonical_hash>

stellar contract invoke --id $C --network testnet -- verify --hash <64-char hex>
```
