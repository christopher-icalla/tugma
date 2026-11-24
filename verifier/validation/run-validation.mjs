#!/usr/bin/env node
/**
 * Acceptance validation against the real API and the real Stellar Testnet.
 *
 * Deploys the registry WASM that the public contract runs as a separate
 * validation contract, with throwaway keys held only in this process's memory.
 * Starts the built API, runs the end-to-end workflow, the tamper scenarios,
 * the contract rejections and the API-unavailable run, and writes the inputs,
 * expected and actual outcomes and archived ledger data to docs/validation/.
 *
 *   VALIDATION_DATABASE_URL=postgresql://.../tugma_validation node validation/run-validation.mjs
 *
 * The database must be empty or disposable, migrated, with "validation" in its name.
 */
import * as sdk from "@stellar/stellar-sdk";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalJson } from "../src/canonical.js";
import { TESTNET } from "../src/network.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "docs", "validation");
const PORT = 18001;
const API = `http://127.0.0.1:${PORT}`;
const WASM_HASH = "90e859d243cb53174b1dfe94ec8d0d36ebc1db16f3d2eacd9b3939f60143d948";
const RUNS = 10;
const EXPLORER = "https://stellar.expert/explorer/testnet";
const DB = process.env.VALIDATION_DATABASE_URL ?? "";
if (!DB || !/validation/.test(new URL(DB).pathname)) throw new Error('VALIDATION_DATABASE_URL must name a "validation" database.');

const sha = (s) => createHash("sha256").update(s).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = new sdk.rpc.Server(TESTNET.rpcUrl);
const results = { started_at: new Date().toISOString(), wasm_hash: WASM_HASH, runs: [], tamper: [], contract_rejections: [], api_unavailable: [], access: [], transactions: [] };
for (const d of ["archive", "packages", "tampered"]) {
  rmSync(join(OUT, d), { recursive: true, force: true });
  mkdirSync(join(OUT, d), { recursive: true });
}
const save = (rel, obj) => writeFileSync(join(OUT, rel), `${JSON.stringify(obj, null, 2)}\n`);
const native = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x instanceof Uint8Array ? Buffer.from(x).toString("hex") : x?.type === "Buffer" ? Buffer.from(x.data).toString("hex") : x)));

