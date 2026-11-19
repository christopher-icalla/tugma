import { test } from "node:test";
import assert from "node:assert/strict";
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader } from "../src/chain.js";
import { exportMessage, parseExportMessage } from "../src/signature.js";
import { verifyPackage } from "../src/verify.js";
import { CONTRACT, exportedPackage, fakeChain } from "./helpers.js";

const wallet = sdk.Keypair.random();

/** Signs an export the way the web app does with Freighter (SEP-53). */
function sign(bundle, kp = wallet, over = {}) {
  const message = exportMessage({
    package_id: bundle.package_id, org: bundle.org, canonical_hash: bundle.canonical_hash,
    network_passphrase: bundle.network.passphrase, exported_at: "2026-11-19T08:00:00.000Z", ...over,
  });
  return { scheme: "sep53", signer: kp.publicKey(), message, signature: Buffer.from(kp.signMessage(message)).toString("base64") };
}

async function attested() {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg);
  return { chain, pkg };
}

test("a signed export names its signer and whether they are an authorized signer", async () => {
  const { chain, pkg } = await attested();
  pkg.export_signature = sign(pkg);

  let r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID");
  assert.deepEqual(r.signature, { ok: true, signer: wallet.publicKey(), exported_at: "2026-11-19T08:00:00.000Z", authorized_signer: false });
  assert.match(r.checks.at(-1).detail, /not an authorized signer/);

  chain.signers.add(`${pkg.org}|${wallet.publicKey()}`);
  r = await verifyPackage(pkg, chain);
  assert.equal(r.signature.authorized_signer, true);
});

test("an unsigned export still verifies", async () => {
  const { chain, pkg } = await attested();
  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "VALID");
  assert.equal(r.signature, null);
});

test("a forged or swapped signature is BAD_SIGNATURE", async () => {
  const { chain, pkg } = await attested();
  const forger = sdk.Keypair.random();

  pkg.export_signature = { ...sign(pkg, forger), signer: wallet.publicKey() }; // claims another signer
  assert.equal((await verifyPackage(pkg, chain)).status, "BAD_SIGNATURE");

  pkg.export_signature = sign(pkg, wallet, { canonical_hash: "a".repeat(64) }); // signed a different package
  const r = await verifyPackage(pkg, chain);
  assert.equal(r.status, "BAD_SIGNATURE");
  assert.match(r.signature.problems.join(" "), /signed hash is not this package's hash/);

  const ok = sign(pkg);
  pkg.export_signature = { ...ok, message: ok.message.replace("exported_at: 2026", "exported_at: 2027") }; // edited after signing
  assert.equal((await verifyPackage(pkg, chain)).status, "BAD_SIGNATURE");
});

test("tampering is still reported as TAMPERED, ahead of the signature", async () => {
  const { chain, pkg } = await attested();
  pkg.export_signature = sign(pkg);
  pkg.manifest.transactions = [];
  assert.equal((await verifyPackage(pkg, chain)).status, "TAMPERED");
});

test("export messages round-trip", () => {
  const fields = { package_id: "pkg-a", org: "org_b", canonical_hash: "c".repeat(64), network_passphrase: "Test SDF Network ; September 2015", exported_at: "t" };
  assert.deepEqual(parseExportMessage(exportMessage(fields)), {
    package: "pkg-a", org: "org_b", sha256: "c".repeat(64), network: "Test SDF Network ; September 2015", exported_at: "t",
  });
  assert.equal(parseExportMessage("hello"), null);
});

test("the real chain reader checks SEP-53 signatures with the SDK", () => {
  const reader = createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: sdk.Networks.TESTNET }, {});
  const sig = Buffer.from(wallet.signMessage("hi")).toString("base64");
  assert.equal(reader.verifySignedMessage(wallet.publicKey(), "hi", sig), true);
  assert.equal(reader.verifySignedMessage(wallet.publicKey(), "hI", sig), false);
  assert.equal(reader.verifySignedMessage("not-an-account", "hi", sig), false);
  assert.equal(reader.verifySignedMessage(wallet.publicKey(), "hi", "%%%"), false);
});
