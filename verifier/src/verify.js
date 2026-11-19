import { canonicalJson } from "./canonical.js";
import { sha256Hex } from "./hash.js";
import { checkExportSignature } from "./signature.js";

export const EXPORT_FORMAT = "tugma.evidence-package";
export const EXPORT_FORMAT_VERSION = 1;

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
  if (!attestation) return result("NOT_ATTESTED", { ...base, attestation: null });

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

  const latest = await chain.versionCount(attestation.org, attestation.package_id);
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
    if (!signature.ok) return result("BAD_SIGNATURE", { ...base, attestation, latest_version: latest, signature });
  }

  return result("VALID", { ...base, attestation, latest_version: latest, signature });
}
