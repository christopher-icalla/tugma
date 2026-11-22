/**
 * Who signed an attestation transaction, checked from public Stellar data.
 *
 * A two-party TUGMA attestation comes from an attestation account whose
 * signers are TUGMA's key and an independent reviewer's key (weight 1 each)
 * with thresholds of 2, so the network accepts its transactions only with both
 * signatures. This module takes the account (signers, thresholds, and the
 * `tugma.signer.*` data entries that label them, as Horizon returns it) and the
 * attestation transaction's envelope, and verifies every signature itself:
 * the signature hint picks the candidate key, and an ed25519 check over the
 * transaction hash decides. Nothing is taken from TUGMA or from the package file.
 *
 * The Stellar SDK is passed in, as in chain.js, so this runs in Node and in
 * the browser.
 */

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

/** On-chain labels the setup script writes (backend/scripts/create-attestation-account.js). */
export const LABELS = Object.freeze({ tugma: "tugma.signer.tugma", reviewer: "tugma.signer.reviewer" });
const ROLE_NAMES = { tugma: "TUGMA", reviewer: "Independent reviewer" };

// The SDK's XDR values expose bytes as `.value`; older builds use accessor methods.
const bytesOf = (x) => {
  const v = typeof x === "function" ? x() : x;
  return v?.value instanceof Uint8Array ? v.value : v;
};
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function base64ToBytes(b64) {
  const bin = globalThis.atob(String(b64));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Whether a Horizon account record has more than one key, or thresholds above 1. */
export function isMultisigAccount(account) {
  const keys = (account?.signers ?? []).filter((s) => Number(s.weight) > 0);
  const t = account?.thresholds ?? {};
  return keys.length > 1 || Math.max(Number(t.low_threshold ?? 0), Number(t.med_threshold ?? 0), Number(t.high_threshold ?? 0)) > 1;
}

/** The signer keys named by the account's `tugma.signer.*` data entries. */
export function signerLabels(sdk, account) {
  const out = {};
  for (const [role, name] of Object.entries(LABELS)) {
    const v = account?.data?.[name];
    try {
      if (v) out[role] = sdk.StrKey.encodeEd25519PublicKey(base64ToBytes(v));
    } catch {
      // not a public key: ignore the label
    }
  }
  return out;
}

/** Whether `tx` is the `attest` call on `contractId` for `attester` and `hashHex`. */
export function isAttestCall(sdk, tx, { contractId, attester, hashHex }) {
  if (tx.operations?.length !== 1 || tx.operations[0].type !== "invokeHostFunction") return false;
  const call = tx.operations[0].func?.invokeContract ?? tx.operations[0].func?.value;
  if (!call) return false;
  try {
    if (sdk.Address.fromScAddress(call.contractAddress).toString() !== contractId) return false;
    if (String(call.functionName) !== "attest" || call.args?.length !== 6) return false;
    const args = call.args.map((a) => sdk.scValToNative(a));
    return String(args[0]) === attester && args[5] instanceof Uint8Array && toHex(args[5]) === hashHex;
  } catch {
    return false;
  }
}

/**
 * Checks the signatures on an attestation transaction against the attester
 * account's signers and thresholds.
 *
 * @param {object} sdk  Stellar SDK
 * @param {{ account: object, transaction: { hash: string, ledger: number, envelope_xdr: string },
 *           attestation: object, contractId: string, networkPassphrase: string }} input
 *   `account` and `transaction` as Horizon returns them.
 *
 * status:
 *   TWO_PARTY     the verified signatures reach the threshold, and no single key could have
 *   INSUFFICIENT  the verified signatures do not reach the threshold
 *   SINGLE_KEY    one key alone reaches the threshold, so the account is not two-party
 *   NOT_ATTEST    the transaction is not this attestation
 */
export function checkAttestationSigners(sdk, { account, transaction, attestation, contractId, networkPassphrase }) {
  if (networkPassphrase !== TESTNET_PASSPHRASE) throw new Error("Multisig checks run on Stellar Testnet only.");
  let tx = sdk.TransactionBuilder.fromXDR(transaction.envelope_xdr, networkPassphrase);
  if (tx.innerTransaction) tx = tx.innerTransaction;
  const txHash = tx.hash();
  const problems = [];
  if (toHex(txHash) !== String(transaction.hash).toLowerCase()) problems.push("the envelope does not hash to the transaction's id");
  if (tx.source !== attestation.attester) problems.push("the transaction is not from the attester account");
  if (!isAttestCall(sdk, tx, { contractId, attester: attestation.attester, hashHex: attestation.hash })) {
    problems.push("the transaction is not the attest call for this package hash on this contract");
  }

  const t = account.thresholds;
  const thresholds = { low: Number(t.low_threshold), med: Number(t.med_threshold), high: Number(t.high_threshold) };
  // Transaction-level checks use the low threshold; invoking a contract uses medium.
  const required = Math.max(thresholds.low, thresholds.med, 1);
  const labels = signerLabels(sdk, account);
  const roleOf = (key) => Object.keys(labels).find((r) => labels[r] === key) ?? null;

  const signatures = tx.signatures.map((s) => ({ hint: bytesOf(s.hint), sig: s.signature, matched: false }));
  const signers = account.signers
    .filter((s) => s.type === "ed25519_public_key")
    .map((s) => {
      const kp = sdk.Keypair.fromPublicKey(s.key);
      const hint = kp.rawPublicKey().slice(-4);
      let signed = false;
      for (const candidate of signatures) {
        if (!sameBytes(candidate.hint, hint)) continue;
        let ok = false;
        try {
          ok = kp.verify(txHash, candidate.sig);
        } catch {
          ok = false;
        }
        if (ok) {
          candidate.matched = true;
          signed = true;
        }
      }
      const role = s.key === account.account_id ? "master" : roleOf(s.key);
      return {
        key: s.key,
        weight: Number(s.weight),
        role,
        label: role === "master" ? "Account master key" : ROLE_NAMES[role] ?? "Unlabeled signer",
        signed,
      };
    });

  const signedWeight = signers.filter((s) => s.signed).reduce((n, s) => n + s.weight, 0);
  const singleKey = signers.some((s) => s.weight >= required);
  const signedKeys = signers.filter((s) => s.signed && s.weight > 0).length;
  const status = problems.length
    ? "NOT_ATTEST"
    : singleKey
      ? "SINGLE_KEY"
      : signedWeight >= required && signedKeys >= 2
        ? "TWO_PARTY"
        : "INSUFFICIENT";
  if (status === "INSUFFICIENT") problems.push(`verified signatures weigh ${signedWeight}, below the account's threshold of ${required}`);
  if (status === "SINGLE_KEY") problems.push(`a single key reaches the account's threshold of ${required}, so it is not two-party`);

  return {
    multisig: true,
    status,
    ok: status === "TWO_PARTY",
    account_id: account.account_id,
    thresholds,
    required_weight: required,
    signed_weight: signedWeight,
    signers: signers.filter((s) => s.weight > 0 || s.signed),
    master_weight: signers.find((s) => s.role === "master")?.weight ?? 0,
    unknown_signatures: signatures.filter((s) => !s.matched).length,
    transaction: { hash: String(transaction.hash), ledger: Number(transaction.ledger) },
    problems,
    note: "Signers and thresholds are the account's current ones on Horizon.",
  };
}

/**
 * Reads what checkAttestationSigners needs from Horizon: the attester account,
 * and its attestation transaction (the account's successful transaction in
 * the attestation's ledger that is the `attest` call for that hash).
 * Returns { multisig: false } for an ordinary single-key wallet.
 */
export function createHorizonSigners(sdk, { horizonUrl, contractId, networkPassphrase }, fetchJson) {
  const base = String(horizonUrl).replace(/\/+$/, "");
  const get = fetchJson ?? (async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Horizon ${res.status} for ${url}`);
    return res.json();
  });

  async function findTransaction(attestation) {
    let url = `${base}/accounts/${attestation.attester}/transactions?order=desc&limit=200`;
    for (let page = 0; page < 10 && url; page++) {
      const body = await get(url);
      const records = body?._embedded?.records ?? [];
      for (const r of records) {
        if (Number(r.ledger) !== attestation.attested_ledger || r.successful === false) continue;
        let tx = sdk.TransactionBuilder.fromXDR(r.envelope_xdr, networkPassphrase);
        if (tx.innerTransaction) tx = tx.innerTransaction;
        if (isAttestCall(sdk, tx, { contractId, attester: attestation.attester, hashHex: attestation.hash })) return r;
      }
      if (!records.length || Number(records[records.length - 1].ledger) < attestation.attested_ledger) return null;
      url = body?._links?.next?.href ?? null;
    }
    return null;
  }

  return async function attestationSigners(attestation) {
    if (networkPassphrase !== TESTNET_PASSPHRASE) throw new Error("Multisig checks run on Stellar Testnet only.");
    const account = await get(`${base}/accounts/${attestation.attester}`);
    if (!isMultisigAccount(account)) return { multisig: false };
    const transaction = await findTransaction(attestation);
    if (!transaction) {
      return {
        multisig: true, status: "TX_NOT_FOUND", ok: false, account_id: account.account_id,
        problems: [`the attestation transaction in ledger ${attestation.attested_ledger} was not found on Horizon`], signers: [],
      };
    }
    return checkAttestationSigners(sdk, { account, transaction, attestation, contractId, networkPassphrase });
  };
}

/**
 * chain.attestationSigners(attestation) when the reader has it (a Horizon URL
 * is configured). Returns { signers } for a multisig attester, {} for an
 * ordinary wallet or a reader without Horizon, and { error } if Horizon failed.
 */
export async function readAttestationSigners(chain, attestation) {
  if (typeof chain?.attestationSigners !== "function") return {};
  try {
    const r = await chain.attestationSigners(attestation);
    return r?.multisig ? { signers: r } : {};
  } catch (e) {
    return { error: e.message };
  }
}
