# Two-party attestation (multisig, Testnet only)

An optional attestation mode in which no single party can anchor a package hash on Stellar. The hash is attested by a dedicated **attestation account** whose signers and thresholds require **both** TUGMA's server key and an independent reviewer's key. TUGMA signs on its server; the reviewer signs in their own wallet. TUGMA never sees the reviewer's key.

The mode is **off unless configured**, and it runs on **Stellar Testnet only**. With its settings unset, TUGMA behaves exactly as before: one Freighter wallet attests and a different one countersigns.

## 1. The attestation account

`backend/scripts/create-attestation-account.js` creates the account on Testnet. It takes only public keys:

```sh
cd backend
stellar keys generate tugma-cosigner --network testnet     # TUGMA's server signing key
node scripts/create-attestation-account.js \
  --tugma-signer "$(stellar keys address tugma-cosigner)" \
  --reviewer <reviewer's G... public key, from their wallet>
```

The script generates a new account key in memory, funds the account with Friendbot, and submits one transaction signed by that key:

| Operation | Effect |
|---|---|
| `manageData tugma.signer.tugma` = TUGMA's public key | On-chain label: which signer is TUGMA |
| `manageData tugma.signer.reviewer` = reviewer's public key | On-chain label: which signer is the reviewer |
| `setOptions signer` TUGMA key, weight 1 | |
| `setOptions signer` reviewer key, weight 1 | |
| `setOptions` master weight 0, low / medium / high thresholds 2 | No key alone (weight 1) reaches any threshold; both together (weight 2) do |

The account's own key is then useless (weight 0) and is discarded; it is never printed or saved. The script prints the account id, its signers, weights and thresholds, and the next steps. It never prints a secret key, and refuses one passed on the command line.

`node scripts/create-attestation-account.js --self-test` does the same with throwaway keys for both signers, then proves the setup: a transaction signed by TUGMA's key alone is rejected, and the same transaction signed by both keys is accepted.

### Testnet proof

A self-test run on 2026-11-22 (throwaway keys, never printed):

