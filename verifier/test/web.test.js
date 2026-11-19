import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sdk from "@stellar/stellar-sdk";
import { TESTNET } from "../src/network.js";
import { verifyPackage } from "../src/verify.js";
import { viewModel } from "../web/view.js";
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
  for (const f of ["../web/index.html", "../web/app.js", "../web/view.js", "../src/chain.js", "../src/verify.js"]) {
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
