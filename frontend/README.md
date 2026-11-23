# TUGMA web app

React 19 (Vite), Tailwind CSS and shadcn/ui. It includes the public
marketing site, the authenticated control center, and Freighter wallet signing for
Stellar attestations.

```sh
corepack enable
pnpm install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
pnpm start          # http://localhost:3000
pnpm lint           # ESLint, warnings fail
pnpm build          # production build in build/
pnpm preview        # serve the production build on http://localhost:3000
```

| Path | What it is |
|---|---|
| `src/pages/public/` | Marketing site, including `/stellar` with public hash verification and `/review/:id`, the reviewer's signing step for a two-party attestation |
| `src/pages/auth/` | Sign in, forgot / reset password |
| `src/pages/app/` | Dashboard, controls, transactions, exceptions, evidence, reports, settings |
| `src/lib/api.js` | Axios client (cookie session) |
| `src/lib/perms.js` | UI mirror of the API's role matrix |
| `src/lib/stellar.js` | Freighter: link wallet (SEP-53), sign and submit attestations |
| `src/lib/walletsKit.js` | Stellar Wallets Kit (loaded on demand): the reviewer connects any Stellar wallet and co-signs on Testnet |
| `src/components/app/AttestationPanel.jsx` | Attest, countersign, verify and sync for a package; request, share and rebuild a two-party attestation |
| `src/components/app/StellarWallet.jsx` | Settings card for linking a wallet |

See the [root README](../README.md) for the full setup, including the API and the Stellar signer setup.
