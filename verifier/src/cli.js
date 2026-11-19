import { readFile } from "node:fs/promises";
import { verifyPackage } from "./verify.js";

export const USAGE = `Usage: tugma-verify <package.json> [--json] [--rpc <url>] [--contract <C...>]

Checks an exported TUGMA evidence package against the Stellar Testnet
attestation contract through Soroban RPC. It never calls TUGMA's API.

  --json             print the full result as JSON
  --rpc <url>        Soroban RPC endpoint (default: https://soroban-testnet.stellar.org)
  --contract <C...>  attestation contract id (default: TUGMA's Testnet contract)

Exit codes: 0 valid, 1 not valid (tampered, not attested, mismatch or bad signature),
2 bad input, 3 the network could not be reached.`;

export const EXIT = { VALID: 0, TAMPERED: 1, NOT_ATTESTED: 1, MISMATCH: 1, BAD_SIGNATURE: 1, INVALID_FILE: 2, USAGE: 2, NETWORK: 3 };

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
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--rpc" || a === "--contract") {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      opts[a === "--rpc" ? "rpcUrl" : "contractId"] = v;
    } else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`Unknown option ${a}`);
    else if (opts.file) throw new Error("Give exactly one package file");
    else opts.file = a;
  }
  return opts;
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

  let bundle;
  try {
    bundle = JSON.parse(await (deps.readFile ?? readFile)(opts.file, "utf8"));
  } catch (e) {
    err(`Cannot read ${opts.file} as JSON: ${e.message}`);
    return EXIT.USAGE;
  }

  let result;
  try {
    result = await verifyPackage(bundle, deps.reader({ rpcUrl: opts.rpcUrl, contractId: opts.contractId }));
  } catch (e) {
    err(`Could not reach Soroban RPC: ${e.message}`);
    return EXIT.NETWORK;
  }
  out(opts.json ? JSON.stringify(result, null, 2) : formatResult(result));
  return EXIT[result.status];
}
