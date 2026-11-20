import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { verifyMany } from "../src/bulk.js";
import { exportedPackage, fakeChain } from "./helpers.js";

async function threePackages() {
  const chain = fakeChain();
  const good = await exportedPackage();
  chain.attest(good);
  const tampered = structuredClone(good);
  tampered.manifest.evidence = [];
  const other = await exportedPackage({ ...structuredClone(good.manifest), period: ["2026-04-01", "2026-06-30"] });
  return { chain, good, tampered, other };
}

test("verifyMany reports each file and counts the statuses", async () => {
  const { chain, good, tampered, other } = await threePackages();
  const b = await verifyMany(
    [
      { name: "a.json", bundle: good },
      { name: "b.json", bundle: tampered },
      { name: "c.json", bundle: other },
      { name: "d.json", error: "not readable as JSON" },
    ],
    chain,
  );
  assert.equal(b.total, 4);
  assert.equal(b.valid, 1);
  assert.equal(b.all_valid, false);
  assert.deepEqual(b.rows.map((r) => r.status), ["VALID", "TAMPERED", "NOT_ATTESTED", "INVALID_FILE"]);
  assert.deepEqual(b.counts, { VALID: 1, TAMPERED: 1, NOT_ATTESTED: 1, INVALID_FILE: 1 });
});

test("an empty batch is not 'all valid'", async () => {
  assert.equal((await verifyMany([], fakeChain())).all_valid, false);
});

test("batch checks every .json file in a folder and exits 1 if any fails", async () => {
  const { chain, good, tampered } = await threePackages();
  const dir = await mkdtemp(join(tmpdir(), "tugma-batch-"));
  await writeFile(join(dir, "1-good.json"), JSON.stringify(good));
  await writeFile(join(dir, "2-tampered.json"), JSON.stringify(tampered));
  await writeFile(join(dir, "3-broken.json"), "{");
  await writeFile(join(dir, "notes.txt"), "ignored");

  const out = [];
  const code = await main(["batch", dir], { stdout: (s) => out.push(s), stderr: () => {}, reader: () => chain });
  const text = out.join("\n");
  assert.equal(code, 1);
  assert.match(text, /^1 of 3 package\(s\) are VALID; 2 NOT VALID\./);
  assert.match(text, /\[ok\] {3}.*1-good\.json +VALID +pkg-2026-01-01-2026-03-31 v1 of 1, not countersigned/);
  assert.match(text, /\[FAIL\] .*2-tampered\.json +TAMPERED +Canonical form/);
  assert.match(text, /\[FAIL\] .*3-broken\.json +INVALID FILE +not readable as JSON/);
  assert.doesNotMatch(text, /notes\.txt/);
});

test("batch exits 0 when all named files are valid, and --json gives the rows", async () => {
  const { chain, good } = await threePackages();
  const out = [];
  const deps = { stdout: (s) => out.push(s), stderr: () => {}, reader: () => chain, stat: async () => ({ isDirectory: () => false }), readFile: async () => JSON.stringify(good) };
  assert.equal(await main(["batch", "a.json", "b.json", "--json"], deps), 0);
  const b = JSON.parse(out[0]);
  assert.equal(b.all_valid, true);
  assert.deepEqual(b.rows.map((r) => r.name), ["a.json", "b.json"]);
});

test("batch input errors exit 2 and a network failure exits 3", async () => {
  const quiet = { stdout: () => {}, stderr: () => {}, reader: () => fakeChain() };
  assert.equal(await main(["batch"], quiet), 2);
  assert.equal(await main(["batch", join(tmpdir(), "does-not-exist-tugma")], quiet), 2);
  const empty = await mkdtemp(join(tmpdir(), "tugma-empty-"));
  assert.equal(await main(["batch", empty], quiet), 2);

  const down = { contractId: "C", verify: async () => { throw new Error("ECONNREFUSED"); } };
  const good = await exportedPackage();
  const deps = { ...quiet, reader: () => down, stat: async () => ({ isDirectory: () => false }), readFile: async () => JSON.stringify(good) };
  assert.equal(await main(["batch", "a.json"], deps), 3);
});
