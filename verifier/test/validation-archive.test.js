/** Rechecks docs/validation offline: package hashes and archived transactions. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as sdk from "@stellar/stellar-sdk";
import { canonicalJson } from "../src/canonical.js";

const dir = new URL("../../docs/validation/", import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, dir), "utf8"));
const results = load("results.json");

test("archived packages re-hash to the recorded SHA-256", () => {
  assert.ok(results.runs.length >= 10);
  for (const run of results.runs) {
    const pkg = load(`packages/tugma-${run.package_id}.json`);
    assert.equal(createHash("sha256").update(canonicalJson(pkg.manifest)).digest("hex"), run.canonical_hash);
  }
});

test("archived attest transactions hash to their id and carry the package hash", () => {
  for (const run of results.runs) {
    const { rpc } = load(`archive/tx-${run.attest_tx}.json`);
    const tx = sdk.TransactionBuilder.fromXDR(rpc.envelopeXdr, "Test SDF Network ; September 2015");
    assert.equal(Buffer.from(tx.hash()).toString("hex"), run.attest_tx);
    assert.ok(Buffer.from(rpc.envelopeXdr, "base64").toString("hex").includes(run.canonical_hash));
    assert.equal(load(`archive/contract-${run.package_id}.json`).attestation.hash, run.canonical_hash);
  }
});
