import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { describeRow, verifyMany } from "./bulk.js";
import { diffPackages } from "./diff.js";
import { auditSigners } from "./signers.js";
import { verifyEvidence } from "./evidence.js";
import { verifyPackage } from "./verify.js";

export const USAGE = `Usage: tugma-verify <package.json> [--json] [--rpc <url>] [--contract <C...>] [--horizon <url>]
       tugma-verify evidence <evidence.json> --package <package.json> [--json] [--rpc <url>] [--contract <C...>]
       tugma-verify batch <file-or-folder>... [--json] [--rpc <url>] [--contract <C...>]
       tugma-verify signers <package.json> [--json] [--rpc <url>] [--contract <C...>]
       tugma-verify diff <old-package.json> <new-package.json> [--json] [--offline] [--rpc <url>] [--contract <C...>]

Checks an exported TUGMA evidence package against the Stellar Testnet
attestation contract through Soroban RPC. It never calls TUGMA's API.

  --json             print the full result as JSON
  --rpc <url>        Soroban RPC endpoint (default: https://soroban-testnet.stellar.org)
  --contract <C...>  attestation contract id (default: TUGMA's Testnet contract)
  --horizon <url>    Horizon endpoint, read for two-party attestations (default:
                     https://horizon-testnet.stellar.org)
  --package <file>   (evidence) the package the evidence record should be listed in

"evidence" checks one exported evidence record: its content hash, its line in
the package manifest, and the package on Stellar.

"batch" checks many packages at once (every .json file in a folder, or the
files named) and prints one line per file. It exits 0 only if all are valid.

"diff" lists what changed between two packages: entries added or removed,
evidence whose content hash changed, and the period and counts. It also
looks up which on-chain version each file is (skip with --offline). It exits
0 if the manifests are identical and 1 if they differ.

"signers" audits who attested and who countersigned every on-chain version of
the package the file names, whether each wallet is still an authorized signer,
and recent signer changes. It exits 1 if any version is not countersigned or
was countersigned by its own attester. A two-party (multisig) attestation
counts as signed by two parties when its transaction carries verified
signatures from both required keys.

For a two-party attestation, every command also lists the attestation
account's signers (labelled TUGMA and Independent reviewer on-chain), checks
each signature on the attestation transaction against them (signature hint
plus ed25519 over the transaction hash) and shows whether the account's
thresholds required both.

Exit codes: 0 valid, 1 not valid (tampered, not attested, mismatch or bad signature),
2 bad input, 3 the network could not be reached.`;

export const EXIT = { VALID: 0, TAMPERED: 1, NOT_ATTESTED: 1, MISMATCH: 1, BAD_SIGNATURE: 1, NOT_IN_PACKAGE: 1, PACKAGE_NOT_VALID: 1, INVALID_FILE: 2, USAGE: 2, NETWORK: 3 };

const SUMMARY = {
  VALID: "VALID: this package is the one attested on Stellar.",
  TAMPERED: "NOT VALID (TAMPERED): the package was changed after it was exported.",
  NOT_ATTESTED: "NOT VALID (NOT ATTESTED): no attestation on Stellar matches this package.",
  MISMATCH: "NOT VALID (MISMATCH): the matching attestation is for a different package, organization or period.",
  BAD_SIGNATURE: "NOT VALID (BAD SIGNATURE): the file's export signature does not match this package or signer.",
  INVALID_FILE: "NOT VALID: this is not a TUGMA evidence-package export.",
};

