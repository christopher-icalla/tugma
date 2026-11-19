/**
 * Turns a verifyPackage() result into plain rows for the page. Kept free of
 * DOM code so it can be tested in Node; app.js renders the rows with
 * textContent only, so nothing from the file is ever parsed as HTML.
 */
const HEADLINE = {
  VALID: ["VALID", "This package is the one attested on Stellar."],
  TAMPERED: ["NOT VALID: TAMPERED", "The package was changed after it was exported."],
  NOT_ATTESTED: ["NOT VALID: NOT ATTESTED", "No attestation on Stellar matches this package."],
  MISMATCH: ["NOT VALID: MISMATCH", "The matching attestation is for a different package, organization or period."],
  BAD_SIGNATURE: ["NOT VALID: BAD SIGNATURE", "The file's export signature does not match this package or signer."],
  INVALID_FILE: ["NOT VALID", "This is not a TUGMA evidence-package export."],
};

/** A `?hash=` from a QR code or link: 64 hex characters, else null. */
export function expectedHashFrom(search) {
  const h = new URLSearchParams(search).get("hash")?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(h) ? h : null;
}

export function viewModel(result, explorerUrl = "https://stellar.expert/explorer/testnet", expectedHash = null) {
  let [title, summary] = HEADLINE[result.status];
  let valid = result.valid;
  const a = result.attestation;
  const details = [];
  const checks = result.checks.map((c) => ({ ok: c.ok, text: `${c.name}: ${c.detail}` }));
  if (expectedHash) {
    const same = result.recomputed_hash === expectedHash;
    checks.push({ ok: same, text: `Hash from the link: ${same ? "matches this file" : `the link is for ${expectedHash}, not this file`}` });
    if (!same) {
      valid = false;
      title = "NOT THE LINKED PACKAGE";
      summary = "This file is not the package the link or QR code refers to.";
    }
  }
  if (result.recomputed_hash) details.push(["Recomputed SHA-256", result.recomputed_hash]);
  if (a && result.status === "VALID") {
    details.push(
      ["Package", `${a.package_id} (version ${a.version} of ${result.latest_version})`],
      ["Period", `${a.period_start} to ${a.period_end}`],
      ["Organization (on-chain id)", a.org],
      ["Attested", `${a.attested_at}, ledger ${a.attested_ledger}`],
      ["Attester", a.attester],
      ["Countersigned", a.verifier ? `${a.verified_at} by ${a.verifier}` : "No"],
      ["Exported by", result.signature ? `${result.signature.signer} at ${result.signature.exported_at}` : "Unsigned file"],
    );
  }
  details.push(["Contract", result.contract_id]);
  const versions = (result.history?.versions ?? []).map((v) => ({
    current: v.matches_file,
    text: `v${v.version} · ${v.attested_at} · ${v.countersigned ? "countersigned" : "not countersigned"}${v.matches_file ? " · this file" : ""}`,
    hash: v.hash,
  }));
  return {
    valid,
    title,
    summary,
    checks,
    details,
    versions,
    versionsOmitted: result.history?.omitted ?? 0,
    warnings: result.warnings,
    limitation: result.limitation,
    contractLink: `${explorerUrl}/contract/${encodeURIComponent(result.contract_id)}`,
  };
}
