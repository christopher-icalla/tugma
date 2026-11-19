import { readFile } from "node:fs/promises";
import { verifyEvidence } from "./evidence.js";
import { verifyPackage } from "./verify.js";

export const USAGE = `Usage: tugma-verify <package.json> [--json] [--rpc <url>] [--contract <C...>]
       tugma-verify evidence <evidence.json> --package <package.json> [--json] [--rpc <url>] [--contract <C...>]

Checks an exported TUGMA evidence package against the Stellar Testnet
attestation contract through Soroban RPC. It never calls TUGMA's API.

  --json             print the full result as JSON
  --rpc <url>        Soroban RPC endpoint (default: https://soroban-testnet.stellar.org)
  --contract <C...>  attestation contract id (default: TUGMA's Testnet contract)
  --package <file>   (evidence) the package the evidence record should be listed in

"evidence" checks one exported evidence record: its content hash, its line in
the package manifest, and the package on Stellar.

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
  if (argv[0] === "evidence") {
    opts.mode = "evidence";
    argv = argv.slice(1);
  }
  const KEYS = { "--rpc": "rpcUrl", "--contract": "contractId", "--package": "packageFile" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (KEYS[a]) {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      opts[KEYS[a]] = v;
    } else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`Unknown option ${a}`);
    else if (opts.file) throw new Error("Give exactly one package file");
    else opts.file = a;
  }
  if (opts.mode === "evidence" && opts.file && !opts.packageFile) throw new Error("evidence needs --package <package.json>");
  if (opts.mode !== "evidence" && opts.packageFile) throw new Error("--package is only for the evidence command");
  return opts;
}

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
    const chain = deps.reader({ rpcUrl: opts.rpcUrl, contractId: opts.contractId });
    result = opts.mode === "evidence" ? await verifyEvidence(first, bundle, chain) : await verifyPackage(first, chain);
  } catch (e) {
    err(`Could not reach Soroban RPC: ${e.message}`);
    return EXIT.NETWORK;
  }
  const text = opts.mode === "evidence" ? formatEvidenceResult(result) : formatResult(result);
  out(opts.json ? JSON.stringify(result, null, 2) : text);
  return EXIT[result.status];
}
