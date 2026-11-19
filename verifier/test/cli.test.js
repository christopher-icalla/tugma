import { test } from "node:test";
import assert from "node:assert/strict";
import { EXIT, main, parseArgs } from "../src/cli.js";
import { exportedPackage, fakeChain } from "./helpers.js";

async function run(argv, { bundle, chain = fakeChain(), readFile } = {}) {
  const out = [];
  const err = [];
  const seen = [];
  const code = await main(argv, {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    readFile: readFile ?? (async () => JSON.stringify(bundle)),
    reader: (opts) => {
      seen.push(opts);
      return chain;
    },
  });
  return { code, out: out.join("\n"), err: err.join("\n"), seen };
}

test("prints VALID and exits 0 for an attested package", async () => {
  const chain = fakeChain();
  const bundle = await exportedPackage();
  chain.attest(bundle);

  const r = await run(["pkg.json"], { bundle, chain });
  assert.equal(r.code, 0);
  assert.match(r.out, /^VALID: this package is the one attested on Stellar\./);
  assert.match(r.out, /version 1 of 1/);
  assert.match(r.out, /package integrity only, not that the contents are true/);
});

test("exits 1 with TAMPERED when the package was changed", async () => {
  const chain = fakeChain();
  const bundle = await exportedPackage();
  chain.attest(bundle);
  bundle.manifest.evidence = [];

  const r = await run(["pkg.json"], { bundle, chain });
  assert.equal(r.code, EXIT.TAMPERED);
  assert.match(r.out, /TAMPERED/);
  assert.match(r.out, /\[FAIL\] Recomputed SHA-256/);
});

test("--json prints the full result", async () => {
  const bundle = await exportedPackage();
  const r = await run(["--json", "pkg.json"], { bundle });
  assert.equal(r.code, 1);
  assert.equal(JSON.parse(r.out).status, "NOT_ATTESTED");
});

test("passes --rpc and --contract to the chain reader", async () => {
  const bundle = await exportedPackage();
  const r = await run(["pkg.json", "--rpc", "https://rpc.example", "--contract", "CXYZ"], { bundle });
  assert.deepEqual(r.seen, [{ rpcUrl: "https://rpc.example", contractId: "CXYZ" }]);
});

test("exits 2 on bad input and 3 when the network fails", async () => {
  assert.equal((await run([])).code, 2);
  assert.equal((await run(["a.json", "b.json"])).code, 2);
  assert.equal((await run(["--bogus"])).code, 2);
  assert.equal((await run(["x.json"], { readFile: async () => "not json" })).code, 2);
  assert.equal((await run(["x.json"], { bundle: { nope: true } })).code, 2);

  const down = { contractId: "C", verify: async () => { throw new Error("ECONNREFUSED"); }, versionCount: async () => 0 };
  const r = await run(["pkg.json"], { bundle: await exportedPackage(), chain: down });
  assert.equal(r.code, 3);
  assert.match(r.err, /Could not reach Soroban RPC/);
});

test("parseArgs", () => {
  assert.deepEqual(parseArgs(["f.json", "--json"]), { json: true, file: "f.json", rpcUrl: undefined, contractId: undefined });
  assert.throws(() => parseArgs(["--rpc"]), /needs a value/);
});
