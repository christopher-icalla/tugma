import { readFileSync } from "node:fs";
import * as sdk from "@stellar/stellar-sdk";
import { canonicalJson } from "../src/canonical.js";
import { sha256Hex } from "../src/hash.js";

export const CONTRACT = "CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH";
export const ORG = "org_3f9c0b1e7a2d4c58b6e1f0a9d2c3b4e5";
const ATTESTER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const { vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

/** A package export as GET /api/evidence-packages/:id/export produces it. */
export async function exportedPackage(manifest = structuredClone(vectors[0].input)) {
  const canonical_manifest = canonicalJson(manifest);
  const [period_start, period_end] = manifest.period;
  return {
    format: "tugma.evidence-package",
    format_version: 1,
    package_id: `pkg-${period_start}-${period_end}`,
    period_start,
    period_end,
    org: ORG,
    canonical_hash: await sha256Hex(canonical_manifest),
    hash_algorithm: "sha256",
    canonicalization: "json-sorted-keys-compact-utf8",
    network: { name: "TESTNET", passphrase: "Test SDF Network ; September 2015", contract_id: CONTRACT },
    manifest,
    canonical_manifest,
  };
}

/** In-memory stand-in for the contract's read functions. */
export function fakeChain(contractId = CONTRACT) {
  const records = [];
  return {
    contractId,
    attest(bundle, over = {}) {
      const version = records.filter((r) => r.org === bundle.org && r.package_id === bundle.package_id).length + 1;
      const rec = {
        org: bundle.org,
        package_id: bundle.package_id,
        version,
        hash: bundle.canonical_hash,
        period_start: bundle.period_start,
        period_end: bundle.period_end,
        attester: ATTESTER,
        attested_at: "2026-11-12T03:00:00.000Z",
        attested_ledger: 1000 + records.length,
        verifier: null,
        verified_at: null,
        ...over,
      };
      records.push(rec);
      return rec;
    },
    async verify(hash) {
      return records.find((r) => r.hash === hash) ?? null;
    },
    async versionCount(org, packageId) {
      return records.filter((r) => r.org === org && r.package_id === packageId).length;
    },
    async get(org, packageId, version) {
      return records.find((r) => r.org === org && r.package_id === packageId && r.version === version) ?? null;
    },
    signers: new Set(),
    async isSigner(org, address) {
      return this.signers.has(`${org}|${address}`);
    },
    verifySignedMessage(address, message, signatureB64) {
      try {
        return sdk.Keypair.fromPublicKey(address).verifyMessage(message, Buffer.from(signatureB64, "base64"));
      } catch {
        return false;
      }
    },
  };
}
