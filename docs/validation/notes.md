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
