import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "../src/cli.js";
import { diffManifests, diffPackages } from "../src/diff.js";
import { exportedPackage, fakeChain } from "./helpers.js";

const EVD = "evd-0a1b2c3d4e";

async function twoVersions() {
  const chain = fakeChain();
  const v1 = await exportedPackage();
  chain.attest(v1);
  const m = structuredClone(v1.manifest);
  m.controls.push("CTRL-007");
  m.exceptions = [];
  m.evidence = [`${EVD}:${"a".repeat(64)}`, `evd-new:${"b".repeat(64)}`];
  m.counts.controls = 4;
  const v2 = await exportedPackage(m);
  chain.attest(v2, { verifier: "GVERIFIER", verified_at: "2026-11-13T00:00:00.000Z" });
  return { chain, v1, v2 };
}

test("diffManifests lists added, removed and changed entries", async () => {
  const { v1, v2 } = await twoVersions();
  const d = diffManifests(v1.manifest, v2.manifest);
  assert.equal(d.identical, false);
  const by = Object.fromEntries(d.lists.map((l) => [l.key, l]));
  assert.deepEqual(by.controls.added, ["CTRL-007"]);
  assert.deepEqual(by.exceptions.removed, ["EXC-CTRL-005-TX-847291"]);
  assert.deepEqual(by.evidence.added, ["evd-new"]);
  assert.deepEqual(by.evidence.changed.map((c) => c.id), [EVD]);
  assert.equal(by.evidence.changed[0].after, "a".repeat(64));
  assert.deepEqual(d.fields, [{ field: "counts.controls", before: 3, after: 4 }]);
  assert.equal(by.transactions, undefined);
});

test("identical manifests, and a changed period", async () => {
  const { v1 } = await twoVersions();
  assert.equal(diffManifests(v1.manifest, structuredClone(v1.manifest)).identical, true);
  const moved = { ...structuredClone(v1.manifest), period: ["2026-01-01", "2026-04-30"] };
  assert.deepEqual(diffManifests(v1.manifest, moved).fields, [
    { field: "period", before: ["2026-01-01", "2026-03-31"], after: ["2026-01-01", "2026-04-30"] },
  ]);
});

test("diffPackages says which on-chain version each file is", async () => {
  const { chain, v1, v2 } = await twoVersions();
  const d = await diffPackages(v1, v2, chain);
  assert.equal(d.ok, true);
  assert.equal(d.same_package, true);
  assert.equal(d.before.attestation.version, 1);
  assert.equal(d.after.attestation.version, 2);
  assert.equal(d.after.attestation.countersigned, true);

  const offline = await diffPackages(v1, v2);
  assert.equal(offline.before.attestation, undefined);
  assert.equal((await diffPackages(v1, { nope: 1 })).ok, false);
});

test("diff command: report, exit codes and --offline", async () => {
  const { chain, v1, v2 } = await twoVersions();
  const files = { "old.json": v1, "new.json": v2 };
  const out = [];
  const err = [];
  let readerCalls = 0;
  const deps = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    readFile: async (f) => JSON.stringify(files[f]),
    reader: () => { readerCalls++; return chain; },
  };
  assert.equal(await main(["diff", "old.json", "new.json"], deps), 1);
  const text = out.join("\n");
  assert.match(text, /^DIFFERENT/);
  assert.match(text, /Old {2}old\.json: pkg-2026-01-01-2026-03-31, [0-9a-f]{16}…, on-chain as pkg-2026-01-01-2026-03-31 v1 \(not countersigned\)/);
  assert.match(text, /New {2}new\.json: .* v2 \(countersigned\)/);
  assert.match(text, /\+ CTRL-007/);
  assert.match(text, /- EXC-CTRL-005-TX-847291/);
  assert.match(text, /~ evd-0a1b2c3d4e {2}content hash 9f86d081884c7d65… -> aaaaaaaaaaaaaaaa…/);
  assert.match(text, /counts\.controls: 3 -> 4/);

  out.length = 0;
  assert.equal(await main(["diff", "old.json", "old.json", "--offline"], deps), 0);
  assert.match(out[0], /^IDENTICAL/);
  assert.match(out[0], /not checked \(--offline\)/);
  assert.equal(readerCalls, 1);

  assert.equal(await main(["diff", "old.json"], deps), 2);
  assert.equal(await main(["evidence", "x.json", "--package", "p.json", "--offline"], deps), 2);
});