export function parseArgs(argv) {
  const opts = { json: false, file: null, rpcUrl: undefined, contractId: undefined };
  if (["evidence", "batch", "diff", "signers"].includes(argv[0])) {
    opts.mode = argv[0];
    argv = argv.slice(1);
  }
  if (opts.mode === "batch" || opts.mode === "diff") opts.files = [];
  const KEYS = { "--rpc": "rpcUrl", "--contract": "contractId", "--package": "packageFile", "--horizon": "horizonUrl" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--offline" && opts.mode === "diff") opts.offline = true;
    else if (KEYS[a]) {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      opts[KEYS[a]] = v;
    } else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`Unknown option ${a}`);
    else if (opts.files) opts.files.push(a);
    else if (opts.file) throw new Error("Give exactly one package file");
    else opts.file = a;
  }
  if (opts.mode === "evidence" && opts.file && !opts.packageFile) throw new Error("evidence needs --package <package.json>");
  if (opts.mode === "diff" && opts.files.length && opts.files.length !== 2) throw new Error("diff needs exactly two package files");
  if (opts.files) opts.file = opts.files[0] ?? null;
  if (opts.mode !== "evidence" && opts.packageFile) throw new Error("--package is only for the evidence command");
  return opts;
}

/** What the chain reader gets; --horizon only when given (the reader has a default). */
const readerOptions = (opts) => ({ rpcUrl: opts.rpcUrl, contractId: opts.contractId, ...(opts.horizonUrl ? { horizonUrl: opts.horizonUrl } : {}) });

const EVIDENCE_SUMMARY = {
  VALID: "VALID: this evidence record is listed in the package, and the package is the one attested on Stellar.",
  TAMPERED: "NOT VALID (TAMPERED): the evidence record was changed after it was exported.",
  NOT_IN_PACKAGE: "NOT VALID (NOT IN PACKAGE): the package does not list this evidence record.",
  PACKAGE_NOT_VALID: "NOT VALID (PACKAGE NOT VALID): the record is listed, but the package fails verification.",
  INVALID_FILE: "NOT VALID: this is not a TUGMA evidence-record export.",
};

export function formatEvidenceResult(r) {
  const lines = [EVIDENCE_SUMMARY[r.status], ""];
  for (const c of r.checks) lines.push(`  ${c.ok ? "[ok]  " : "[FAIL]"} ${c.name}: ${c.detail}`);
  if (r.note) lines.push(`  Note: ${r.note}`);
  if (r.package) lines.push("", "Package check:", ...formatResult(r.package).split("\n").map((l) => `  ${l}`));
  return lines.join("\n");
}

/** Human-readable report of a verifyPackage() result. */
export function formatResult(r) {
  const lines = [SUMMARY[r.status], ""];
  for (const c of r.checks) lines.push(`  ${c.ok ? "[ok]  " : "[FAIL]"} ${c.name}: ${c.detail}`);
  if (r.attestation && r.status === "VALID") {
    const a = r.attestation;
    lines.push(
      "",
      `  Package      ${a.package_id} (version ${a.version} of ${r.latest_version})`,
      `  Period       ${a.period_start} to ${a.period_end}`,
      `  Organization ${a.org}`,
      `  Attested     ${a.attested_at} in ledger ${a.attested_ledger} by ${a.attester}`,
      `  Countersign  ${a.verifier ? `${a.verified_at} by ${a.verifier}` : "none"}`,
      `  Exported by  ${r.signature ? `${r.signature.signer} at ${r.signature.exported_at}` : "unsigned file"}`,
    );
  }
  if (r.multisig) lines.push("", ...formatMultisig(r.multisig, "  "));
  if (r.history?.versions.length) {
    lines.push("", "  Versions on-chain (newest first):");
    for (const v of r.history.versions) {
      lines.push(`    ${v.matches_file ? "=>" : "  "} v${v.version}  ${v.hash.slice(0, 16)}…  ${v.attested_at}  ${v.countersigned ? "countersigned" : "not countersigned"}${v.matches_file ? "  (this file)" : ""}`);
    }
    if (r.history.omitted) lines.push(`       … and ${r.history.omitted} older version(s)`);
  }
  lines.push("", `  Contract     ${r.contract_id} (Stellar Testnet)`);
  for (const w of r.warnings) lines.push(`  Note: ${w}`);
  lines.push("", r.limitation);
  return lines.join("\n");
}

/**
 * Runs the CLI. `deps.reader(opts)` returns a chain reader; tests pass a fake
 * one, bin/tugma-verify.js passes the real Soroban RPC reader.
 */
