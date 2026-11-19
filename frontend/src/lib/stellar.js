// Freighter wallet helpers. The API builds every Soroban transaction; the
// wallet only signs it, so secret keys never leave the user's browser.
import {
  isConnected,
  requestAccess,
  signMessage,
  signTransaction,
  getNetworkDetails,
} from "@stellar/freighter-api";
import { api } from "@/lib/api";

export const FREIGHTER_URL = "https://www.freighter.app/";

function unwrap(result, fallback) {
  if (result?.error) {
    const msg = result.error.message || String(result.error);
    throw new Error(/declin|reject|denied/i.test(msg) ? "Request was declined in Freighter." : msg || fallback);
  }
  return result;
}

export async function freighterInstalled() {
  try {
    return Boolean((await isConnected())?.isConnected);
  } catch {
    return false;
  }
}

/** Prompt Freighter for access and return the selected account (G...). */
export async function connectFreighter() {
  if (!(await freighterInstalled())) {
    throw new Error("Freighter is not installed. Install the browser extension, then reload this page.");
  }
  const { address } = unwrap(await requestAccess(), "Could not access Freighter.");
  if (!address) throw new Error("Freighter did not return an account.");
  return address;
}

async function assertNetwork(expectedPassphrase) {
  const details = unwrap(await getNetworkDetails(), "Could not read the Freighter network.");
  if (details.networkPassphrase !== expectedPassphrase) {
    throw new Error(`Switch Freighter to ${expectedPassphrase.includes("Test") ? "Testnet" : "the TUGMA network"} and try again.`);
  }
}

/** Link the Freighter account to the signed-in user by signing a one-time challenge (SEP-53). */
export async function linkWallet() {
  const address = await connectFreighter();
  const { data: ch } = await api.post("/stellar/wallet/challenge", { address });
  const res = unwrap(await signMessage(ch.message, { address }), "Signing was cancelled.");
  if (!res.signedMessage) throw new Error("Signing was cancelled.");
  const signature =
    typeof res.signedMessage === "string" ? res.signedMessage : res.signedMessage.toString("base64");
  const { data } = await api.post("/stellar/wallet/link", { challenge: ch.challenge, signature });
  return data;
}

/**
 * The text a wallet signs for a signed export. Must stay identical to
 * exportMessage() in verifier/src/signature.js, which checks it.
 */
export function exportMessage({ package_id, org, canonical_hash, network_passphrase, exported_at }) {
  return [
    "TUGMA evidence package export",
    `package: ${package_id}`,
    `org: ${org}`,
    `sha256: ${canonical_hash}`,
    `network: ${network_passphrase}`,
    `exported_at: ${exported_at}`,
  ].join("\n");
}

/**
 * Adds the linked wallet's SEP-53 signature to a package export, proving which
 * account exported this exact package. The manifest and its hash don't change.
 */
export async function signExport(bundle, linkedAddress) {
  const address = await connectFreighter();
  if (address !== linkedAddress) {
    throw new Error("Freighter is on a different account than the wallet linked to your TUGMA user. Switch accounts and try again.");
  }
  const message = exportMessage({
    package_id: bundle.package_id,
    org: bundle.org,
    canonical_hash: bundle.canonical_hash,
    network_passphrase: bundle.network.passphrase,
    exported_at: new Date().toISOString(),
  });
  const res = unwrap(await signMessage(message, { address }), "Signing was cancelled.");
  if (!res.signedMessage) throw new Error("Signing was cancelled.");
  const signature = typeof res.signedMessage === "string" ? res.signedMessage : res.signedMessage.toString("base64");
  return { ...bundle, export_signature: { scheme: "sep53", signer: address, message, signature } };
}

/**
 * prepare (API builds + simulates) -> sign (Freighter) -> submit (API sends and
 * records the confirmed result). `action` is "attest" or "countersign".
 */
export async function signAndSubmit(packageId, action, walletAddress, networkPassphrase) {
  // Check the wallet before asking the API to build anything.
  const address = await connectFreighter();
  if (walletAddress && address !== walletAddress) {
    throw new Error(`Freighter is on ${shortKey(address)}, but your linked wallet is ${shortKey(walletAddress)}. Switch accounts in Freighter.`);
  }
  if (networkPassphrase) await assertNetwork(networkPassphrase);

  const { data: prep } = await api.post(`/stellar/packages/${packageId}/${action}/prepare`);
  const signed = unwrap(
    await signTransaction(prep.xdr, { networkPassphrase: prep.network_passphrase, address }),
    "Signing was cancelled.",
  );
  const { data } = await api.post("/stellar/submit", { pending_id: prep.pending_id, signed_xdr: signed.signedTxXdr });
  return data;
}

export const shortKey = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-6)}` : "");

export function explorerTx(explorerUrl, hash) {
  return hash ? `${explorerUrl}/tx/${hash}` : null;
}

export function explorerContract(explorerUrl, contractId) {
  return `${explorerUrl}/contract/${contractId}`;
}
