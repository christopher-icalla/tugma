import { test } from "node:test";
import assert from "node:assert/strict";
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader } from "../src/chain.js";
import { MAX_VERSIONS, verifyPackage, versionHistory } from "../src/verify.js";
import { CONTRACT, ORG, exportedPackage, fakeChain } from "./helpers.js";

async function threeVersions() {
  const chain = fakeChain();
  const files = [];
  for (const rem of [["rem-01"], ["rem-01", "rem-02"], ["rem-01", "rem-02", "rem-03"]]) {
    const base = await exportedPackage();
    const pkg = await exportedPackage({ ...base.manifest, remediations: rem });
    chain.attest(pkg, rem.length === 1 ? { verifier: "GD7MNXQHSVRB5HGUBCQXIEY3WWKOMKCWJTS2KJGR2IR6H2WMCYXHE6TW" } : {});
    files.push(pkg);
  }
  return { chain, files };
}

test("lists every attested version, newest first, and marks the file's", async () => {
  const { chain, files } = await threeVersions();
  const r = await verifyPackage(files[1], chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.attestation.version, 2);
  assert.deepEqual(r.history.versions.map((v) => [v.version, v.matches_file, v.countersigned]), [[3, false, false], [2, true, false], [1, false, true]]);
  assert.equal(r.history.omitted, 0);
  assert.match(r.warnings.join(" "), /version 3 of this package has since been attested/);
});

test("a file matching no version still shows what was attested", async () => {
  const { chain, files } = await threeVersions();
  const forged = await exportedPackage({ ...files[2].manifest, remediations: [] });
  const r = await verifyPackage(forged, chain);
  assert.equal(r.status, "NOT_ATTESTED");
  assert.equal(r.history.count, 3);
  assert.ok(r.history.versions.every((v) => !v.matches_file));
  assert.match(r.warnings.join(" "), /3 version\(s\) .* this file matches none of them/);
});

test("caps the list at MAX_VERSIONS", async () => {
  const chain = {
    versionCount: async () => MAX_VERSIONS + 5,
    get: async (org, id, v) => ({ version: v, hash: String(v).padStart(64, "0"), attested_at: "t", attested_ledger: v, verifier: null }),
  };
  const h = await versionHistory(chain, ORG, "pkg-x", "0".repeat(64));
  assert.equal(h.versions.length, MAX_VERSIONS);
  assert.equal(h.versions[0].version, MAX_VERSIONS + 5);
  assert.equal(h.omitted, 5);
});

test("the chain reader's get() calls get(org, package_id, version)", async () => {
  const calls = [];
  const server = {
    async simulateTransaction(tx) {
      const c = tx.operations[0].func.invokeContract;
      calls.push([String(c.functionName), ...c.args.map((a) => sdk.scValToNative(a))]);
      return { error: "HostError: Error(Contract, #3)" };
    },
  };
  const reader = createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: sdk.Networks.TESTNET }, server);
  assert.equal(await reader.get(ORG, "pkg-a", 2), null);
  assert.deepEqual(calls, [["get", ORG, "pkg-a", 2]]);
});
