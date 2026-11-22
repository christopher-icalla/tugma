import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sdk from "@stellar/stellar-sdk";
import { TESTNET } from "../src/network.js";
import { verifyPackage } from "../src/verify.js";
import { expectedHashFrom, viewModel } from "../web/view.js";
import { exportedPackage, fakeChain } from "./helpers.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the page loads the pinned SDK version with an integrity hash", () => {
  const html = read("../web/index.html");
  const pkg = JSON.parse(read("../package.json"));
  const version = pkg.dependencies["@stellar/stellar-sdk"];
  assert.match(html, new RegExp(`@stellar/stellar-sdk@${version.replace(/\./g, "\\.")}/dist/stellar-sdk\\.min\\.js`));
  assert.match(html, /integrity="sha384-[A-Za-z0-9+/=]{64}"/);
  assert.match(html, /Content-Security-Policy/);
});

test("the page and its scripts never reference TUGMA's API", () => {
  for (const f of ["../web/index.html", "../web/app.js", "../web/view.js", "../src/chain.js", "../src/verify.js", "../src/bulk.js", "../src/multisig.js"]) {
    assert.doesNotMatch(read(f), /\/api\/|REACT_APP_BACKEND_URL|tugma\.(ph|app|io)/i, f);
  }
});

test("the shared Testnet passphrase matches the SDK's", () => {
  assert.equal(TESTNET.networkPassphrase, sdk.Networks.TESTNET);
});

test("view model for a valid and a tampered package", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);

  const ok = viewModel(await verifyPackage(pkg, chain));
  assert.equal(ok.valid, true);
  assert.equal(ok.title, "VALID");
  assert.ok(ok.details.some(([k]) => k === "Attester"));
  assert.match(ok.contractLink, /\/contract\/CC734HZ/);

  pkg.manifest.controls.pop();
  const bad = viewModel(await verifyPackage(pkg, chain));
  assert.equal(bad.valid, false);
  assert.equal(bad.title, "NOT VALID: TAMPERED");
  assert.ok(bad.checks.some((c) => !c.ok));
});

test("a ?hash= link must match the dropped file", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  const result = await verifyPackage(pkg, chain);

  assert.equal(expectedHashFrom(`?hash=${pkg.canonical_hash.toUpperCase()}`), pkg.canonical_hash);
  assert.equal(expectedHashFrom("?hash=nope"), null);
  assert.equal(expectedHashFrom(""), null);

  assert.equal(viewModel(result, undefined, pkg.canonical_hash).valid, true);
  const other = viewModel(result, undefined, "f".repeat(64));
  assert.equal(other.valid, false);
  assert.equal(other.title, "NOT THE LINKED PACKAGE");
});

test("batch view model: one row per file, expandable details", async () => {
  const { verifyMany } = await import("../src/bulk.js");
  const { batchViewModel } = await import("../web/view.js");
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  const tampered = structuredClone(pkg);
  tampered.manifest.controls.pop();

  const bvm = batchViewModel(await verifyMany([
    { name: "good.json", bundle: pkg },
    { name: "bad.json", bundle: tampered },
    { name: "junk.json", error: "not valid JSON" },
  ], chain));
  assert.equal(bvm.valid, false);
  assert.equal(bvm.title, "1 OF 3 VALID");
  assert.deepEqual(bvm.rows.map((r) => [r.name, r.valid, r.title]), [
    ["good.json", true, "VALID"],
    ["bad.json", false, "NOT VALID: TAMPERED"],
    ["junk.json", false, "NOT VALID: INVALID FILE"],
  ]);
  assert.ok(bvm.rows[0].vm.details.length);
  assert.equal(bvm.rows[2].vm, null);
});

test("the file input accepts several files", () => {
  assert.match(read("../web/index.html"), /<input id="file" type="file"[^>]* multiple>/);
});