function check(list, id, scenario, expected, actual, extra = {}) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  list.push({ id, scenario, expected, actual, pass, ...extra });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${scenario} -> ${JSON.stringify(actual)}`);
}

// ------------------------------------------------------------- Stellar

async function retry(fn, n = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= n) throw e;
      await sleep(1500 * i);
    }
  }
}

async function fund(kp) {
  await retry(async () => {
    const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    if (!r.ok && !(await r.text()).includes("op_already_exists")) throw new Error(`Friendbot ${r.status}`);
  });
}

async function send(kp, op) {
  const account = await retry(() => server.getAccount(kp.publicKey()));
  const tx = new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(op).setTimeout(120).build();
  const prepared = await retry(() => server.prepareTransaction(tx));
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  const res = await server.pollTransaction(sent.hash, { attempts: 40, sleepStrategy: () => 1000 });
  if (res.status !== "SUCCESS") throw new Error(`Transaction ${sent.hash}: ${res.status}`);
  return { hash: sent.hash, value: res.returnValue ? sdk.scValToNative(res.returnValue) : null };
}

async function deploy(kp) {
  const r = await send(kp, sdk.Operation.createCustomContract({
    address: new sdk.Address(kp.publicKey()), wasmHash: Buffer.from(WASM_HASH, "hex"), salt: randomBytes(32),
    constructorArgs: [new sdk.Address(kp.publicKey()).toScVal()],
  }));
  return { id: String(r.value), hash: r.hash };
}

const S = (v) => sdk.nativeToScVal(v, { type: "string" });
const A = (v) => new sdk.Address(v).toScVal();
const B = (hex) => sdk.xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
const call = (id, method, ...args) => new sdk.Contract(id).call(method, ...args);
const attestArgs = (who, p) => [A(who), S(p.org), S(p.package_id), S(p.period_start), S(p.period_end), B(p.canonical_hash)];

async function simulate(source, op) {
  const account = await retry(() => server.getAccount(source));
  const tx = new sdk.TransactionBuilder(account, { fee: sdk.BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(op).setTimeout(60).build();
  const sim = await retry(() => server.simulateTransaction(tx));
  if (!sdk.rpc.Api.isSimulationError(sim)) return "accepted";
  return /Error\(Contract, #(\d)\)/.exec(sim.error)?.[0] ?? sim.error.slice(0, 120);
}

/** Saves the RPC and Horizon views of a transaction, so it can be rechecked after RPC retention ends. */
async function archiveTx(hash, purpose) {
  const rpcRes = await retry(async () => {
    const r = await fetch(TESTNET.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash } }) });
    const j = await r.json();
    if (j.result?.status !== "SUCCESS") throw new Error(`getTransaction ${hash}: ${j.result?.status}`);
    return j.result;
  });
  const horizon = await retry(async () => {
    const r = await fetch(`${TESTNET.horizonUrl}/transactions/${hash}`);
    if (!r.ok) throw new Error(`Horizon ${r.status}`);
    return r.json();
  }, 8);
  save(`archive/tx-${hash}.json`, { hash, purpose, explorer: `${EXPLORER}/tx/${hash}`, network_passphrase: TESTNET.networkPassphrase, rpc: rpcRes, horizon });
  results.transactions.push({ hash, purpose, ledger: rpcRes.ledger, explorer: `${EXPLORER}/tx/${hash}` });
}

// ----------------------------------------------------------------- API

let api;
async function startApi(contractId) {
  const pw = () => randomBytes(18).toString("base64url");
  const creds = { ADMIN_EMAIL: "admin@tugma.validation.example", ADMIN_PASSWORD: pw(), DEMO_USER_PASSWORD: pw() };
  api = spawn(process.execPath, ["dist/main.js"], {
    cwd: join(ROOT, "backend"), stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, ...creds, DATABASE_URL: DB, PORT: String(PORT), JWT_SECRET: randomBytes(48).toString("base64url"), COOKIE_SECURE: "false",
      RATE_LIMIT: "off", CONTROL_SCHEDULE: "off", STELLAR_CONTRACT_ID: contractId, STELLAR_NETWORK: "TESTNET", STELLAR_RPC_URL: TESTNET.rpcUrl,
      MULTISIG_ATTESTATION_ACCOUNT: "", MULTISIG_TUGMA_SIGNER_SECRET: "", MULTISIG_REVIEWER_PUBLIC_KEY: "", EMAIL_API_URL: "",
    },
  });
  for (let i = 0; i < 120; i++) {
    if (api.exitCode !== null) throw new Error("API exited during startup");
    try { if ((await fetch(`${API}/api/health`)).ok) return creds; } catch { /* starting */ }
    await sleep(1000);
  }
  throw new Error("API did not start");
}

const cookies = {};
async function http(who, method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookies[who] ? { cookie: cookies[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.getSetCookie();
  if (set.length) cookies[who] = set.map((c) => c.split(";")[0]).join("; ");
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: json, text };
}
async function ok(who, method, path, body) {
  const r = await http(who, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} as ${who}: ${r.status} ${r.text}`);
  return r.body;
}

async function link(who, kp) {
  const ch = await ok(who, "POST", "/api/stellar/wallet/challenge", { address: kp.publicKey() });
  const signature = Buffer.from(kp.signMessage(ch.message)).toString("base64");
  await ok(who, "POST", "/api/stellar/wallet/link", { challenge: ch.challenge, signature });
}
async function signSubmit(who, kp, path) {
  const prep = await ok(who, "POST", path);
  const tx = sdk.TransactionBuilder.fromXDR(prep.xdr, prep.network_passphrase);
  tx.sign(kp);
  return (await ok(who, "POST", "/api/stellar/submit", { pending_id: prep.pending_id, signed_xdr: tx.toXDR() })).attestation;
}

// ------------------------------------------------------------ verifier

