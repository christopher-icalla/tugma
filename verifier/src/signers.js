import { readAttestationSigners } from "./multisig.js";

/** Never walk more versions than this in one audit. */
export const MAX_AUDIT_VERSIONS = 100;

/**
 * Who attested and who countersigned every version of a package, read from
 * the contract, with each wallet's current signer status.
 *
 * Problems (any one makes `ok` false):
 *   - a version is not countersigned (unless it is a two-party attestation whose
 *     transaction carries both required signatures, checked against the account)
 *   - a two-party attestation whose signatures don't meet the account's threshold
 *   - a version was countersigned by the wallet that attested it (the
 *     contract refuses this; the audit checks it independently)
 * Notes (reported, but not problems on their own):
 *   - a wallet that signed is no longer an authorized signer
 *   - recent signer additions and removals, when the RPC still holds them
 *
 * @param {object} chain  createChainReader() result or a stand-in
 * @param {{ events?: boolean }} options  events: false skips the event lookup
 */
export async function auditSigners(chain, org, packageId, { events = true } = {}) {
  const count = await chain.versionCount(org, packageId);
  const from = Math.max(1, count - MAX_AUDIT_VERSIONS + 1);
  const versions = [];
  for (let v = from; v <= count; v++) {
    const a = await chain.get(org, packageId, v);
    if (a) versions.push(a);
  }

  const wallets = new Map();
  const wallet = (address) => {
    if (!wallets.has(address)) wallets.set(address, { address, attested: [], countersigned: [], authorized_now: null });
    return wallets.get(address);
  };
  const problems = [];
  const notes = [];
  const multisig = new Map();
  for (const a of versions) {
    const r = await readAttestationSigners(chain, a);
    if (r.error) notes.push(`v${a.version}: the attestation's signers could not be read from Horizon: ${r.error}`);
    if (r.signers) multisig.set(a.version, r.signers);
  }
  const rows = versions.map((a) => {
    wallet(a.attester).attested.push(a.version);
    if (a.verifier) wallet(a.verifier).countersigned.push(a.version);
    const issues = [];
    const two = multisig.get(a.version) ?? null;
    if (two && !two.ok) issues.push(`two-party attestation: ${two.problems.join("; ")}`);
    if (!a.verifier && !two?.ok) issues.push("not countersigned");
    else if (a.verifier === a.attester) issues.push("countersigned by the attesting wallet");
    for (const i of issues) problems.push(`v${a.version}: ${i}`);
    return {
      version: a.version,
      hash: a.hash,
      attester: a.attester,
      attested_at: a.attested_at,
      attested_ledger: a.attested_ledger,
      verifier: a.verifier,
      verified_at: a.verified_at,
      multisig: two,
      issues,
    };
  });

  for (const w of wallets.values()) {
    w.authorized_now = await chain.isSigner(org, w.address);
    if (!w.authorized_now) notes.push(`${w.address} signed v${[...new Set([...w.attested, ...w.countersigned])].sort((x, y) => x - y).join(", v")} but is no longer an authorized signer.`);
  }

  let signerChanges = null;
  if (events && typeof chain.signerChanges === "function") {
    try {
      signerChanges = await chain.signerChanges(org);
    } catch (e) {
      notes.push(`Recent signer changes could not be read from the RPC: ${e.message}`);
    }
  }

  return {
    org,
    package_id: packageId,
    version_count: count,
    omitted: from - 1,
    ok: count > 0 && problems.length === 0,
    problems,
    notes,
    versions: rows,
    wallets: [...wallets.values()],
    signer_changes: signerChanges,
    contract_id: chain.contractId,
  };
}
