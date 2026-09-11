# TUGMA — Compliance You Can Prove.

**Continuous Payment Control Intelligence** for regulated payment operators in the Philippines.

TUGMA continuously tests payment operations against regulatory and organizational controls,
identifies exceptions, connects them to evidence and remediation, and produces verifiable
evidence packages.

Conceptual flow:

```
REGULATION → REQUIREMENT → CONTROL → PAYMENT ACTIVITY → AUTOMATED TEST
  → EXCEPTION → REMEDIATION → EVIDENCE → VERIFICATION → PROOF
```

## What TUGMA is NOT
TUGMA is a control and evidence layer. It is **not** an AML transaction-monitoring replacement,
a payment processor, a bank, a regulator, legal advice, a government-certified compliance system,
or a blockchain database. All data in this build is **synthetic demonstration data**.

---

## Current MVP scope (Phase 1 — Foundation + UI)
- Public marketing website: `/`, `/how-it-works`, `/regulatory-intelligence`, `/controls`, `/stellar`, `/security`, `/contact`
- Authenticated application shell with persistent sidebar under `/app/*`
- JWT email/password authentication with password reset flow
- Synthetic demo organization (**TUGMA Demo PSP**) + 7 role-based demo users
- MongoDB schema/collections for all core entities
- Regulatory sources (BSP, AMLC), controls (CTRL-001…005), transactions, exceptions,
  remediation, evidence, evidence packages, and a Stellar testnet attestation record
- Dashboard KPIs, Control Health and Priority Exceptions backed by the database

The deterministic **control engine** and the full 10,000-transaction dataset are intentionally
deferred to Phase 2. Real Stellar testnet submission is deferred; hashes are computed for real
but not broadcast.

---

## Architecture
Modular, not micro-services:

```
backend/
  db.py       # Mongo connection + shared constants
  auth.py     # password hashing, JWT, role authorization, auth routes, seeding
  seed.py     # synthetic demonstration data
  api.py      # domain API (dashboard, regulatory, controls, transactions, exceptions, evidence, reports, stellar)
  server.py   # app wiring, indexes, startup seeding

frontend/src/
  components/public/   # marketing chrome, flow diagram, primitives
  components/app/      # AppShell (sidebar), shared hooks/helpers
  components/          # StatusBadge, States (loading/empty/error/permission)
  pages/public/        # 7 marketing pages
  pages/auth/          # login, forgot/reset password
  pages/app/           # 8 authenticated pages
  context/AuthContext  # session state
  lib/api.js           # axios instance (withCredentials)
```

Every organization-owned record carries `organization_id`; there is no cross-organization
access path. UUID string primary keys are used throughout.

---

## Roles
`ADMIN, PAYMENT_OPS, COMPLIANCE, RISK, FINANCE, AUDITOR, VIEWER` — see `/app/settings` in the app.

## Local development
Services are managed by supervisor (do not run uvicorn/yarn start manually):
```
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
```
Backend: FastAPI on `0.0.0.0:8001` (routes prefixed `/api`). Frontend: React on `:3000`.

## Environment variables
Backend (`backend/.env`): `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `DEMO_USER_PASSWORD`, `FRONTEND_URL`, `EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME`.
Frontend (`frontend/.env`): `REACT_APP_BACKEND_URL`.

Secrets live only in `.env` and are never exposed in frontend code.

## Database
MongoDB. Collections seeded on startup (idempotent): `organizations`, `users`,
`regulatory_sources`, `regulatory_requirements`, `controls`, `control_tests`,
`control_test_runs`, `payment_transactions`, `exceptions`, `remediation_actions`,
`evidence`, `evidence_packages`, `evidence_package_items`, `stellar_attestations`,
plus auth collections (`login_attempts`, `password_reset_tokens`, `password_reset_requests`).

Demo credentials are in `/app/memory/test_credentials.md`.

## Known limitations
- Control engine is not yet executing; run counts are seeded demonstration values.
- Stellar attestation is a testnet prototype record; no live broadcast.
- Contact form acknowledges locally and does not send email.
- Audit logs are modelled as append-only but not yet surfaced in the UI.

## Future phases
1. Deterministic control engine + 10,000-transaction synthetic dataset
2. Live Stellar testnet attestation + independent verification tooling
3. Evidence package export, audit-log UI, and AI-assisted (non-authoritative) suggestions
