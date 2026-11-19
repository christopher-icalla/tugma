import { canonicalJson } from "./canonical.js";
import { sha256Hex } from "./hash.js";
import { verifyPackage } from "./verify.js";

export const EVIDENCE_FORMAT = "tugma.evidence-item";
export const EVIDENCE_FORMAT_VERSION = 1;

/**
 * Checks one exported evidence record against an exported package:
 *   1. recompute the record's content hash from its hash_input,
 *   2. find its `id:content_hash` line in the package manifest,
 *   3. verify the package itself against Stellar (verifyPackage).
 * The package file lists only ids and hashes, so the reviewer learns nothing
 * about the package's other documents.
 *
 * Statuses: VALID, TAMPERED (record changed), NOT_IN_PACKAGE (record not
 * listed), PACKAGE_NOT_VALID (the package fails verification, see `package`),
 * INVALID_FILE.
 */
export async function verifyEvidence(item, bundle, chain) {
  const checks = [];
  const check = (name, ok, detail) => (checks.push({ name, ok, detail }), ok);
  const result = (status, extra = {}) => ({ status, valid: status === "VALID", checks, ...extra });

  if (!check("Evidence export format",
    !!item && item.format === EVIDENCE_FORMAT && item.format_version === EVIDENCE_FORMAT_VERSION && item.hash_input != null && typeof item.evidence_id === "string",
    `expected ${EVIDENCE_FORMAT} v${EVIDENCE_FORMAT_VERSION}`)) {
    return result("INVALID_FILE");
  }

  const canonical = canonicalJson(item.hash_input);
  const recomputed = await sha256Hex(canonical);
  const same = recomputed === item.content_hash && (item.canonical_hash_input === undefined || item.canonical_hash_input === canonical);
  check("Recomputed content hash", same, same ? `matches ${recomputed}` : `recomputed ${recomputed}, but the file says ${item.content_hash}`);
  const entry = `${item.evidence_id}:${recomputed}`;
  const base = { evidence_id: item.evidence_id, recomputed_hash: recomputed, manifest_entry: entry };
  if (!same) return result("TAMPERED", base);

  const listed = Array.isArray(bundle?.manifest?.evidence) && bundle.manifest.evidence.includes(entry);
  check("Listed in the package", listed, listed
    ? `${entry} is in ${bundle.package_id}`
    : `${entry} is not in the package manifest`);

  const pkg = await verifyPackage(bundle, chain);
  check("Package on Stellar", pkg.valid, `the package verifies as ${pkg.status}`);
  if (!listed) return result("NOT_IN_PACKAGE", { ...base, package: pkg });
  if (!pkg.valid) return result("PACKAGE_NOT_VALID", { ...base, package: pkg });
  if (item.org && item.org !== bundle.org) {
    return result("NOT_IN_PACKAGE", { ...base, package: pkg, note: "the evidence belongs to a different organization" });
  }
  return result("VALID", { ...base, package: pkg, limitation: pkg.limitation });
}
