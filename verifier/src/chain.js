/**
 * Read-only client for the TUGMA attestation contract over Soroban RPC.
 *
 * The Stellar SDK is passed in rather than imported, so this file runs both in
 * Node.js (`import * as sdk from "@stellar/stellar-sdk"`) and in a browser
 * (the SDK's browser build exposes `window.StellarSdk`). Reads are transaction
 * simulations: nothing is signed or submitted, and no TUGMA server is involved.
 */

// Any syntactically valid account can be the source of a read-only simulation.
const SIMULATION_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
// Contract error #3 (NotFound) in contracts/contracts/attestation/src/lib.rs.
const NOT_FOUND = /Error\(Contract, #3\)/;

export function createChainReader(sdk, { rpcUrl, contractId, networkPassphrase }, server) {
  const rpcServer = server ?? new sdk.rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const contract = new sdk.Contract(contractId);

  async function read(method, ...args) {
    const tx = new sdk.TransactionBuilder(new sdk.Account(SIMULATION_SOURCE, "0"), {
      fee: sdk.BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await withRetry(() => rpcServer.simulateTransaction(tx));
    if (sdk.rpc.Api.isSimulationError(sim)) {
      if (NOT_FOUND.test(String(sim.error))) return null;
      throw new Error(`Contract read ${method} failed: ${sim.error}`);
    }
    return sim.result ? sdk.scValToNative(sim.result.retval) : null;
  }

  const str = (v) => sdk.nativeToScVal(v, { type: "string" });

  return {
    contractId,
    networkPassphrase,
    /** The attestation recorded for a SHA-256 (hex), or null if none. */
    async verify(hashHex) {
      if (!/^[0-9a-f]{64}$/.test(hashHex)) throw new Error("Hash must be 64 lowercase hex characters.");
      const bytes = Uint8Array.from(hashHex.match(/../g), (h) => parseInt(h, 16));
      return normalizeAttestation(await read("verify", sdk.xdr.ScVal.scvBytes(bytes)));
    },
    /** How many versions of a package the organization has attested. */
    async versionCount(org, packageId) {
      return Number((await read("version_count", str(org), str(packageId))) ?? 0);
    },
    /** Whether `address` is currently an authorized signer for `org` on the contract. */
    async isSigner(org, address) {
      return Boolean(await read("is_signer", str(org), new sdk.Address(address).toScVal()));
    },
    /** SEP-53: was `message` signed by the Stellar account `address`? (signature in base64) */
    verifySignedMessage(address, message, signatureB64) {
      try {
        if (!sdk.StrKey.isValidEd25519PublicKey(address)) return false;
        const sig = base64ToBytes(signatureB64);
        return sig.length === 64 && sdk.Keypair.fromPublicKey(address).verifyMessage(message, sig);
      } catch {
        return false;
      }
    },
  };
}

/**
 * Retries a call that failed to reach the RPC (a thrown error, such as a
 * dropped connection). A simulation error is a normal response and is not
 * retried.
 */
export async function withRetry(call, attempts = 3, delayMs = 500) {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
}

function base64ToBytes(b64) {
  const bin = globalThis.atob(String(b64));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const seconds = (v) => (v === null || v === undefined ? null : new Date(Number(v) * 1000).toISOString());

/** Contract `Attestation` (scValToNative output) -> plain object with hex hash and ISO dates. */
export function normalizeAttestation(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    org: String(raw.org),
    package_id: String(raw.package_id),
    version: Number(raw.version),
    hash: toHex(raw.hash),
    period_start: String(raw.period_start),
    period_end: String(raw.period_end),
    attester: String(raw.attester),
    attested_at: seconds(raw.attested_at),
    attested_ledger: Number(raw.attested_ledger),
    verifier: raw.verifier ? String(raw.verifier) : null,
    verified_at: seconds(raw.verified_at),
  };
}
