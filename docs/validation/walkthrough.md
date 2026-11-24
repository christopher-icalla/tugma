# Independent walkthroughs

**Status: not done.** No independent walkthrough has been recorded. The scripted runs in [report.md](report.md) do not count as walkthroughs.

Two people who did not write the code or finalize the package each follow the script without help from the team and fill in their own record. The target in the statement of work is 10 independent verification attempts in total.

## Script

1. Clone the repository; in `verifier/`, run `corepack enable` and `pnpm install --frozen-lockfile`.
2. Pick a package in `docs/validation/packages/` and note the validation contract id in [report.md](report.md).
3. Run `node bin/tugma-verify.js <package> --contract <contract id>`. Note the result and exit code.
4. Copy the package, change one value in `manifest`, and verify the copy.
5. In the copy, also rewrite `canonical_manifest` and `canonical_hash` to match, and verify again.
6. Open the attestation's transaction on Stellar Expert and compare the `hash` argument with the verifier's.
7. Repeat step 3 in the [browser verifier](https://christopher-icalla.github.io/tugma/verifier/web/), setting the contract under Network settings.

## Record (one per reviewer)

| Field | Entry |
|---|---|
| Reviewer name or role, and relation to the project | |
| Date and time (UTC) | |
| Operating system, Node.js version, browser | |
| Commit checked out | |
| Package id | |
| Step 3: status and exit code | |
| Step 4: status and exit code | |
| Step 5: status and exit code | |
| Step 6: hashes match? | |
| Step 7: status | |
| Where the instructions were unclear | |
| Problems found | |
| Overall: pass or fail | |