export async function main(argv, deps) {
  const out = deps.stdout ?? ((s) => process.stdout.write(`${s}\n`));
  const err = deps.stderr ?? ((s) => process.stderr.write(`${s}\n`));
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err(`${e.message}\n\n${USAGE}`);
    return EXIT.USAGE;
  }
  if (opts.help) {
    out(USAGE);
    return 0;
  }
  if (!opts.file) {
    err(USAGE);
    return EXIT.USAGE;
  }

  if (opts.mode === "batch") return runBatch(opts, deps, out, err);
  if (opts.mode === "diff") return runDiff(opts, deps, out, err);
  if (opts.mode === "signers") return runSigners(opts, deps, out, err);

  const load = async (file) => JSON.parse(await (deps.readFile ?? readFile)(file, "utf8"));
  let first;
  let bundle;
  for (const file of [opts.file, opts.packageFile].filter(Boolean)) {
    try {
      const data = await load(file);
      if (first === undefined) first = data;
      else bundle = data;
    } catch (e) {
      err(`Cannot read ${file} as JSON: ${e.message}`);
      return EXIT.USAGE;
    }
  }

  let result;
  try {
    const chain = deps.reader(readerOptions(opts));
    result = opts.mode === "evidence" ? await verifyEvidence(first, bundle, chain) : await verifyPackage(first, chain);
  } catch (e) {
    err(`Could not reach Soroban RPC: ${e.message}`);
    return EXIT.NETWORK;
  }
  const text = opts.mode === "evidence" ? formatEvidenceResult(result) : formatResult(result);
  out(opts.json ? JSON.stringify(result, null, 2) : text);
  return EXIT[result.status];
}

const BATCH_LABEL = {
  VALID: "VALID",
  TAMPERED: "TAMPERED",
  NOT_ATTESTED: "NOT ATTESTED",
  MISMATCH: "MISMATCH",
  BAD_SIGNATURE: "BAD SIGNATURE",
  INVALID_FILE: "INVALID FILE",
};

/** Human-readable table of a verifyMany() result. */
export function formatBatch(b) {
  const width = Math.max(4, ...b.rows.map((r) => r.name.length));
  const lines = [
    b.all_valid
      ? `All ${b.total} package(s) are VALID.`
      : `${b.valid} of ${b.total} package(s) are VALID; ${b.total - b.valid} NOT VALID.`,
    "",
  ];
  for (const r of b.rows) {
    lines.push(`  ${(r.valid ? "[ok]  " : "[FAIL]")} ${r.name.padEnd(width)}  ${BATCH_LABEL[r.status].padEnd(13)}  ${describeRow(r)}`);
  }
  const rest = Object.entries(b.counts).filter(([k]) => k !== "VALID").map(([k, n]) => `${n} ${BATCH_LABEL[k]}`);
  if (rest.length) lines.push("", `  Not valid: ${rest.join(", ")}`);
  return lines.join("\n");
}

/** Every .json file named, or inside a folder named (not recursive), sorted. */
async function expandPaths(paths, fs) {
  const files = [];
  for (const p of paths) {
    if ((await fs.stat(p)).isDirectory()) {
      const names = (await fs.readdir(p)).filter((n) => n.toLowerCase().endsWith(".json")).sort();
      files.push(...names.map((n) => join(p, n)));
    } else files.push(p);
  }
  return files;
}

async function runBatch(opts, deps, out, err) {
  const fs = { stat: deps.stat ?? stat, readdir: deps.readdir ?? readdir };
  let files;
  try {
    files = await expandPaths(opts.files, fs);
  } catch (e) {
    err(`Cannot read ${e.path ?? "input"}: ${e.message}`);
    return EXIT.USAGE;
  }
  if (!files.length) {
    err("No .json files found.");
    return EXIT.USAGE;
  }
  const entries = [];
  for (const name of files) {
    try {
      entries.push({ name, bundle: JSON.parse(await (deps.readFile ?? readFile)(name, "utf8")) });
    } catch (e) {
      entries.push({ name, error: `not readable as JSON (${e.message})` });
    }
  }
  let batch;
  try {
    batch = await verifyMany(entries, deps.reader(readerOptions(opts)));
  } catch (e) {
    err(`Could not reach Soroban RPC: ${e.message}`);
    return EXIT.NETWORK;
  }
  out(opts.json ? JSON.stringify(batch, null, 2) : formatBatch(batch));
  return batch.all_valid ? 0 : 1;
}

