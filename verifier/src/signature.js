/**
 * Signed exports. The exporting user's Stellar wallet signs a SEP-53 message
 * that names the package, its organization and its SHA-256, and the signature
 * is added to the file as `export_signature`. It proves which account exported
 * this exact package; it does not change the manifest or its hash.
 */
export const EXPORT_MESSAGE_HEADER = "TUGMA evidence package export";

/** The exact text the wallet signs. */
export function exportMessage({ package_id, org, canonical_hash, network_passphrase, exported_at }) {
  return [
    EXPORT_MESSAGE_HEADER,
    `package: ${package_id}`,
    `org: ${org}`,
    `sha256: ${canonical_hash}`,
    `network: ${network_passphrase}`,
    `exported_at: ${exported_at}`,
  ].join("\n");
}

/** Parses a message built by exportMessage(); null if it isn't one. */
export function parseExportMessage(message) {
  const lines = String(message).split("\n");
  if (lines[0] !== EXPORT_MESSAGE_HEADER) return null;
  const fields = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(": ");
    if (i < 0) return null;
    fields[line.slice(0, i)] = line.slice(i + 2);
  }
  return fields;
}

/**
 * Checks `bundle.export_signature` against the recomputed hash.
 * Returns null when the file is unsigned.
 */
export async function checkExportSignature(bundle, recomputedHash, chain) {
  const s = bundle.export_signature;
  if (!s) return null;
  const fields = parseExportMessage(s.message);
  const problems = [];
  if (s.scheme !== "sep53") problems.push(`unknown signature scheme ${s.scheme}`);
  if (!fields) problems.push("the signed message is not a TUGMA export message");
  else {
    if (fields.sha256 !== recomputedHash) problems.push("the signed hash is not this package's hash");
    if (fields.package !== bundle.package_id) problems.push("the signed package id differs");
    if (fields.org !== bundle.org) problems.push("the signed organization differs");
  }
  if (!chain.verifySignedMessage(s.signer, s.message, s.signature)) {
    problems.push(`the signature is not a valid signature by ${s.signer}`);
  }
  if (problems.length) return { ok: false, signer: s.signer ?? null, problems };
  const authorized = await chain.isSigner(bundle.org, s.signer);
  return { ok: true, signer: s.signer, exported_at: fields.exported_at, authorized_signer: authorized };
}
