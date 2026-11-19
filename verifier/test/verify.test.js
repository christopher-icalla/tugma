import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson } from "../src/canonical.js";
import { sha256Hex } from "../src/hash.js";
import { LIMITATION, verifyPackage } from "../src/verify.js";
import { exportedPackage, fakeChain } from "./helpers.js";

const COUNTERSIGNER = "GD7MNXQHSVRB5HGUBCQXIEY3WWKOMKCWJTS2KJGR2IR6H2WMCYXHE6TW";

test("a package attested on-chain verifies", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg, { verifier: COUNTERSIGNER, verified_at: "2026-11-12T04:00:00.000Z" });

  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.valid, true);
  assert.equal(r.recomputed_hash, pkg.canonical_hash);
  assert.equal(r.attestation.version, 1);
  assert.equal(r.latest_version, 1);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.checks.every((c) => c.ok));
  assert.equal(r.limitation, LIMITATION);
});

test("a package changed after export fails as TAMPERED", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  pkg.manifest.exceptions = []; // hide the exception

  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "TAMPERED");
  assert.equal(r.valid, false);
  assert.notEqual(r.recomputed_hash, pkg.canonical_hash);
  assert.equal(r.attestation, null);
});

test("editing the declared hash to match a changed package does not help", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  pkg.manifest.counts.completeness = 0;
  pkg.canonical_manifest = canonicalJson(pkg.manifest);
  pkg.canonical_hash = await sha256Hex(pkg.canonical_manifest);

  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "NOT_ATTESTED");
  assert.equal(r.valid, false);
});

test("an edited canonical_manifest is caught even if the manifest is untouched", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  pkg.canonical_manifest = pkg.canonical_manifest.replace("TX-847291", "TX-000000");

  assert.equal((await verifyPackage(pkg, chain)).status, "TAMPERED");
});

test("a package that was never attested is NOT_ATTESTED", async () => {
  const r = await verifyPackage(await exportedPackage(), fakeChain());
  assert.equal(r.status, "NOT_ATTESTED");
  assert.match(r.checks.find((c) => c.name === "On-chain attestation").detail, /no attestation/);
});

test("an attestation for another package or organization is a MISMATCH", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);

  assert.equal((await verifyPackage({ ...pkg, package_id: "pkg-2025-01-01-2025-03-31" }, chain)).status, "MISMATCH");
  assert.equal((await verifyPackage({ ...pkg, org: "org_00000000000000000000000000000000" }, chain)).status, "MISMATCH");
});

test("files that are not package exports are INVALID_FILE", async () => {
  const chain = fakeChain();
  assert.equal((await verifyPackage({ hello: "world" }, chain)).status, "INVALID_FILE");
  assert.equal((await verifyPackage(null, chain)).status, "INVALID_FILE");
  const pkg = await exportedPackage();
  assert.equal((await verifyPackage({ ...pkg, format_version: 2 }, chain)).status, "INVALID_FILE");
});

test("the contract named in the file is never used, only reported", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  pkg.network.contract_id = "CBADCONTRACTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.contract_id, chain.contractId);
  assert.match(r.warnings.join(" "), /never takes the contract from the file/);
});

test("warns about superseded and uncountersigned versions", async () => {
  const chain = fakeChain();
  const v1 = await exportedPackage();
  chain.attest(v1);
  const v2 = await exportedPackage({ ...structuredClone(v1.manifest), remediations: ["rem-01", "rem-02"] });
  chain.attest(v2);

  const r = await verifyPackage(v1, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.latest_version, 2);
  assert.match(r.warnings.join(" "), /version 2 of this package has since been attested/);
  assert.match(r.warnings.join(" "), /not been countersigned/);
});
