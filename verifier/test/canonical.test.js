import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalJson } from "../src/canonical.js";
import { sha256Hex } from "../src/hash.js";

const { vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

for (const v of vectors) {
  test(`canonical form and SHA-256: ${v.name}`, async () => {
    const canonical = canonicalJson(v.input);
    assert.equal(canonical, v.canonical);
    assert.equal(await sha256Hex(canonical), v.sha256);
  });
}

test("key order in the input does not change the hash", async () => {
  const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
  const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(await sha256Hex(a), await sha256Hex(b));
});

test("array order does change the hash", async () => {
  assert.notEqual(await sha256Hex(canonicalJson({ a: [1, 2] })), await sha256Hex(canonicalJson({ a: [2, 1] })));
});
