/**
 * Node.js entry point for @tugma/verify. Browsers import ./verify.js and
 * ./chain.js directly and pass in the SDK's browser build.
 */
import * as sdk from "@stellar/stellar-sdk";
import { createChainReader } from "./chain.js";

export { canonicalJson } from "./canonical.js";
export { sha256Hex } from "./hash.js";
export { createChainReader, normalizeAttestation } from "./chain.js";
export { verifyPackage, LIMITATION, EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from "./verify.js";

/** TUGMA's public Stellar Testnet deployment (docs/onchain-footprint.md). */
export const TESTNET = Object.freeze({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH",
  networkPassphrase: sdk.Networks.TESTNET,
});

/** A chain reader for TUGMA's Testnet contract, with any field overridden. */
export const testnetReader = (overrides = {}) => createChainReader(sdk, { ...TESTNET, ...overrides });
