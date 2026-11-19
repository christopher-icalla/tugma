import { canonicalJson } from "./canonical.js";
import { sha256Hex } from "./hash.js";
import { checkExportSignature } from "./signature.js";

export const EXPORT_FORMAT = "tugma.evidence-package";
export const EXPORT_FORMAT_VERSION = 1;

/** At most this many versions are listed; older ones are summarized. */
export const MAX_VERSIONS = 25;

/**
 * Every attested version of a package, newest first, marking the one whose
 * hash is `hash`. Lists at most MAX_VERSIONS.
 */
export async function versionHistory(chain, org, packageId, hash) {
  const count = await chain.versionCount(org, packageId);
  const from = Math.max(1, count - MAX_VERSIONS + 1);
  const versions = [];
  for (let v = count; v >= from; v--) {
    const a = await chain.get(org, packageId, v);
    if (!a) continue;
    versions.push({
      version: a.version,
      hash: a.hash,
      attested_at: a.attested_at,
      attested_ledger: a.attested_ledger,
      countersigned: !!a.verifier,
      matches_file: a.hash === hash,
    });
  }
  return { count, versions, omitted: from - 1 };
}

export const LIMITATION =
  "A VALID result shows that this package is byte-for-byte the package attested on Stellar. " +
  "It establishes package integrity only, not that the contents are true or that the organization is compliant.";

/**
 * Checks an exported TUGMA evidence package against the attestation contract.
 *
 * The hash is always recomputed from the manifest; the hash written in the
 * file is never trusted on its own. The on-chain record is looked up by the
 * recomputed hash, so a package edited after export (even with its declared
 * hash edited to match) cannot verify.
 *
 * Statuses:
 *   VALID         recomputed hash is attested on-chain for this package
 *   TAMPERED      the contents no longer match the hash they were exported with
 *   NOT_ATTESTED  no attestation exists on-chain for the recomputed hash
 *   MISMATCH      an attestation exists, but for a different package or period
 *   BAD_SIGNATURE the file carries an export signature that does not check out
 *   INVALID_FILE  not a TUGMA evidence-package export
 *
 * @param {object} bundle  parsed export file
 * @param {object} chain  createChainReader() result, or a stand-in with the same methods
 */
export async function verifyPackage(bundle, chain) {
  const checks = [];
  const warnings = [];
  const result = (status, extra = {}) => ({
    status,
    valid: status === "VALID",
    checks,
    warnings,
    limitation: LIMITATION,
    contract_id: chain.contractId,
    ...extra,
  });
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    return ok;
  };

  if (
    !check(
      "Export format",
      !!bundle && bundle.format === EXPORT_FORMAT && bundle.format_version === EXPORT_FORMAT_VERSION && bundle.manifest != null,
      `expected ${EXPORT_FORMAT} v${EXPORT_FORMAT_VERSION} with a manifest`,
    )
  ) {
    return result("INVALID_FILE");
  }

  if (bundle.network?.contract_id && bundle.network.contract_id !== chain.contractId) {
    warnings.push(
      `The file names contract ${bundle.network.contract_id}, but this check used ${chain.contractId}. ` +
        "The verifier never takes the contract from the file.",
    );
  }

  // 1. Rebuild the canonical representation and its hash from the manifest.
  const canonical = canonicalJson(bundle.manifest);
  const recomputed = await sha256Hex(canonical);
  const declared = typeof bundle.canonical_hash === "string" ? bundle.canonical_hash.toLowerCase() : null;
  const base = { recomputed_hash: recomputed, declared_hash: declared, package_id: bundle.package_id ?? null };

  const canonicalOk =
    bundle.canonical_manifest === undefined || bundle.canonical_manifest === canonical;
  check("Canonical form", canonicalOk, canonicalOk
    ? "canonical_manifest matches the manifest"
    : "canonical_manifest differs from the canonical form of the manifest");
  const hashOk = declared === recomputed;
  check("Recomputed SHA-256", hashOk, hashOk
    ? `matches the exported hash ${recomputed}`
    : `recomputed ${recomputed}, but the file says ${declared ?? "(missing)"}`);

  // 2. Look the recomputed hash up on Stellar, directly through Soroban RPC.
  const attestation = await chain.verify(recomputed);
  check("On-chain attestation", !!attestation, attestation
    ? `version ${attestation.version} attested in ledger ${attestation.attested_ledger}`
    : `no attestation for ${recomputed} on contract ${chain.contractId}`);

  if (!canonicalOk || !hashOk) return result("TAMPERED", { ...base, attestation });
  if (!attestation) {
    // Show what was attested for the package the file claims to be, if anything.
    const history = typeof bundle.org === "string" && typeof bundle.package_id === "string"
      ? await versionHistory(chain, bundle.org, bundle.package_id, recomputed)
      : null;
    if (history?.count) {
      warnings.push(`${history.count} version(s) of ${bundle.package_id} are attested on-chain, and this file matches none of them.`);
    }
    return result("NOT_ATTESTED", { ...base, attestation: null, history });
  }

  // 3. The record must be for this package, organization and period.
  const period = Array.isArray(bundle.manifest.period) ? bundle.manifest.period : [];
  const same =
    attestation.package_id === bundle.package_id &&
    attestation.org === bundle.org &&
    attestation.period_start === bundle.period_start &&
    attestation.period_end === bundle.period_end &&
    period[0] === attestation.period_start &&
    period[1] === attestation.period_end;
  check("Package, organization and period", same, same
    ? `${attestation.package_id} for ${attestation.org}, ${attestation.period_start} to ${attestation.period_end}`
    : `chain has ${attestation.package_id} for ${attestation.org} (${attestation.period_start} to ${attestation.period_end})`);
  if (!same) return result("MISMATCH", { ...base, attestation });

  const history = await versionHistory(chain, attestation.org, attestation.package_id, recomputed);
  const latest = history.count;
  if (latest > attestation.version) {
    warnings.push(`This is version ${attestation.version}; version ${latest} of this package has since been attested.`);
  }
  if (!attestation.verifier) warnings.push("This attestation has not been countersigned.");

  // 4. Optional: the exporting wallet's SEP-53 signature over this exact package.
  const signature = await checkExportSignature(bundle, recomputed, chain);
  if (signature) {
    check("Export signature", signature.ok, signature.ok
      ? `signed by ${signature.signer}${signature.authorized_signer ? ", an authorized signer for this organization" : " (not an authorized signer on-chain)"}`
      : signature.problems.join("; "));
    if (!signature.ok) return result("BAD_SIGNATURE", { ...base, attestation, latest_version: latest, history, signature });
  }

  return result("VALID", { ...base, attestation, latest_version: latest, history, signature });
}
