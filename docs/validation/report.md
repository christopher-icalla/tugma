# Validation report

Run 2026-11-24T11:48:54.326Z to 2026-11-24T11:51:56.972Z. Generated from [results.json](results.json) by `verifier/validation/render-report.mjs`.

**47 of 47 recorded checks passed; 10 of 10 end-to-end runs passed.**

## What this run does and does not show

- It ran against a **separate validation deployment** of the same WASM, with throwaway keys. It is not the public TUGMA contract.
- All data is synthetic. The wallets are keys held by the script, not Freighter; Freighter was not exercised.
- The API was a local instance of this repository, not tugmaapp.com. In the API-unavailable run that local instance was stopped, and the verifier's sockets were limited to Stellar.
- The recorded run is [GitHub run 45387519937](https://github.com/christopher-icalla/tugma/actions/runs/45387519937) at c770d47.
- **No independent walkthrough has been done.** See [walkthrough.md](walkthrough.md). Scripted attempts do not count as independent verification.
- [verification-run.webm](verification-run.webm) is a scripted recording of the browser verifier. It is not the 3–5 minute demonstration video.

## Earlier attempts

| Attempt | Outcome |
|---|---|
| Local 1 | The built API did not start: `express` was imported but not declared. Fixed in 68ca376 |
| Local 2 | Stopped: the disk filled and Postgres crashed; 7 of 10 end-to-end runs had passed |
| Local 3 | Stopped: the disk filled again; 5 of 10 runs had passed |
| [GitHub run 45386696248](https://github.com/christopher-icalla/tugma/actions/runs/45386696248) | 47 of 48 checks passed. A self-countersign check ran after the package was countersigned and got 409 instead of 403. Test order fixed in c770d47 |

## Unresolved

- On November 24 the tugmaapp.com bundle did not contain the package download, signed export or QR code features.
- The public contract holds only a smoke-test attestation from September 28 under the old readable organization id.
- Independent walkthroughs and the demonstration video are outstanding.

## Environment

| | |
|---|---|
| Network | Stellar Testnet |
| Validation contract | [`CCP6DCRYYXCCWHAHKMZMRRADVOEZYW5BSGVFUTLDUU5TFP26LL2NN6L5`](https://stellar.expert/explorer/testnet/contract/CCP6DCRYYXCCWHAHKMZMRRADVOEZYW5BSGVFUTLDUU5TFP26LL2NN6L5) |
| Public TUGMA contract (not used in this run) | `CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH` |
| WASM hash (the same for both) | `90e859d243cb53174b1dfe94ec8d0d36ebc1db16f3d2eacd9b3939f60143d948` |
| Look-alike contract | `CBFI7UUSFMMJADUPOXGFPTN6E77GF6FRTHHUY22KMA3LDSHK7I7JENL4` |
| Organization | `org_1af1d73aa083427deb0aa9fa40fa9161` |
| Attester | `GBQ5I3QWHUZRH7VGJQVNLZJRM5RXIDHJG4VFSYXZJ2A265WA2HJ76JRA` |
| Countersigner | `GB5IBIY7OCPFQAUG2BSPQ7S2GJTYGJA5HL7TQVX72Q3DNAX2MRJSZKZN` |

## End-to-end runs

Each run goes through the HTTP API: control run, exception, remediation, evidence, verification by another role, package, SHA-256, attestation, countersignature, re-sync, export, standalone verifier.

| Run | Transaction | Package | SHA-256 | Attest | Countersign | Steps | Result |
|---|---|---|---|---|---|---|---|
| E1 | TX-847291 | pkg-2026-01-01-2026-01-01 | `b86e78f5559f3be2…` | [cee411191b…](https://stellar.expert/explorer/testnet/tx/cee411191b7230f43d2898d1c33cda3468212cd34a5ab97934050e7d2b52adff) ([JSON](archive/tx-cee411191b7230f43d2898d1c33cda3468212cd34a5ab97934050e7d2b52adff.json)) | [86e30cc3be…](https://stellar.expert/explorer/testnet/tx/86e30cc3beaa626636788f3b9e8ac6d128d081530a9a1923ac2db96cc56553af) ([JSON](archive/tx-86e30cc3beaa626636788f3b9e8ac6d128d081530a9a1923ac2db96cc56553af.json)) | 11/11 | Pass |
| E2 | TX-118286 | pkg-2026-01-12-2026-01-12 | `d26ad4bee4d1a2d3…` | [7d5599e457…](https://stellar.expert/explorer/testnet/tx/7d5599e4573ddf3778c3c79e1be31d81cc96f44c75961aa3785f96926b3ba629) ([JSON](archive/tx-7d5599e4573ddf3778c3c79e1be31d81cc96f44c75961aa3785f96926b3ba629.json)) | [0d7089cbfa…](https://stellar.expert/explorer/testnet/tx/0d7089cbfaa9e6c3232f9d9355806169e0f59dbb9b72b5d694809332897f99f3) ([JSON](archive/tx-0d7089cbfaa9e6c3232f9d9355806169e0f59dbb9b72b5d694809332897f99f3.json)) | 11/11 | Pass |
| E3 | TX-118544 | pkg-2026-01-11-2026-01-11 | `02eaca9a2a471c29…` | [72894596a2…](https://stellar.expert/explorer/testnet/tx/72894596a2c4b4b40a5a46c2a19610b016d7c2d03b10931893a29612ae3f65a4) ([JSON](archive/tx-72894596a2c4b4b40a5a46c2a19610b016d7c2d03b10931893a29612ae3f65a4.json)) | [be1e4d3067…](https://stellar.expert/explorer/testnet/tx/be1e4d30676cc5aa606de525769dc6213a9c6b68192a7b788fae141a24f71a01) ([JSON](archive/tx-be1e4d30676cc5aa606de525769dc6213a9c6b68192a7b788fae141a24f71a01.json)) | 11/11 | Pass |
| E4 | TX-138445 | pkg-2026-01-17-2026-01-17 | `5e0db226acfc42b2…` | [853556fc6b…](https://stellar.expert/explorer/testnet/tx/853556fc6bf1d47433cbc7ce52b8209826256cc0bd721fa4b8b27e1321245a3d) ([JSON](archive/tx-853556fc6bf1d47433cbc7ce52b8209826256cc0bd721fa4b8b27e1321245a3d.json)) | [9d1c811fab…](https://stellar.expert/explorer/testnet/tx/9d1c811fabd464aae6e75e653afa97cc8035b63825819058bcb620bf61b51338) ([JSON](archive/tx-9d1c811fabd464aae6e75e653afa97cc8035b63825819058bcb620bf61b51338.json)) | 11/11 | Pass |
| E5 | TX-176752 | pkg-2026-01-06-2026-01-06 | `ab815dae12f001cf…` | [181e94691a…](https://stellar.expert/explorer/testnet/tx/181e94691af1319cee968d86e6ae97f74d85c9374823e4c268d2698344589755) ([JSON](archive/tx-181e94691af1319cee968d86e6ae97f74d85c9374823e4c268d2698344589755.json)) | [163bd69314…](https://stellar.expert/explorer/testnet/tx/163bd69314c01b014b031ffc2cdbfa0719963ffb2533ddfc80231265e99a89e7) ([JSON](archive/tx-163bd69314c01b014b031ffc2cdbfa0719963ffb2533ddfc80231265e99a89e7.json)) | 11/11 | Pass |
| E6 | TX-180407 | pkg-2026-01-08-2026-01-08 | `b8b59535068edf85…` | [08bf475773…](https://stellar.expert/explorer/testnet/tx/08bf475773c2615d7be89dddf0998d263996d28c5aebb32341c1728732eac177) ([JSON](archive/tx-08bf475773c2615d7be89dddf0998d263996d28c5aebb32341c1728732eac177.json)) | [926333be90…](https://stellar.expert/explorer/testnet/tx/926333be90aedd84cd9e1261a39bdc30feb831998c93c2e742d7918e0b89e2ae) ([JSON](archive/tx-926333be90aedd84cd9e1261a39bdc30feb831998c93c2e742d7918e0b89e2ae.json)) | 11/11 | Pass |
| E7 | TX-187322 | pkg-2026-01-03-2026-01-03 | `38f00c1a0e5a5f0a…` | [c4a396358c…](https://stellar.expert/explorer/testnet/tx/c4a396358c803229a76ea869c84ea0dfe07fa2e1a92886a3cef492c5f1a76f98) ([JSON](archive/tx-c4a396358c803229a76ea869c84ea0dfe07fa2e1a92886a3cef492c5f1a76f98.json)) | [ca8c8c73c8…](https://stellar.expert/explorer/testnet/tx/ca8c8c73c8ed6075deb82b8d272e3b34586f9db6bd454f06fba6cfcf60156d80) ([JSON](archive/tx-ca8c8c73c8ed6075deb82b8d272e3b34586f9db6bd454f06fba6cfcf60156d80.json)) | 11/11 | Pass |
| E8 | TX-251441 | pkg-2026-01-21-2026-01-21 | `f9f6bff5f65c03a1…` | [1043275608…](https://stellar.expert/explorer/testnet/tx/1043275608eb850b3638f346f2a4951cbd3f5367f82121c2e51a1c48409f4eaa) ([JSON](archive/tx-1043275608eb850b3638f346f2a4951cbd3f5367f82121c2e51a1c48409f4eaa.json)) | [c791acdd54…](https://stellar.expert/explorer/testnet/tx/c791acdd5448e68174e720867d9ac6af9119a6cf95c9c7347e846d8086d80586) ([JSON](archive/tx-c791acdd5448e68174e720867d9ac6af9119a6cf95c9c7347e846d8086d80586.json)) | 11/11 | Pass |
| E9 | TX-256109 | pkg-2026-01-20-2026-01-20 | `b222ebb62079c44c…` | [6b52012ef3…](https://stellar.expert/explorer/testnet/tx/6b52012ef37b42b166f1ff60b44b130457b731e5a1bb1d2546b972574410fbde) ([JSON](archive/tx-6b52012ef37b42b166f1ff60b44b130457b731e5a1bb1d2546b972574410fbde.json)) | [504b0dcb96…](https://stellar.expert/explorer/testnet/tx/504b0dcb966811ab46d6e8206c37da80c2273402fca4ec94998667941f63cdaf) ([JSON](archive/tx-504b0dcb966811ab46d6e8206c37da80c2273402fca4ec94998667941f63cdaf.json)) | 11/11 | Pass |
| E10 | TX-317681 | pkg-2026-01-05-2026-01-05 | `a2ca484aaec851f4…` | [bfa91ce9cb…](https://stellar.expert/explorer/testnet/tx/bfa91ce9cb7bd464d3db76b6eb05fe90eb68c6c82eae0fcf51b2484f07fff71a) ([JSON](archive/tx-bfa91ce9cb7bd464d3db76b6eb05fe90eb68c6c82eae0fcf51b2484f07fff71a.json)) | [9da6395177…](https://stellar.expert/explorer/testnet/tx/9da6395177af6915680e488fe9ccabe63ab2871718e9c0cf46cf34022a5b2251) ([JSON](archive/tx-9da6395177af6915680e488fe9ccabe63ab2871718e9c0cf46cf34022a5b2251.json)) | 11/11 | Pass |

## Tamper tests

| ID | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| T1 | exception removed from the manifest | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| T2 | exception removed, canonical form and hash rewritten to match | status NOT_ATTESTED, exit 1 | status NOT_ATTESTED, exit 1 | Pass |
| T3 | only canonical_manifest edited | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| T4 | only the declared hash edited | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| T5 | evidence content hash replaced | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| T6 | package id changed | status MISMATCH, exit 1 | status MISMATCH, exit 1 | Pass |
| T7 | organization id changed | status MISMATCH, exit 1 | status MISMATCH, exit 1 | Pass |
| T8 | period changed | status MISMATCH, exit 1 | status MISMATCH, exit 1 | Pass |
| T9 | completeness count raised | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| T10 | truncated file | status null, exit 2 | status null, exit 2 | Pass |
| T11 | forged package attested on a look-alike contract that the file names | status NOT_ATTESTED, exit 1 | status NOT_ATTESTED, exit 1 | Pass |
| T11b | the verifier warns that the file names another contract | true | true | Pass |
| V1 | unmodified evidence record | status VALID, exit 0 | status VALID, exit 0 | Pass |
| T12 | evidence record content changed | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| V2 | superseded version 1 still verifies and is reported as not the latest | status VALID, exit 0, latest 2 | status VALID, exit 0, latest 2 | Pass |

## Contract rejections

Simulated against live contract state; nothing is submitted.

| ID | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| C1 | attest by an unauthorized wallet | Error(Contract, #1) | Error(Contract, #1) | Pass |
| C2 | attest a hash that is already attested | Error(Contract, #2) | Error(Contract, #2) | Pass |
| C3 | read a version that does not exist | Error(Contract, #3) | Error(Contract, #3) | Pass |
| C4 | countersign an already countersigned version | Error(Contract, #4) | Error(Contract, #4) | Pass |

## Access

| ID | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| A-auditor | auditor cannot prepare an attestation | 403 | 403 | Pass |
| A-viewer | viewer cannot prepare an attestation | 403 | 403 | Pass |
| A-anon | export without a session | 401 | 401 | Pass |

## API-unavailable run

The API process is stopped. The verifier runs with a socket guard that refuses every host except Stellar's RPC and Horizon.

| ID | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| U1 | API health check | ECONNREFUSED | ECONNREFUSED | Pass |
| U2 | verify pkg-2026-01-01-2026-01-01 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U3 | verify pkg-2026-01-12-2026-01-12 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U4 | verify pkg-2026-01-11-2026-01-11 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U5 | verify pkg-2026-01-17-2026-01-17 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U6 | verify pkg-2026-01-06-2026-01-06 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U7 | verify pkg-2026-01-08-2026-01-08 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U8 | verify pkg-2026-01-03-2026-01-03 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U9 | verify pkg-2026-01-21-2026-01-21 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U10 | verify pkg-2026-01-20-2026-01-20 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U11 | verify pkg-2026-01-05-2026-01-05 | status VALID, exit 0 | status VALID, exit 0 | Pass |
| U-tampered | verify T1 (modified package) | status TAMPERED, exit 1 | status TAMPERED, exit 1 | Pass |
| U-forged | verify T2 (modified and resealed) | status NOT_ATTESTED, exit 1 | status NOT_ATTESTED, exit 1 | Pass |
| U-hosts | the only hosts contacted are Stellar's | true | true | Pass |
| U-rpc | Soroban RPC also unreachable: fails closed | status null, exit 3 | status null, exit 3 | Pass |

Hosts contacted: `horizon-testnet.stellar.org`, `soroban-testnet.stellar.org`.

## All transactions

| Purpose | Ledger | Transaction |
|---|---|---|
| Deploy validation contract | 5899463 | [12d1918977…](https://stellar.expert/explorer/testnet/tx/12d19189771e6c2100a4dbaeb0c592a9f31e675360c15a765fa31412ab0d543c) ([JSON](archive/tx-12d19189771e6c2100a4dbaeb0c592a9f31e675360c15a765fa31412ab0d543c.json)) |
| Deploy look-alike contract | 5899464 | [0aea61f91c…](https://stellar.expert/explorer/testnet/tx/0aea61f91c7b70fcb00038105b68ae911f4225635023024aa258c686865fe9c0) ([JSON](archive/tx-0aea61f91c7b70fcb00038105b68ae911f4225635023024aa258c686865fe9c0.json)) |
| Authorize signer | 5899467 | [436e3d3941…](https://stellar.expert/explorer/testnet/tx/436e3d39415e1647c48272bc9820c4d7da3d3b846a1e1f0fe00bdb6354831922) ([JSON](archive/tx-436e3d39415e1647c48272bc9820c4d7da3d3b846a1e1f0fe00bdb6354831922.json)) |
| Authorize signer | 5899468 | [32191294f6…](https://stellar.expert/explorer/testnet/tx/32191294f6a4eefb6d268c9df83c7e410a1a7ef4a76b5a9829dcfc47a3d0a7d2) ([JSON](archive/tx-32191294f6a4eefb6d268c9df83c7e410a1a7ef4a76b5a9829dcfc47a3d0a7d2.json)) |
| E1: attest pkg-2026-01-01-2026-01-01 | 5899469 | [cee411191b…](https://stellar.expert/explorer/testnet/tx/cee411191b7230f43d2898d1c33cda3468212cd34a5ab97934050e7d2b52adff) ([JSON](archive/tx-cee411191b7230f43d2898d1c33cda3468212cd34a5ab97934050e7d2b52adff.json)) |
| E1: countersign pkg-2026-01-01-2026-01-01 | 5899470 | [86e30cc3be…](https://stellar.expert/explorer/testnet/tx/86e30cc3beaa626636788f3b9e8ac6d128d081530a9a1923ac2db96cc56553af) ([JSON](archive/tx-86e30cc3beaa626636788f3b9e8ac6d128d081530a9a1923ac2db96cc56553af.json)) |
| E2: attest pkg-2026-01-12-2026-01-12 | 5899471 | [7d5599e457…](https://stellar.expert/explorer/testnet/tx/7d5599e4573ddf3778c3c79e1be31d81cc96f44c75961aa3785f96926b3ba629) ([JSON](archive/tx-7d5599e4573ddf3778c3c79e1be31d81cc96f44c75961aa3785f96926b3ba629.json)) |
| E2: countersign pkg-2026-01-12-2026-01-12 | 5899472 | [0d7089cbfa…](https://stellar.expert/explorer/testnet/tx/0d7089cbfaa9e6c3232f9d9355806169e0f59dbb9b72b5d694809332897f99f3) ([JSON](archive/tx-0d7089cbfaa9e6c3232f9d9355806169e0f59dbb9b72b5d694809332897f99f3.json)) |
| E3: attest pkg-2026-01-11-2026-01-11 | 5899473 | [72894596a2…](https://stellar.expert/explorer/testnet/tx/72894596a2c4b4b40a5a46c2a19610b016d7c2d03b10931893a29612ae3f65a4) ([JSON](archive/tx-72894596a2c4b4b40a5a46c2a19610b016d7c2d03b10931893a29612ae3f65a4.json)) |
| E3: countersign pkg-2026-01-11-2026-01-11 | 5899474 | [be1e4d3067…](https://stellar.expert/explorer/testnet/tx/be1e4d30676cc5aa606de525769dc6213a9c6b68192a7b788fae141a24f71a01) ([JSON](archive/tx-be1e4d30676cc5aa606de525769dc6213a9c6b68192a7b788fae141a24f71a01.json)) |
| E4: attest pkg-2026-01-17-2026-01-17 | 5899475 | [853556fc6b…](https://stellar.expert/explorer/testnet/tx/853556fc6bf1d47433cbc7ce52b8209826256cc0bd721fa4b8b27e1321245a3d) ([JSON](archive/tx-853556fc6bf1d47433cbc7ce52b8209826256cc0bd721fa4b8b27e1321245a3d.json)) |
| E4: countersign pkg-2026-01-17-2026-01-17 | 5899476 | [9d1c811fab…](https://stellar.expert/explorer/testnet/tx/9d1c811fabd464aae6e75e653afa97cc8035b63825819058bcb620bf61b51338) ([JSON](archive/tx-9d1c811fabd464aae6e75e653afa97cc8035b63825819058bcb620bf61b51338.json)) |
| E5: attest pkg-2026-01-06-2026-01-06 | 5899477 | [181e94691a…](https://stellar.expert/explorer/testnet/tx/181e94691af1319cee968d86e6ae97f74d85c9374823e4c268d2698344589755) ([JSON](archive/tx-181e94691af1319cee968d86e6ae97f74d85c9374823e4c268d2698344589755.json)) |
| E5: countersign pkg-2026-01-06-2026-01-06 | 5899478 | [163bd69314…](https://stellar.expert/explorer/testnet/tx/163bd69314c01b014b031ffc2cdbfa0719963ffb2533ddfc80231265e99a89e7) ([JSON](archive/tx-163bd69314c01b014b031ffc2cdbfa0719963ffb2533ddfc80231265e99a89e7.json)) |
| E6: attest pkg-2026-01-08-2026-01-08 | 5899479 | [08bf475773…](https://stellar.expert/explorer/testnet/tx/08bf475773c2615d7be89dddf0998d263996d28c5aebb32341c1728732eac177) ([JSON](archive/tx-08bf475773c2615d7be89dddf0998d263996d28c5aebb32341c1728732eac177.json)) |
| E6: countersign pkg-2026-01-08-2026-01-08 | 5899480 | [926333be90…](https://stellar.expert/explorer/testnet/tx/926333be90aedd84cd9e1261a39bdc30feb831998c93c2e742d7918e0b89e2ae) ([JSON](archive/tx-926333be90aedd84cd9e1261a39bdc30feb831998c93c2e742d7918e0b89e2ae.json)) |
| E7: attest pkg-2026-01-03-2026-01-03 | 5899481 | [c4a396358c…](https://stellar.expert/explorer/testnet/tx/c4a396358c803229a76ea869c84ea0dfe07fa2e1a92886a3cef492c5f1a76f98) ([JSON](archive/tx-c4a396358c803229a76ea869c84ea0dfe07fa2e1a92886a3cef492c5f1a76f98.json)) |
| E7: countersign pkg-2026-01-03-2026-01-03 | 5899482 | [ca8c8c73c8…](https://stellar.expert/explorer/testnet/tx/ca8c8c73c8ed6075deb82b8d272e3b34586f9db6bd454f06fba6cfcf60156d80) ([JSON](archive/tx-ca8c8c73c8ed6075deb82b8d272e3b34586f9db6bd454f06fba6cfcf60156d80.json)) |
| E8: attest pkg-2026-01-21-2026-01-21 | 5899483 | [1043275608…](https://stellar.expert/explorer/testnet/tx/1043275608eb850b3638f346f2a4951cbd3f5367f82121c2e51a1c48409f4eaa) ([JSON](archive/tx-1043275608eb850b3638f346f2a4951cbd3f5367f82121c2e51a1c48409f4eaa.json)) |
| E8: countersign pkg-2026-01-21-2026-01-21 | 5899484 | [c791acdd54…](https://stellar.expert/explorer/testnet/tx/c791acdd5448e68174e720867d9ac6af9119a6cf95c9c7347e846d8086d80586) ([JSON](archive/tx-c791acdd5448e68174e720867d9ac6af9119a6cf95c9c7347e846d8086d80586.json)) |
| E9: attest pkg-2026-01-20-2026-01-20 | 5899485 | [6b52012ef3…](https://stellar.expert/explorer/testnet/tx/6b52012ef37b42b166f1ff60b44b130457b731e5a1bb1d2546b972574410fbde) ([JSON](archive/tx-6b52012ef37b42b166f1ff60b44b130457b731e5a1bb1d2546b972574410fbde.json)) |
| E9: countersign pkg-2026-01-20-2026-01-20 | 5899486 | [504b0dcb96…](https://stellar.expert/explorer/testnet/tx/504b0dcb966811ab46d6e8206c37da80c2273402fca4ec94998667941f63cdaf) ([JSON](archive/tx-504b0dcb966811ab46d6e8206c37da80c2273402fca4ec94998667941f63cdaf.json)) |
| E10: attest pkg-2026-01-05-2026-01-05 | 5899487 | [bfa91ce9cb…](https://stellar.expert/explorer/testnet/tx/bfa91ce9cb7bd464d3db76b6eb05fe90eb68c6c82eae0fcf51b2484f07fff71a) ([JSON](archive/tx-bfa91ce9cb7bd464d3db76b6eb05fe90eb68c6c82eae0fcf51b2484f07fff71a.json)) |
| E10: countersign pkg-2026-01-05-2026-01-05 | 5899488 | [9da6395177…](https://stellar.expert/explorer/testnet/tx/9da6395177af6915680e488fe9ccabe63ab2871718e9c0cf46cf34022a5b2251) ([JSON](archive/tx-9da6395177af6915680e488fe9ccabe63ab2871718e9c0cf46cf34022a5b2251.json)) |
| Look-alike: authorize signer | 5899490 | [2f77a3cd05…](https://stellar.expert/explorer/testnet/tx/2f77a3cd05fc4b6da7ee646bb7d8ab87dc91353cd3b73c20ed25c7599742a5eb) ([JSON](archive/tx-2f77a3cd05fc4b6da7ee646bb7d8ab87dc91353cd3b73c20ed25c7599742a5eb.json)) |
| Look-alike: attest forged package | 5899491 | [04d46e6a44…](https://stellar.expert/explorer/testnet/tx/04d46e6a44720607bf81f078a321c0f158f9b64329404698796f6c4b842df619) ([JSON](archive/tx-04d46e6a44720607bf81f078a321c0f158f9b64329404698796f6c4b842df619.json)) |
| Re-attest pkg-2026-01-01-2026-01-01 as version 2 | 5899492 | [682a91ce48…](https://stellar.expert/explorer/testnet/tx/682a91ce4891a2f7637815925204f3d955ffe825a3dff215ae842535c3c5466d) ([JSON](archive/tx-682a91ce4891a2f7637815925204f3d955ffe825a3dff215ae842535c3c5466d.json)) |

## Failures in this run

None.
