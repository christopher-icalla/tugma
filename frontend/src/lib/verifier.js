/**
 * Links to the standalone package verifier (verifier/ in the repository).
 * REACT_APP_VERIFIER_URL points at a hosted copy of verifier/web if there is
 * one; without it, links go to the verifier guide on GitHub.
 */
export const VERIFIER_URL = process.env.REACT_APP_VERIFIER_URL || null;
export const VERIFIER_GUIDE_URL = "https://github.com/christopher-icalla/tugma/blob/main/docs/verify-a-package.md";

/** Where to send someone who wants to check a package file themselves. */
export function verifierLink(hash) {
  if (!VERIFIER_URL) return VERIFIER_GUIDE_URL;
  return hash ? `${VERIFIER_URL}?hash=${encodeURIComponent(hash)}` : VERIFIER_URL;
}

/**
 * Text encoded in a package's QR code. The package id and hash are always in
 * plain text, so the code stays useful without any hosted page.
 */
export function packageQrText(pkg) {
  const lines = [`TUGMA evidence package ${pkg.id}`, `sha256:${pkg.canonical_hash}`];
  if (VERIFIER_URL) lines.push(verifierLink(pkg.canonical_hash));
  return lines.join("\n");
}
