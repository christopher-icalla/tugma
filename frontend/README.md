# TUGMA web app

React 19 (Create React App + CRACO), Tailwind CSS and shadcn/ui. It includes the public
marketing site, the authenticated control center, and Freighter wallet signing for
Stellar attestations.

```sh
corepack enable
yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start          # http://localhost:3000
yarn build          # production build in build/
```

| Path | What it is |
|---|---|
| `src/pages/public/` | Marketing site, including `/stellar` with public hash verification |
| `src/pages/auth/` | Sign in, forgot / reset password |
| `src/pages/app/` | Dashboard, controls, transactions, exceptions, evidence, reports, settings |
| `src/lib/api.js` | Axios client (cookie session) |
| `src/lib/perms.js` | UI mirror of the API's role matrix |
| `src/lib/stellar.js` | Freighter: link wallet (SEP-53), sign and submit attestations |
| `src/components/app/AttestationPanel.jsx` | Attest, countersign, verify and sync for a package |
| `src/components/app/StellarWallet.jsx` | Settings card for linking a wallet |

See the [root README](../README.md) for the full setup, including the API and the Stellar signer setup.
