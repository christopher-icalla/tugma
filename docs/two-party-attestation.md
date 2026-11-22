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
