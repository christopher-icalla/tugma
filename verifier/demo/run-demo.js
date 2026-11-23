#!/usr/bin/env node
/**
 * Demonstration: a valid package passes and an intentionally modified package
 * fails. The packages are checked by the real verifier code; only the contract
 * is an in-memory stand-in, so the demo runs offline and gives the same result
 * every time. docs/verify-a-package.md shows the same steps against the live
 * Testnet contract with a package exported from TUGMA.
 *
 *   pnpm demo
 */
import { formatResult } from "../src/cli.js";
import { canonicalJson } from "../src/canonical.js";
import { sha256Hex } from "../src/hash.js";
import { verifyPackage } from "../src/verify.js";
import { exportedPackage, fakeChain } from "../test/helpers.js";

export async function runDemo(print = console.log) {
  const chain = fakeChain();
  const original = await exportedPackage();
  chain.attest(original); // what TUGMA's attest() records on-chain

  print(
    "OFFLINE DEMO: the verifier code is real; the contract is an in-memory stand-in that\n" +
      "holds one attestation for the original package. For the live Testnet run, see\n" +
      "docs/verify-a-package.md.",
  );
  const steps = [];
  const step = async (title, pkg) => {
    const r = await verifyPackage(pkg, chain);
    steps.push({ title, status: r.status });
    print(`\n=== ${title} ===\n${formatResult(r)}`);
  };

  await step("1. The package exactly as exported", original);

  const edited = structuredClone(original);
  edited.manifest.exceptions = []; // hide the exception from the auditor
  await step("2. Same package with its exception removed", edited);

  const covered = structuredClone(edited);
  covered.canonical_manifest = canonicalJson(covered.manifest);
  covered.canonical_hash = await sha256Hex(covered.canonical_manifest); // and the hash edited to match
  await step("3. Removed exception, with the hash in the file edited to match", covered);

  return steps;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-demo.js")) {
  const steps = await runDemo();
  console.log(`\nSummary: ${steps.map((s) => `${s.title.slice(0, 2)} ${s.status}`).join(" | ")}`);
}
