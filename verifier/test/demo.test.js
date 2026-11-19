import { test } from "node:test";
import assert from "node:assert/strict";
import { runDemo } from "../demo/run-demo.js";

test("demo: the exported package passes, modified packages fail", async () => {
  const printed = [];
  const steps = await runDemo((s) => printed.push(s));
  assert.deepEqual(steps.map((s) => s.status), ["VALID", "TAMPERED", "NOT_ATTESTED"]);
  assert.match(printed.join("\n"), /package integrity only/);
});
