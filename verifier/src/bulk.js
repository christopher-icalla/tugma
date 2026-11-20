import { verifyPackage } from "./verify.js";

/**
 * Verifies several package files, one after another so a public Soroban RPC
 * endpoint is not flooded. Each entry is `{ name, bundle }` for a parsed file
 * or `{ name, error }` for one that could not be read; an unreadable file is
 * reported as INVALID_FILE and does not stop the others.
 *
 * A network failure is thrown, as with verifyPackage(): a partial table would
 * look like a set of failed packages when nothing was checked.
 */
export async function verifyMany(entries, chain) {
  const rows = [];
  for (const { name, bundle, error } of entries) {
    if (error) {
      rows.push({ name, status: "INVALID_FILE", valid: false, error, result: null });
      continue;
    }
    const result = await verifyPackage(bundle, chain);
    rows.push({ name, status: result.status, valid: result.valid, error: null, result });
  }
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return { total: rows.length, valid: counts.VALID ?? 0, all_valid: rows.length > 0 && rows.every((r) => r.valid), counts, rows };
}

/** One summary line per file: status, package, version and countersignature. */
export function describeRow(row) {
  const a = row.result?.attestation;
  if (row.error) return row.error;
  if (row.status === "VALID") {
    return `${a.package_id} v${a.version} of ${row.result.latest_version}, ${a.verifier ? "countersigned" : "not countersigned"}`;
  }
  const failed = row.result?.checks.find((c) => !c.ok);
  return failed ? `${failed.name}: ${failed.detail}` : "";
}
