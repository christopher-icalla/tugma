import { test } from "node:test";
import assert from "node:assert/strict";
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader } from "../src/chain.js";
import { main } from "../src/cli.js";
import { auditSigners } from "../src/signers.js";
import { CONTRACT, ORG, exportedPackage, fakeChain } from "./helpers.js";

const A = sdk.Keypair.random().publicKey();
const B = sdk.Keypair.random().publicKey();
const C = sdk.Keypair.random().publicKey();

async function history() {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg, { attester: A, verifier: B, verified_at: "2026-11-12T04:00:00.000Z" });
  chain.attest({ ...pkg, canonical_hash: "1".repeat(64) }, { attester: A, verifier: null });
  chain.attest({ ...pkg, canonical_hash: "2".repeat(64) }, { attester: C, verifier: C, verified_at: "2026-11-13T00:00:00.000Z" });
  chain.signers.add(`${ORG}|${A}`);
  chain.signers.add(`${ORG}|${B}`);
  chain.signerChanges = async () => ({ from_ledger: 100, latest_ledger: 200, changes: [{ signer: C, authorized: false, ledger: 150, at: "2026-11-14T00:00:00.000Z", tx_hash: "ab".repeat(32) }] });
  return { chain, pkg };
}

test("auditSigners lists every version, its wallets and their status", async () => {
  const { chain, pkg } = await history();
  const a = await auditSigners(chain, pkg.org, pkg.package_id);
  assert.equal(a.version_count, 3);
  assert.equal(a.ok, false);
  assert.deepEqual(a.problems, ["v2: not countersigned", "v3: countersigned by the attesting wallet"]);
  assert.deepEqual(a.versions.map((v) => v.version), [1, 2, 3]);
  const w = Object.fromEntries(a.wallets.map((x) => [x.address, x]));
  assert.deepEqual(w[A].attested, [1, 2]);
  assert.deepEqual(w[B].countersigned, [1]);
  assert.equal(w[C].authorized_now, false);
  assert.ok(a.notes.includes(`${C} signed v3 but is no longer an authorized signer.`));
  assert.equal(a.signer_changes.changes[0].authorized, false);
});

test("a clean history is ok, and an RPC event failure is only a note", async () => {
  const chain = fakeChain();
  const pkg = await exportedPackage();
  chain.attest(pkg, { attester: A, verifier: B, verified_at: "2026-11-12T04:00:00.000Z" });
  chain.signers.add(`${ORG}|${A}`).add(`${ORG}|${B}`);
  chain.signerChanges = async () => { throw new Error("start ledger out of range"); };
  const a = await auditSigners(chain, pkg.org, pkg.package_id);
  assert.equal(a.ok, true);
  assert.equal(a.signer_changes, null);
  assert.match(a.notes[0], /could not be read from the RPC: start ledger out of range/);

  assert.equal((await auditSigners(fakeChain(), ORG, "pkg-none")).ok, false);
});

const cursorAt = (ledger) => `${(BigInt(ledger) << 32n).toString().padStart(19, "0")}-4294967295`;

test("signerChanges follows the cursor past empty pages to the latest ledger", async () => {
  const value = sdk.nativeToScVal({ authorized: true, signer: new sdk.Address(A) });
  const pages = [
    { events: [], cursor: cursorAt(15000) },
    { events: [], cursor: cursorAt(25000) },
    { events: [{ ledger: 26000, txHash: "ab".repeat(32), value }], cursor: cursorAt(30000) },
  ];
  const seen = [];
  const server = {
    async getHealth() { return { oldestLedger: 5000, latestLedger: 30000 }; },
    async getEvents(req) { seen.push(req); return pages[seen.length - 1]; },
  };
  const reader = createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: sdk.Networks.TESTNET }, server);
  const r = await reader.signerChanges(ORG);
  assert.deepEqual(r.changes.map((c) => c.ledger), [26000]);
  assert.deepEqual(seen.map((q) => q.cursor), [undefined, cursorAt(15000), cursorAt(25000)]);
  await assert.rejects(reader.signerChanges(ORG, { maxPages: 0 }), /up to the latest ledger/);
});

test("signerChanges refuses a partial list when the cursor stops moving", async () => {
  const server = {
    async getHealth() { return { oldestLedger: 5000, latestLedger: 30000 }; },
    async getEvents() { return { events: [], cursor: cursorAt(15000) }; },
  };
  const reader = createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: sdk.Networks.TESTNET }, server);
  await assert.rejects(reader.signerChanges(ORG), /up to the latest ledger/);
});

test("signerChanges reads signer_changed events through Soroban RPC", async () => {
  const seen = [];
  const server = {
    async getHealth() { return { oldestLedger: 5000, latestLedger: 9000 }; },
    async getEvents(req) {
      seen.push(req);
      const value = sdk.nativeToScVal({ authorized: true, signer: new sdk.Address(A) });
      return { events: [{ ledger: 6000, ledgerClosedAt: "2026-11-15T01:02:03Z", txHash: "cd".repeat(32), value }], cursor: cursorAt(9000) };
    },
  };
  const reader = createChainReader(sdk, { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: sdk.Networks.TESTNET }, server);
  const r = await reader.signerChanges(ORG);
  assert.equal(r.from_ledger, 5001);
  assert.deepEqual(r.changes, [{ signer: A, authorized: true, ledger: 6000, at: "2026-11-15T01:02:03.000Z", tx_hash: "cd".repeat(32) }]);
  const [topic] = seen[0].filters[0].topics;
  assert.equal(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(topic[0], "base64")), "signer_changed");
  assert.equal(sdk.scValToNative(sdk.xdr.ScVal.fromXDR(topic[1], "base64")), ORG);
  assert.equal(seen[0].startLedger, 5001);
});

test("signers command: report and exit codes", async () => {
  const { chain, pkg } = await history();
  const out = [];
  const deps = { stdout: (s) => out.push(s), stderr: () => {}, readFile: async () => JSON.stringify(pkg), reader: () => chain };
  assert.equal(await main(["signers", "pkg.json"], deps), 1);
  const text = out.join("\n");
  assert.match(text, /^ATTENTION: 2 problem\(s\) in the signing history of pkg-2026-01-01-2026-03-31\./);
  assert.ok(text.includes(`[ok]   v1  attested 2026-11-12T03:00:00.000Z by ${A}`));
  assert.match(text, /\[FAIL\] v2 .*\n.*not countersigned\n.*problem: not countersigned/);
  assert.ok(text.includes(`${C}  NOT authorized now  (attested v3; countersigned v3)`));
  assert.ok(text.includes(`2026-11-14T00:00:00.000Z  removed  ${C}`));

  const bad = { ...deps, readFile: async () => JSON.stringify({ hello: 1 }) };
  assert.equal(await main(["signers", "x.json"], bad), 2);
  const none = { ...deps, readFile: async () => JSON.stringify({ org: ORG, package_id: "pkg-none" }), reader: () => fakeChain() };
  out.length = 0;
  assert.equal(await main(["signers", "x.json"], none), 1);
  assert.match(out[0], /^NO VERSIONS/);
});
