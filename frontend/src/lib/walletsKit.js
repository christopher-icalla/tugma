// Stellar Wallets Kit, used for the independent reviewer's co-signature. The
// reviewer may use any Stellar wallet (Freighter, xBull, Albedo, Lobstr, ...);
// the kit only asks the wallet to sign, so the reviewer's key never reaches TUGMA.
// Loaded on demand so the rest of the app doesn't ship the wallet modules.
const TESTNET = "Test SDF Network ; September 2015";

let kitPromise;

async function loadKit() {
  if (!kitPromise) {
    kitPromise = (async () => {
      const [{ StellarWalletsKit }, { defaultModules }] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit/sdk"),
        import("@creit.tech/stellar-wallets-kit/modules/utils"),
      ]);
      StellarWalletsKit.init({ modules: defaultModules(), network: TESTNET });
      return StellarWalletsKit;
    })();
  }
  return kitPromise;
}

const message = (e, fallback) => {
  const text = e?.message || (typeof e === "string" ? e : "") || fallback;
  return /declin|reject|denied|closed the modal|cancel/i.test(text) ? "Request was declined in the wallet." : text;
};

/** Opens the kit's wallet picker and returns the chosen account (G...). */
export async function connectReviewerWallet() {
  const kit = await loadKit();
  try {
    const { address } = await kit.authModal();
    if (!address) throw new Error("The wallet did not return an account.");
    return address;
  } catch (e) {
    throw new Error(message(e, "Could not connect a wallet."));
  }
}

/** Signs a transaction envelope in the connected wallet. Testnet only. */
export async function signWithReviewerWallet(xdr, { address, networkPassphrase }) {
  if (networkPassphrase !== TESTNET) throw new Error("Co-signing is available on Stellar Testnet only.");
  const kit = await loadKit();
  try {
    const { signedTxXdr } = await kit.signTransaction(xdr, { address, networkPassphrase });
    if (!signedTxXdr) throw new Error("The wallet did not return a signed transaction.");
    return signedTxXdr;
  } catch (e) {
    throw new Error(message(e, "Signing failed in the wallet."));
  }
}
