/**
 * Node.js entry point for @tugma/verify. Browsers import ./verify.js,
 * ./chain.js and ./network.js directly and pass in the SDK's browser build.
 */
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader } from "./chain.js";
import { TESTNET } from "./network.js";

export { canonicalJson } from "./canonical.js";
export { sha256Hex } from "./hash.js";
export { createChainReader, normalizeAttestation, withRetry } from "./chain.js";
export { verifyEvidence, EVIDENCE_FORMAT } from "./evidence.js";
export { exportMessage, parseExportMessage, checkExportSignature } from "./signature.js";
export { verifyPackage, versionHistory, MAX_VERSIONS, LIMITATION, EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from "./verify.js";
export { TESTNET };

/** A chain reader for TUGMA's Testnet contract, with any field overridden. */
export const testnetReader = (overrides = {}) => createChainReader(sdk, { ...TESTNET, ...overrides });
