import { test } from "node:test";
import assert from "node:assert/strict";
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader, withRetry } from "../src/chain.js";
import { CONTRACT, ORG } from "./helpers.js";

const HASH = "b51ee955ffc8".padEnd(64, "0");
const ATTESTER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

/** The contract's Attestation struct as Soroban returns it (a map keyed by field symbols). */
function attestationScVal() {
  const entry = (k, v) => new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol(k), val: v });
  return sdk.xdr.ScVal.scvMap([
    entry("attested_at", sdk.nativeToScVal(1794452400, { type: "u64" })),
    entry("attested_ledger", sdk.nativeToScVal(1000, { type: "u32" })),
    entry("attester", new sdk.Address(ATTESTER).toScVal()),
    entry("hash", sdk.xdr.ScVal.scvBytes(Buffer.from(HASH, "hex"))),
    entry("org", sdk.nativeToScVal(ORG, { type: "string" })),
    entry("package_id", sdk.nativeToScVal("pkg-2026-01-01-2026-03-31", { type: "string" })),
    entry("period_end", sdk.nativeToScVal("2026-03-31", { type: "string" })),
    entry("period_start", sdk.nativeToScVal("2026-01-01", { type: "string" })),
    entry("verified_at", sdk.xdr.ScVal.scvVoid()),
    entry("verifier", sdk.xdr.ScVal.scvVoid()),
    entry("version", sdk.nativeToScVal(1, { type: "u32" })),
  ]);
}

/** Records each simulated call and answers it like Soroban RPC would. */
function fakeServer(answer) {
  const calls = [];
  return {
    calls,
    async simulateTransaction(tx) {
      const call = tx.operations[0].func.invokeContract;
      calls.push({ fn: String(call.functionName), args: call.args.map((a) => sdk.scValToNative(a)) });
      return answer(calls.at(-1));
    },
  };
}

const config = { rpcUrl: "https://rpc.invalid", contractId: CONTRACT, networkPassphrase: sdk.Networks.TESTNET };

test("verify() simulates the contract's verify(hash) and decodes the attestation", async () => {
  const server = fakeServer(() => ({ result: { retval: attestationScVal() } }));
  const reader = createChainReader(sdk, config, server);
  const att = await reader.verify(HASH);

  assert.equal(server.calls[0].fn, "verify");
  assert.equal(Buffer.from(server.calls[0].args[0]).toString("hex"), HASH);
  assert.deepEqual(att, {
    org: ORG,
    package_id: "pkg-2026-01-01-2026-03-31",
    version: 1,
    hash: HASH,
    period_start: "2026-01-01",
    period_end: "2026-03-31",
    attester: ATTESTER,
    attested_at: new Date(1794452400 * 1000).toISOString(),
    attested_ledger: 1000,
    verifier: null,
    verified_at: null,
  });
});

test("an unknown hash reads as null", async () => {
  const reader = createChainReader(sdk, config, fakeServer(() => ({ result: { retval: sdk.xdr.ScVal.scvVoid() } })));
  assert.equal(await reader.verify("0".repeat(64)), null);
});

test("contract error #3 (not found) reads as null; other errors throw", async () => {
  const notFound = createChainReader(sdk, config, fakeServer(() => ({ error: "HostError: Error(Contract, #3)" })));
  assert.equal(await notFound.versionCount(ORG, "pkg-x"), 0);
  const broken = createChainReader(sdk, config, fakeServer(() => ({ error: "HostError: Error(Budget, ExceededLimit)" })));
  await assert.rejects(broken.verify("0".repeat(64)), /Contract read verify failed/);
});

test("versionCount() passes the opaque org and package id as strings", async () => {
  const server = fakeServer(() => ({ result: { retval: sdk.nativeToScVal(2, { type: "u32" }) } }));
  const reader = createChainReader(sdk, config, server);
  assert.equal(await reader.versionCount(ORG, "pkg-2026-01-01-2026-03-31"), 2);
  assert.equal(server.calls[0].fn, "version_count");
  assert.deepEqual(server.calls[0].args, [ORG, "pkg-2026-01-01-2026-03-31"]);
});

test("retries when the RPC cannot be reached, then gives up", async () => {
  let n = 0;
  const flaky = { async simulateTransaction() { if (++n < 3) throw new Error("fetch failed"); return { result: { retval: sdk.xdr.ScVal.scvVoid() } }; } };
  assert.equal(await createChainReader(sdk, config, flaky).verify("0".repeat(64)), null);
  assert.equal(n, 3);
  assert.equal(await withRetry(async () => "ok", 3, 0), "ok");
  let m = 0;
  await assert.rejects(withRetry(async () => { m++; throw new Error("down"); }, 3, 0), /down/);
  assert.equal(m, 3);
});

test("rejects malformed hashes before calling the network", async () => {
  const server = fakeServer(() => assert.fail("should not be called"));
  const reader = createChainReader(sdk, config, server);
  await assert.rejects(reader.verify("XYZ"), /64 lowercase hex/);
  assert.equal(server.calls.length, 0);
});