const short = (h) => (h ? `${h.slice(0, 16)}…` : "none");

function describeSide(label, file, s) {
  const chain = s.attestation === undefined
    ? "on-chain status not checked (--offline)"
    : s.attestation
      ? `on-chain as ${s.attestation.package_id} v${s.attestation.version} (${s.attestation.countersigned ? "countersigned" : "not countersigned"})`
      : "not attested on-chain";
  const tampered = s.matches_declared ? "" : ", contents differ from the hash it was exported with";
  return `  ${label}  ${file}: ${s.package_id}, ${short(s.recomputed_hash)}, ${chain}${tampered}`;
}

/** Human-readable report of a diffPackages() result. */
export function formatDiff(d, files) {
  const lines = [
    d.identical ? "IDENTICAL: the two packages have the same manifest." : "DIFFERENT: the packages' manifests differ.",
    "",
    describeSide("Old", files[0], d.before),
    describeSide("New", files[1], d.after),
  ];
  if (!d.same_package) lines.push("", "  Note: the files are different packages, not two versions of one package.");
  for (const f of d.fields) lines.push("", `  ${f.field}: ${JSON.stringify(f.before)} -> ${JSON.stringify(f.after)}`);
  for (const l of d.lists) {
    lines.push("", `  ${l.key}: +${l.added.length} added, -${l.removed.length} removed${l.changed.length ? `, ~${l.changed.length} changed` : ""}`);
    for (const x of l.added) lines.push(`    + ${x}`);
    for (const x of l.removed) lines.push(`    - ${x}`);
    for (const c of l.changed) lines.push(`    ~ ${c.id}  content hash ${short(c.before)} -> ${short(c.after)}`);
  }
  return lines.join("\n");
}

async function runDiff(opts, deps, out, err) {
  const bundles = [];
  for (const file of opts.files) {
    try {
      bundles.push(JSON.parse(await (deps.readFile ?? readFile)(file, "utf8")));
    } catch (e) {
      err(`Cannot read ${file} as JSON: ${e.message}`);
      return EXIT.USAGE;
    }
  }
  let d;
  try {
    const chain = opts.offline ? null : deps.reader(readerOptions(opts));
    d = await diffPackages(bundles[0], bundles[1], chain);
  } catch (e) {
    err(`Could not reach Soroban RPC: ${e.message}`);
    return EXIT.NETWORK;
  }
  if (!d.ok) {
    err(d.error);
    return EXIT.USAGE;
  }
  out(opts.json ? JSON.stringify(d, null, 2) : formatDiff(d, opts.files));
  return d.identical ? 0 : 1;
}

/** Lines describing a two-party attestation's signers (checkAttestationSigners() result). */
export function formatMultisig(m, indent = "") {
  if (!m.thresholds) return [`${indent}Two-party attestation: ${m.problems.join("; ")}`];
  const t = m.thresholds;
  const lines = [
    `${indent}Attestation signers (multisig account ${m.account_id}; thresholds low ${t.low} / medium ${t.med} / high ${t.high}):`,
  ];
  const width = Math.max(...m.signers.map((s) => s.label.length));
  for (const s of m.signers) {
    lines.push(`${indent}  ${s.signed ? "[ok]  " : "[FAIL]"} ${s.label.padEnd(width)}  ${s.key}  weight ${s.weight}  ${s.signed ? "signature verified" : "no valid signature"}`);
  }
  if (m.unknown_signatures) lines.push(`${indent}  ${m.unknown_signatures} signature(s) match no signer of the account`);
  lines.push(m.ok
    ? `${indent}  TWO-PARTY: both signers were required (no single key reaches the threshold of ${m.required_weight}); signed weight ${m.signed_weight} of ${m.required_weight}.`
    : `${indent}  ${m.status === "INSUFFICIENT" ? "INSUFFICIENT" : m.status}: ${m.problems.join("; ")}.`);
  lines.push(`${indent}  Transaction ${m.transaction.hash} (ledger ${m.transaction.ledger}). ${m.note}`);
  return lines;
}