| | |
|---|---|
| Attestation account | [`GDH4BGKS4BQHLWYKXBHIN5JYGXORP6562J35B3NEYLHEP25UZ7XF5NTY`](https://stellar.expert/explorer/testnet/account/GDH4BGKS4BQHLWYKXBHIN5JYGXORP6562J35B3NEYLHEP25UZ7XF5NTY) |
| Signers | `GA2QTM7Z…MVFK` (TUGMA, weight 1), `GD6HMIGH…J77M` (reviewer, weight 1), master weight 0 |
| Thresholds | low 2 / medium 2 / high 2 |
| Setup transaction | [`264e891a…55e6d7`](https://stellar.expert/explorer/testnet/tx/264e891a404c168eb1b9b2725e916db30b4914119a776e16f4e1b5716f55e6d7) (ledger 5861556) |
| Signed by TUGMA's key only | rejected by the network with `tx_bad_auth`; it never reached a ledger |
| Signed by both keys | accepted: [`f6603712…372345`](https://stellar.expert/explorer/testnet/tx/f660371262adfb2acc82546a819972c8e6e23b01b3282dd74298cade18372345) (ledger 5861557) |

## 2. How the attestation transaction works

The attestation account is authorized on the existing contract as a signer for the organization, exactly like a person's wallet (`add_signer`), so **the contract does not change**. TUGMA's API calls `attest` with the attestation account as the `attester` argument **and** as the transaction source. The contract's `attester.require_auth()` is then satisfied by the transaction's own signatures (Soroban source-account authorization), and the network checks them against the account's signers and thresholds. With both signers at weight 1 and every threshold at 2, the network accepts the attestation only when it carries both signatures.

Why this rather than a classic transaction carrying the hash in `manageData` or a memo: the attestation lands in the same contract, with the same versioning, `verify(hash)` lookup, `Attested` event and verifier checks as every other attestation, and the network itself enforces the two signatures. Nothing in the contract or the verifier's core checks needs a second code path.

Testnet proof against a throwaway copy of the contract (same wasm as CI builds, deployed with a throwaway admin so the live deployment is untouched), 2026-11-22:

| | |
|---|---|
| Contract copy | [`CCBUP6NW…AFDJL`](https://stellar.expert/explorer/testnet/contract/CCBUP6NWRCAI2CE76LJJDD2RDJUHREVFRISG3FYXQKEYXB623TOAFDJL) |
| Attestation account (2-of-2) | [`GDODPCKW23C6OOSBOCL7UAUYQY4FZNSES644FSRUTXDTNO2XP3EVTU5O`](https://stellar.expert/explorer/testnet/account/GDODPCKW23C6OOSBOCL7UAUYQY4FZNSES644FSRUTXDTNO2XP3EVTU5O) |
| `add_signer` for the account | [`24f3c217…7a01`](https://stellar.expert/explorer/testnet/tx/24f3c2177309706b47b388b653f8bd073718b8bf7dca5a3e9a3f1d9e365f7a01) |
| `attest` with 24-hour time bounds, signed by TUGMA's key only | rejected with `txBadAuth` |
| The same envelope signed by both keys | accepted: [`1f0dabd4…d1c4`](https://stellar.expert/explorer/testnet/tx/1f0dabd42a49c7442a3ab75f73f86b343ef383c1dbe5e502cfb116685eb1d1c4), ledger 5861666, version 1; `verify` returns the attestation account as attester |

### The flow in TUGMA

1. **Request** (Reports → *Request two-party attestation*, roles with `package:attest`). The API checks on-chain that the attestation account really requires both keys (master weight and every signer below the lowest threshold, the two keys together reaching the highest), builds and simulates `attest`, signs the assembled transaction with TUGMA's key, and stores the half-signed envelope as a co-sign request. Its time bounds give the reviewer `MULTISIG_COSIGN_TTL_HOURS` (default 24) to sign. The package shows **Awaiting reviewer signature**.
2. **Review.** The reviewer opens the signing link (`/review/<request id>`). It needs no TUGMA login: the id is unguessable, nothing on the page is secret (the same hash and package id go on-chain), and the reviewer's signature is the authorization.
3. **Submit.** The reviewer's signed envelope comes back to `POST /api/stellar/cosign/:id/submit`. The API accepts it only if its transaction hash equals the stored one (same operations, fee, sequence number and time bounds; only signatures may differ) and every signature on it is TUGMA's or the configured reviewer key's, with the reviewer's present. It then submits TUGMA's stored envelope plus the reviewer's signature, and records the attestation as **CO_SIGNED** with both signer keys.

A co-signed attestation already has two independent signers, so it is not listed as awaiting a countersignature. It can still be countersigned by a wallet in the usual way.

### Stale or expired transactions

A transaction from the attestation account becomes impossible to submit when its time bounds pass or when any other transaction from the account lands first (its sequence number is used). The API checks both before submitting, and also maps the network's `txTooLate` and `txBadSeq` rejections. In each case it marks the request **STALE**, tells the reviewer why, and a TUGMA user can **Rebuild**: a new transaction is built and signed by TUGMA, the old request is marked superseded, and the reviewer signs the new one. Two packages can't be co-signed in parallel for the same reason: each request uses the account's next sequence number, so sign them one at a time (or rebuild).

### The reviewer's signing step

On **Reports**, a package that can be attested gets **Request two-party attestation** (only when the server has the feature configured). After TUGMA signs, the package's Stellar panel shows **Awaiting reviewer signature** with TUGMA's key, the reviewer key, the attestation account, the deadline and the signing link to send the reviewer. If the request goes stale it shows why, with **Rebuild transaction**. Once the reviewer signs, the panel shows **CO-SIGNED** with both signer keys, and the package timeline lists both steps (signed by TUGMA, signed by the reviewer) with the transaction link.

The reviewer's page, `/review/<request id>`, shows exactly what is being signed: the contract call, package id and period, expected version, canonical SHA-256, attestation account, both signer keys, the network (Testnet passphrase), the transaction hash and the deadline. The reviewer connects their own wallet through [Stellar Wallets Kit](https://stellarwalletskit.dev/) (Freighter, xBull, Albedo, Lobstr, Hana and others, set to Testnet). The page refuses to sign with a wallet account other than the configured reviewer key and refuses any network but Testnet. The wallet signs the envelope, and only the signed envelope is sent back.

### What the verifier shows

`tugma-verify` (including `signers`) and the browser verifier read the attestation account's signers, thresholds and labels from Horizon, find the attestation transaction, and verify each signature against the signer keys themselves (signature hint, then ed25519 over the transaction hash). They list both signers, TUGMA and the independent reviewer, and say whether the thresholds required both. With only one valid signature the result shows the missing signer and **INSUFFICIENT**. They never contact TUGMA. See [verify-a-package.md](verify-a-package.md#two-party-multisig-attestations).

## 3. Enabling it

Set all three on the API (blank or unset means off; setting only some is a startup error), then restart:

| Variable | Value |
|---|---|
| `MULTISIG_ATTESTATION_ACCOUNT` | The account id the script printed (G...) |
| `MULTISIG_TUGMA_SIGNER_SECRET` | The secret key of TUGMA's signer (S...), from your host's secret store. Never commit it. |
| `MULTISIG_REVIEWER_PUBLIC_KEY` | The reviewer's **public** key (G...) |
| `MULTISIG_COSIGN_TTL_HOURS` | Optional: hours the reviewer has to sign (default 24) |

Then authorize the account on the contract (contract admin):

```sh
ORG=<opaque on-chain org id> ./contracts/scripts/authorize-signers.sh <attestation account G...>
```

With the settings unset, `/api/stellar/config` carries no `multisig` block, packages carry no `cosign` field, and every co-sign route answers 404.

### Key custody

This mode is the one place TUGMA's API holds a Stellar secret key. It lives only in `backend/src/stellar/tugma-signer.ts` (a test enforces that no other file loads a secret), is kept in a private field, never logged or returned, and signs only Testnet transactions from the attestation account. On its own it can't get anything accepted, because the account needs the reviewer's signature too. The reviewer's secret key never reaches TUGMA: only its public key is configured.
