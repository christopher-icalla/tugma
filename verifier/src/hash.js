/**
 * SHA-256 of a UTF-8 string as lowercase hex, using the Web Crypto API so the
 * same code runs in Node.js (22+) and in browsers.
 */
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
