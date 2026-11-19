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
  INVALID_FILE: ["NOT VALID", "This is not a TUGMA evidence-package export."],
};

export function viewModel(result, explorerUrl = "https://stellar.expert/explorer/testnet") {
  const [title, summary] = HEADLINE[result.status];
  const a = result.attestation;
  const details = [];
  if (result.recomputed_hash) details.push(["Recomputed SHA-256", result.recomputed_hash]);
  if (a && result.status === "VALID") {
    details.push(
      ["Package", `${a.package_id} (version ${a.version} of ${result.latest_version})`],
      ["Period", `${a.period_start} to ${a.period_end}`],
      ["Organization (on-chain id)", a.org],
      ["Attested", `${a.attested_at}, ledger ${a.attested_ledger}`],
      ["Attester", a.attester],
      ["Countersigned", a.verifier ? `${a.verified_at} by ${a.verifier}` : "No"],
    );
  }
  details.push(["Contract", result.contract_id]);
  return {
    valid: result.valid,
    title,
    summary,
    checks: result.checks.map((c) => ({ ok: c.ok, text: `${c.name}: ${c.detail}` })),
    details,
    warnings: result.warnings,
    limitation: result.limitation,
    contractLink: `${explorerUrl}/contract/${encodeURIComponent(result.contract_id)}`,
  };
}
