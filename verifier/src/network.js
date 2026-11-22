/** TUGMA's public Stellar Testnet deployment (docs/onchain-footprint.md). */
export const TESTNET = Object.freeze({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH",
  networkPassphrase: "Test SDF Network ; September 2015",
  // Read only for two-party attestations: the attester account's signers and the attestation transaction.
  horizonUrl: "https://horizon-testnet.stellar.org",
});
