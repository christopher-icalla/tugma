#!/usr/bin/env node
/** Writes docs/validation/report.md from docs/validation/results.json, so the report cannot drift from the recorded results. */
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../docs/validation/", import.meta.url);
const r = JSON.parse(readFileSync(new URL("results.json", dir), "utf8"));
const notes = readFileSync(new URL("notes.md", dir), "utf8").trim();
const cell = (v) => (typeof v === "string" ? v : Object.entries(v).length && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(", ") : String(v)).replaceAll("|", "\|");
const table = (rows) => ["| ID | Scenario | Expected | Actual | Result |", "|---|---|---|---|---|", ...rows.map((c) => `| ${c.id} | ${c.scenario} | ${cell(c.expected)} | ${cell(c.actual)} | ${c.pass ? "Pass" : "**Fail**"} |`)].join("\n");
const tx = (h) => (h ? `[${h.slice(0, 10)}…](https://stellar.expert/explorer/testnet/tx/${h}) ([JSON](archive/tx-${h}.json))` : "none");
const failedSteps = r.runs.flatMap((x) => x.steps.filter((s) => !s.pass).map((s) => `- ${x.id}: ${s.name}${s.detail ? ` (${s.detail})` : ""}`));
const failed = [...r.tamper, ...r.contract_rejections, ...r.api_unavailable, ...r.access].filter((c) => !c.pass).map((c) => `- ${c.id}: ${c.scenario}`);

writeFileSync(new URL("report.md", dir), `# Validation report

Run ${r.started_at} to ${r.finished_at}. Generated from [results.json](results.json) by \`verifier/validation/render-report.mjs\`.

**${r.summary.passed} of ${r.summary.total} recorded checks passed; ${r.summary.e2e_runs_passed} of ${r.runs.length} end-to-end runs passed.**${r.aborted ? ` The run stopped early: ${r.aborted}` : ""}

${notes}

## Environment

| | |
|---|---|
| Network | Stellar Testnet |
| Validation contract | [\`${r.contract.id}\`](${r.contract.explorer}) |
| Public TUGMA contract (not used in this run) | \`${r.contract.public_contract}\` |
| WASM hash (the same for both) | \`${r.wasm_hash}\` |
| Look-alike contract | \`${r.contract.lookalike}\` |
| Organization | \`${r.contract.org}\` |
| Attester | \`${r.contract.attester}\` |
| Countersigner | \`${r.contract.countersigner}\` |

## End-to-end runs

Each run goes through the HTTP API: control run, exception, remediation, evidence, verification by another role, package, SHA-256, attestation, countersignature, re-sync, export, standalone verifier.

| Run | Transaction | Package | SHA-256 | Attest | Countersign | Steps | Result |
|---|---|---|---|---|---|---|---|
${r.runs.map((x) => `| ${x.id} | ${x.transaction} | ${x.package_id ?? "none"} | \`${(x.canonical_hash ?? "none").slice(0, 16)}…\` | ${tx(x.attest_tx)} | ${tx(x.countersign_tx)} | ${x.steps.filter((s) => s.pass).length}/${x.steps.length} | ${x.pass ? "Pass" : "**Fail**"} |`).join("\n")}

## Tamper tests

${table(r.tamper)}

## Contract rejections

Simulated against live contract state; nothing is submitted.

${table(r.contract_rejections)}

## Access

${table(r.access)}

## API-unavailable run

The API process is stopped. The verifier runs with a socket guard that refuses every host except Stellar's RPC and Horizon.

${table(r.api_unavailable)}

Hosts contacted: ${(r.api_unavailable.find((c) => c.hosts)?.hosts ?? []).map((h) => `\`${h}\``).join(", ") || "not recorded"}.

## All transactions

| Purpose | Ledger | Transaction |
|---|---|---|
${r.transactions.map((t) => `| ${t.purpose} | ${t.ledger} | ${tx(t.hash)} |`).join("\n")}

## Failures in this run

${[...failedSteps, ...failed].join("\n") || "None."}
`);
