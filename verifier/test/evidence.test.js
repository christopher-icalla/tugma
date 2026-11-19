import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "../src/cli.js";
import { canonicalJson } from "../src/canonical.js";
import { verifyEvidence } from "../src/evidence.js";
import { sha256Hex } from "../src/hash.js";
import { ORG, exportedPackage, fakeChain } from "./helpers.js";

/** An evidence export as GET /api/evidence/:id/export produces it. */
async function evidenceItem(id = "evd-0a1b2c3d4e", hash_input = { name: "Settlement report", type: "DOCUMENT", content: "PHP 9,500.00", source: "core" }) {
  const canonical_hash_input = canonicalJson(hash_input);
  const content_hash = await sha256Hex(canonical_hash_input);
  return { format: "tugma.evidence-item", format_version: 1, evidence_id: id, org: ORG, hash_input, canonical_hash_input, content_hash, manifest_entry: `${id}:${content_hash}` };
}

async function setup() {
  const item = await evidenceItem();
  const base = await exportedPackage();
  const pkg = await exportedPackage({ ...base.manifest, evidence: [item.manifest_entry, "evd-ffffffffff:" + "1".repeat(64)].sort() });
  const chain = fakeChain();
  chain.attest(pkg);
  return { item, pkg, chain };
}

test("a record listed in an attested package is VALID", async () => {
  const { item, pkg, chain } = await setup();
  const r = await verifyEvidence(item, pkg, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.package.status, "VALID");
  assert.ok(r.checks.every((c) => c.ok));
});

test("an edited record is TAMPERED", async () => {
  const { item, pkg, chain } = await setup();
  item.hash_input.content = "PHP 10,000.00";
  assert.equal((await verifyEvidence(item, pkg, chain)).status, "TAMPERED");
});

test("an edited record with its hash recomputed is NOT_IN_PACKAGE", async () => {
  const { pkg, chain } = await setup();
  const forged = await evidenceItem("evd-0a1b2c3d4e", { name: "Settlement report", type: "DOCUMENT", content: "PHP 10,000.00", source: "core" });
  assert.equal((await verifyEvidence(forged, pkg, chain)).status, "NOT_IN_PACKAGE");
});

test("a listed record in a package that fails verification is PACKAGE_NOT_VALID", async () => {
  const { item, pkg } = await setup();
  const r = await verifyEvidence(item, pkg, fakeChain()); // nothing attested
  assert.equal(r.status, "PACKAGE_NOT_VALID");
  assert.equal(r.package.status, "NOT_ATTESTED");
});

test("rejects files that are not evidence exports", async () => {
  const { pkg, chain } = await setup();
  assert.equal((await verifyEvidence(pkg, pkg, chain)).status, "INVALID_FILE");
});

test("CLI: tugma-verify evidence <item> --package <pkg>", async () => {
  const { item, pkg, chain } = await setup();
  const files = { "item.json": item, "pkg.json": pkg };
  const out = [];
  const code = await main(["evidence", "item.json", "--package", "pkg.json"], {
    stdout: (s) => out.push(s), stderr: (s) => out.push(s),
    readFile: async (f) => JSON.stringify(files[f]), reader: () => chain,
  });
  assert.equal(code, 0);
  assert.match(out.join("\n"), /^VALID: this evidence record is listed in the package/);
  assert.match(out.join("\n"), /Package check:\n {2}VALID/);

  const err = [];
  const usage = await main(["evidence", "item.json"], { stdout: () => {}, stderr: (s) => err.push(s), reader: () => chain });
  assert.equal(usage, 2);
  assert.match(err.join(""), /needs --package/);
});