/** The real command-line verifier, in its own process. */
function cli(args, env = {}, nodeArgs = []) {
  return new Promise((resolve) => {
    execFile(process.execPath, [...nodeArgs, join(HERE, "..", "bin", "tugma-verify.js"), ...args], { env: { ...process.env, ...env }, maxBuffer: 1e8 }, (err, stdout, stderr) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* no JSON */ }
      resolve({ exit: err ? err.code : 0, json, stdout, stderr });
    });
  });
}
const outcome = (r) => ({ status: r.json?.status ?? null, exit: r.exit });
const reseal = (p) => {
  p.canonical_manifest = canonicalJson(p.manifest);
  p.canonical_hash = sha(p.canonical_manifest);
  return p;
};

// ---------------------------------------------------------------- main

async function main() {
  const admin = sdk.Keypair.random(), attester = sdk.Keypair.random(), countersigner = sdk.Keypair.random(), stranger = sdk.Keypair.random();
  for (const kp of [admin, attester, countersigner, stranger]) await fund(kp);
  const { id: C, hash: deployTx } = await deploy(admin);
  const { id: FAKE, hash: fakeTx } = await deploy(stranger);
  results.contract = { id: C, admin: admin.publicKey(), attester: attester.publicKey(), countersigner: countersigner.publicKey(), lookalike: FAKE, explorer: `${EXPLORER}/contract/${C}`, public_contract: TESTNET.contractId };
  await archiveTx(deployTx, "Deploy validation contract");
  await archiveTx(fakeTx, "Deploy look-alike contract");
  console.log("contract", C);
  const ARGS = ["--json", "--contract", C];

  const creds = await startApi(C);
  for (const r of ["compliance", "risk", "ops", "auditor", "viewer"]) await ok(r, "POST", "/api/auth/login", { email: `${r}@tugmademo.ph`, password: creds.DEMO_USER_PASSWORD });
  await ok("admin", "POST", "/api/auth/login", { email: creds.ADMIN_EMAIL, password: creds.ADMIN_PASSWORD });
  await link("compliance", attester);
  await link("risk", countersigner);
  const org = (await ok("admin", "GET", "/api/stellar/signers")).onchain_org_id;
  results.contract.org = org;

  // Contract rejection before authorization.
  const probe = { org, package_id: "pkg-probe", period_start: "2026-01-01", period_end: "2026-01-01", canonical_hash: sha("probe") };
  check(results.contract_rejections, "C1", "attest by an unauthorized wallet", "Error(Contract, #1)", await simulate(attester.publicKey(), call(C, "attest", ...attestArgs(attester.publicKey(), probe))));
  for (const kp of [attester, countersigner]) await archiveTx((await send(admin, call(C, "add_signer", S(org), A(kp.publicKey())))).hash, "Authorize signer");

  // Ten failed settlement records with distinct payment days, TX-847291 first.
  const all = [];
  for (let page = 1; ; page++) {
    const r = await ok("ops", "GET", `/api/exceptions?control=CTRL-005&status=OPEN&page_size=100&page=${page}`);
    all.push(...r.exceptions);
    if (page >= r.pages) break;
  }
  all.sort((a, b) => Number(b.transaction_id === "TX-847291") - Number(a.transaction_id === "TX-847291") || a.exception_code.localeCompare(b.exception_code));
  const picked = [], days = new Set();
  for (const e of all) {
    const d = await ok("ops", "GET", `/api/exceptions/${e.exception_code}`);
    const day = d.transaction?.transaction_timestamp?.slice(0, 10);
    if (!day || days.has(day)) continue;
    days.add(day);
    picked.push({ e, d, day });
    if (picked.length === RUNS) break;
  }
  if (picked.length < RUNS) throw new Error("Not enough distinct exceptions");

  const files = [];
  for (const [i, { e, d, day }] of picked.entries()) {
    const code = e.exception_code, steps = [];
    const step = (name, pass, detail) => { steps.push({ name, pass: Boolean(pass), detail }); };
    const run = { id: `E${i + 1}`, exception: code, transaction: e.transaction_id, period: day, steps };
    try {
      const ctl = await ok("compliance", "POST", "/api/controls/run");
      const exc = await ok("ops", "GET", `/api/exceptions/${code}`);
      step("Control run finds the failed test", exc.exception.control_code === "CTRL-005" && exc.exception.status === "OPEN", `${ctl.exceptions_detected} exceptions detected by the run`);
      const move = (who, to) => http(who, "POST", `/api/exceptions/${code}/transition`, { to_status: to });
      await move("ops", "IN_REVIEW");
      await move("ops", "REMEDIATION");
      step("Resolve without evidence is refused", (await move("ops", "RESOLVED")).status === 400);
      const ev = (await ok("ops", "POST", "/api/evidence", { name: "Settlement adjustment record", evidence_type: "DOCUMENT", content: `Synthetic adjustment for ${e.transaction_id}`, exception_id: d.exception.id, control_id: d.exception.control_id, transaction_id: e.transaction_id })).evidence;
      await ok("ops", "POST", `/api/exceptions/${code}/remediation`, { status: "COMPLETED", completion_note: "Synthetic adjustment recorded" });
      const resolved = await move("ops", "RESOLVED"), denied = await move("ops", "VERIFIED"), verified = await move("compliance", "VERIFIED");
      step("Remediated, then verified by a different role", resolved.status === 200 && denied.status === 403 && verified.status === 200);

      const gens = [];
      for (let k = 0; k < 3; k++) gens.push((await ok("compliance", "POST", "/api/evidence-packages/generate", { period_start: day, period_end: day })).package);
      const pkg = gens[0];
      step("Same SHA-256 from 3 reconstructions", new Set(gens.map((g) => g.canonical_hash)).size === 1, pkg.canonical_hash);

      const att = await signSubmit("compliance", attester, `/api/stellar/packages/${pkg.id}/attest/prepare`);
      step("Attested on Testnet with transaction reference", /^[0-9a-f]{64}$/.test(att.transaction_hash ?? "") && att.version === 1, att.transaction_hash);
      const selfSim = await simulate(attester.publicKey(), call(C, "countersign", A(attester.publicKey()), S(org), S(pkg.id), sdk.nativeToScVal(1, { type: "u32" })));
      step("Self-countersignature rejected by the contract", selfSim === "Error(Contract, #5)", selfSim);
      const cs = await signSubmit("risk", countersigner, `/api/stellar/packages/${pkg.id}/countersign/prepare`);
      step("Countersigned by a different wallet", cs.verifier_address === countersigner.publicKey());
      const synced = (await ok("compliance", "POST", `/api/stellar/packages/${pkg.id}/sync`)).attestations.find((x) => x.version === 1);
      step("Transaction reference kept after re-sync", synced?.transaction_hash === att.transaction_hash);

      const a = await http("auditor", "GET", `/api/evidence-packages/${pkg.id}/export`), b = await http("auditor", "GET", `/api/evidence-packages/${pkg.id}/export`);
      step("Repeated exports are byte-identical", a.status === 200 && a.text === b.text);
      const file = join(OUT, "packages", `tugma-${pkg.id}.json`);
      writeFileSync(file, a.text);
      const item = await ok("auditor", "GET", `/api/evidence/${ev.id}/export`);
      const v = await cli([file, ...ARGS]);
      step("Standalone verifier", v.exit === 0 && v.json?.status === "VALID", `${v.json?.status}, exit ${v.exit}`);
      Object.assign(run, { package_id: pkg.id, canonical_hash: pkg.canonical_hash, attest_tx: att.transaction_hash, countersign_tx: cs.countersign_tx_hash ?? null, attestation: v.json?.attestation });
      await archiveTx(att.transaction_hash, `${run.id}: attest ${pkg.id}`);
      if (run.countersign_tx) await archiveTx(run.countersign_tx, `${run.id}: countersign ${pkg.id}`);
      save(`archive/contract-${pkg.id}.json`, { contract: C, read: "verify(hash)", hash: pkg.canonical_hash, read_at: new Date().toISOString(), attestation: native(v.json?.attestation) });
      files.push({ file, bundle: JSON.parse(a.text), item, code });
    } catch (err) {
      step("Run completed", false, err.message);
    }
    run.pass = steps.every((s) => s.pass);
    results.runs.push(run);
    console.log(run.id, run.pass ? "PASS" : "FAIL", JSON.stringify(steps.filter((s) => !s.pass)));
  }
  if (!files.length) throw new Error("No run produced a package");
  const { bundle: orig, file: origFile, item } = files[0];

  // Access and segregation of duties.
  for (const who of ["auditor", "viewer"]) check(results.access, `A-${who}`, `${who} cannot prepare an attestation`, 403, (await http(who, "POST", `/api/stellar/packages/${orig.package_id}/attest/prepare`)).status);
  check(results.access, "A-anon", "export without a session", 401, (await http("nobody", "GET", `/api/evidence-packages/${orig.package_id}/export`)).status);
  check(results.access, "A-compliance", "the attesting user cannot countersign", 403, (await http("compliance", "POST", `/api/stellar/packages/${orig.package_id}/countersign/prepare`)).status);

  // Contract rejections, by simulation against live state.
  const u32 = (n) => sdk.nativeToScVal(n, { type: "u32" });
  check(results.contract_rejections, "C2", "attest a hash that is already attested", "Error(Contract, #2)", await simulate(attester.publicKey(), call(C, "attest", ...attestArgs(attester.publicKey(), orig))));
  check(results.contract_rejections, "C3", "read a version that does not exist", "Error(Contract, #3)", await simulate(attester.publicKey(), call(C, "get", S(org), S(orig.package_id), u32(99))));
  check(results.contract_rejections, "C4", "countersign an already countersigned version", "Error(Contract, #4)", await simulate(countersigner.publicKey(), call(C, "countersign", A(countersigner.publicKey()), S(org), S(orig.package_id), u32(1))));

  // Tampering.
  const tamper = async (id, scenario, expected, edit, raw) => {
    const f = join(OUT, "tampered", `${id}.json`);
    if (raw !== undefined) writeFileSync(f, raw);
    else save(`tampered/${id}.json`, await edit(structuredClone(orig)));
    const r = await cli([f, ...ARGS]);
    check(results.tamper, id, scenario, expected, outcome(r), { file: `tampered/${id}.json`, warnings: r.json?.warnings ?? [] });
    return r;
  };
  const bad = (status) => ({ status, exit: 1 });
  await tamper("T1", "exception removed from the manifest", bad("TAMPERED"), (p) => { p.manifest.exceptions = []; return p; });
  await tamper("T2", "exception removed, canonical form and hash rewritten to match", bad("NOT_ATTESTED"), (p) => { p.manifest.exceptions = []; return reseal(p); });
  await tamper("T3", "only canonical_manifest edited", bad("TAMPERED"), (p) => { p.canonical_manifest += " "; return p; });
  await tamper("T4", "only the declared hash edited", bad("TAMPERED"), (p) => { p.canonical_hash = sha("other"); return p; });
  await tamper("T5", "evidence content hash replaced", bad("TAMPERED"), (p) => { p.manifest.evidence = p.manifest.evidence.map((x) => `${x.slice(0, x.lastIndexOf(":"))}:${sha("forged")}`); return p; });
  await tamper("T6", "package id changed", bad("MISMATCH"), (p) => { p.package_id = "pkg-2025-01-01-2025-01-01"; return p; });
  await tamper("T7", "organization id changed", bad("MISMATCH"), (p) => { p.org = `org_${"0".repeat(32)}`; return p; });
  await tamper("T8", "period changed", bad("MISMATCH"), (p) => { p.period_start = "2025-01-01"; return p; });
  await tamper("T9", "completeness count raised", bad("TAMPERED"), (p) => { p.manifest.counts.completeness += 1; return p; });
  await tamper("T10", "truncated file", { status: null, exit: 2 }, null, readFileSync(origFile, "utf8").slice(0, 200));

  // Look-alike contract: the forged package really is attested, on the attacker's contract.
  const forged = reseal({ ...structuredClone(orig), manifest: { ...orig.manifest, exceptions: [] }, network: { ...orig.network, contract_id: FAKE } });
  await archiveTx((await send(stranger, call(FAKE, "add_signer", S(org), A(stranger.publicKey())))).hash, "Look-alike: authorize signer");
  await archiveTx((await send(stranger, call(FAKE, "attest", ...attestArgs(stranger.publicKey(), forged)))).hash, "Look-alike: attest forged package");
  const t11 = await tamper("T11", "forged package attested on a look-alike contract that the file names", bad("NOT_ATTESTED"), () => forged);
  check(results.tamper, "T11b", "the verifier warns that the file names another contract", true, (t11.json?.warnings ?? []).some((w) => w.includes(FAKE)));

  // Evidence record.
  save("tampered/evidence-original.json", item);
  const forgedItem = structuredClone(item);
  forgedItem.hash_input.content = "Forged content";
  save("tampered/T12.json", forgedItem);
  const good = await cli(["evidence", join(OUT, "tampered", "evidence-original.json"), "--package", origFile, ...ARGS]);
  check(results.tamper, "V1", "unmodified evidence record", { status: "VALID", exit: 0 }, outcome(good));
  check(results.tamper, "T12", "evidence record content changed", bad("TAMPERED"), outcome(await cli(["evidence", join(OUT, "tampered", "T12.json"), "--package", origFile, ...ARGS])));

  // Superseded version: new evidence, new hash, version 2.
  await ok("ops", "POST", "/api/evidence", { name: "Late bank confirmation", evidence_type: "DOCUMENT", content: "Synthetic confirmation", exception_id: picked[0].d.exception.id });
  const v2 = (await ok("compliance", "POST", "/api/evidence-packages/generate", { period_start: picked[0].day, period_end: picked[0].day })).package;
  const att2 = await signSubmit("compliance", attester, `/api/stellar/packages/${v2.id}/attest/prepare`);
  await archiveTx(att2.transaction_hash, `Re-attest ${v2.id} as version 2`);
  const old = await cli([origFile, ...ARGS]);
  check(results.tamper, "V2", "superseded version 1 still verifies and is reported as not the latest", { status: "VALID", exit: 0, latest: 2 }, { ...outcome(old), latest: old.json?.latest_version }, { warnings: old.json?.warnings ?? [] });

  // API unavailable: the API process is stopped and the verifier may only reach Stellar.
  api.kill("SIGKILL");
  await new Promise((r) => (api.exitCode !== null || api.signalCode ? r() : api.once("exit", r)));
  let down = "reachable";
  try { await fetch(`${API}/api/health`); } catch (e) { down = e.cause?.code ?? e.message; }
  check(results.api_unavailable, "U1", "API health check", "ECONNREFUSED", down);
  const log = join(tmpdir(), `tugma-egress-${process.pid}.log`);
  writeFileSync(log, "");
  const hosts = [new URL(TESTNET.rpcUrl).host, new URL(TESTNET.horizonUrl).host];
  const guard = ["--import", pathToFileURL(join(HERE, "egress-guard.mjs")).href];
  const env = { TUGMA_ALLOWED_HOSTS: hosts.join(","), TUGMA_EGRESS_LOG: log };
  for (const [i, f] of files.entries()) check(results.api_unavailable, `U${i + 2}`, `verify ${f.bundle.package_id}`, { status: "VALID", exit: 0 }, outcome(await cli([f.file, ...ARGS], env, guard)));
  check(results.api_unavailable, "U-tampered", "verify T1 (modified package)", bad("TAMPERED"), outcome(await cli([join(OUT, "tampered", "T1.json"), ...ARGS], env, guard)));
  check(results.api_unavailable, "U-forged", "verify T2 (modified and resealed)", bad("NOT_ATTESTED"), outcome(await cli([join(OUT, "tampered", "T2.json"), ...ARGS], env, guard)));
  const seen = [...new Set(readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).host))].sort();
  check(results.api_unavailable, "U-hosts", "the only hosts contacted are Stellar's", true, seen.length > 0 && seen.every((h) => hosts.includes(h)), { hosts: seen });
  rmSync(log, { force: true });
  check(results.api_unavailable, "U-rpc", "Soroban RPC also unreachable: fails closed", { status: null, exit: 3 }, outcome(await cli([origFile, ...ARGS, "--rpc", "http://127.0.0.1:9"])));
}

let failure = null;
try { await main(); } catch (e) { failure = e; console.error(e); }
api?.kill("SIGKILL");
results.finished_at = new Date().toISOString();
results.aborted = failure ? failure.message : null;
const checks = [...results.runs, ...results.tamper, ...results.contract_rejections, ...results.api_unavailable, ...results.access];
results.summary = { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length, e2e_runs_passed: results.runs.filter((r) => r.pass).length };
save("results.json", results);
console.log(results.summary);
process.exit(failure || results.summary.failed ? 1 : 0);