/** Human-readable report of an auditSigners() result. */
export function formatSigners(a) {
  if (!a.version_count) return `NO VERSIONS: ${a.package_id} has no attestation on contract ${a.contract_id}.`;
  const lines = [
    a.ok
      ? a.versions.some((v) => v.multisig?.ok)
        ? `OK: all ${a.versions.length} version(s) of ${a.package_id} were signed by two parties (countersigned by a different wallet, or co-signed by both keys of a two-party account).`
        : `OK: all ${a.versions.length} version(s) of ${a.package_id} were countersigned by a different wallet.`
      : `ATTENTION: ${a.problems.length} problem(s) in the signing history of ${a.package_id}.`,
    "",
    `  Organization ${a.org}`,
    `  Contract     ${a.contract_id} (Stellar Testnet)`,
    "",
    "  Version history (oldest first):",
  ];
  if (a.omitted) lines.push(`    … ${a.omitted} older version(s) not shown`);
  for (const v of a.versions) {
    lines.push(`    ${v.issues.length ? "[FAIL]" : "[ok]  "} v${v.version}  attested ${v.attested_at} by ${v.attester}`);
    lines.push(`                 ${v.verifier ? `countersigned ${v.verified_at} by ${v.verifier}` : v.multisig?.ok ? "two-party attestation: no countersignature needed" : "not countersigned"}`);
    if (v.multisig) lines.push(...formatMultisig(v.multisig, "                 "));
    for (const i of v.issues) lines.push(`                 problem: ${i}`);
  }
  lines.push("", "  Wallets:");
  for (const w of a.wallets) {
    const did = [w.attested.length && `attested v${w.attested.join(", v")}`, w.countersigned.length && `countersigned v${w.countersigned.join(", v")}`].filter(Boolean).join("; ");
    lines.push(`    ${w.address}  ${w.authorized_now ? "authorized now" : "NOT authorized now"}  (${did})`);
  }
  const sc = a.signer_changes;
  if (sc) {
    lines.push("", `  Signer changes since ledger ${sc.from_ledger} (the RPC's retention window):`);
    if (!sc.changes.length) lines.push("    none");
    for (const c of sc.changes) lines.push(`    ${c.at ?? `ledger ${c.ledger}`}  ${c.authorized ? "added  " : "removed"}  ${c.signer}${c.tx_hash ? `  tx ${c.tx_hash}` : ""}`);
  }
  for (const n of a.notes) lines.push(`  Note: ${n}`);
  return lines.join("\n");
}

async function runSigners(opts, deps, out, err) {
  let bundle;
  try {
    bundle = JSON.parse(await (deps.readFile ?? readFile)(opts.file, "utf8"));
  } catch (e) {
    err(`Cannot read ${opts.file} as JSON: ${e.message}`);
    return EXIT.USAGE;
  }
  if (typeof bundle?.org !== "string" || typeof bundle?.package_id !== "string") {
    err("The file does not name an organization and package (org, package_id).");
    return EXIT.USAGE;
  }
  let audit;
  try {
    audit = await auditSigners(deps.reader(readerOptions(opts)), bundle.org, bundle.package_id);
  } catch (e) {
    err(`Could not reach Soroban RPC: ${e.message}`);
    return EXIT.NETWORK;
  }
  out(opts.json ? JSON.stringify(audit, null, 2) : formatSigners(audit));
  return audit.ok ? 0 : 1;
}
