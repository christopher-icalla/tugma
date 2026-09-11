# TUGMA — Product Requirements Document

## Original Problem Statement
Build the first functional foundation of TUGMA, a B2B RegTech product ("Continuous Payment
Control Intelligence") for Philippine regulated payment operators. Tagline: **Compliance You
Can Prove.** Deliver a public marketing website + an authenticated application shell, a
role-based auth foundation, a full database schema, and database-backed foundation pages —
without building the full control engine, the 10,000-transaction dataset, or live Stellar
integration (deferred to later phases).

## Architecture
- **Frontend:** React 19 + React Router 7 + Tailwind (deep institutional slate theme, Plus Jakarta Sans / Inter / JetBrains Mono), Framer Motion, sonner. AuthContext with httpOnly-cookie sessions.
- **Backend:** FastAPI, modular (db / auth / seed / api / server). JWT auth (bcrypt, PyJWT), role-based `require_roles` dependency, password reset via Emergent email.
- **Database:** MongoDB, UUID string primary keys, every org-owned record carries `organization_id`. No cross-org access path.
- **Stellar:** conceptual — SHA-256 canonical hashes computed and stored; no live broadcast (TESTNET attestation record seeded).

## User Personas
CFO, Chief Compliance Officer, Risk Officer, Payment Operations Manager, Internal Audit / Auditor, Viewer.

## Core Requirements (static)
1. Public site: `/`, `/how-it-works`, `/regulatory-intelligence`, `/controls`, `/stellar`, `/security`, `/contact`.
2. Auth app: `/app/{dashboard,regulatory-intelligence,controls,transactions,exceptions,evidence,reports,settings}` with persistent sidebar.
3. Roles: ADMIN, PAYMENT_OPS, COMPLIANCE, RISK, FINANCE, AUDITOR, VIEWER.
4. Synthetic demo org **TUGMA Demo PSP**; no production data; clear demo banner.
5. No government-certification / SOC2 / ISO claims. Regulatory disclaimer present.
6. Three-layer separation: Official Requirement vs TUGMA Interpretation vs TUGMA Operational Control.

## Implemented (2026-09-11 — Phase 1)
- ✅ 7 public marketing pages incl. animated hero flow, code showcase, BSP/AMLC cards, Stellar explainer, disclaimers.
- ✅ JWT auth (login/me/logout/refresh/forgot/reset), brute-force lockout, idempotent seeding of admin `nelson@patika.dev` + 6 role users.
- ✅ Persistent sidebar app shell + demo-environment banner + role display.
- ✅ MongoDB collections for all specified entities, seeded: org, 2 regulatory sources, 5 requirements, 5 controls (+CTRL-005 test run 10000/9873/127), 24 transactions, 3 exceptions + remediations, evidence, 1 evidence package (87% completeness), 1 Stellar TESTNET attestation.
- ✅ Dashboard (6 KPIs, Control Health, Priority Exceptions), Controls (detail + mapping), Regulatory Intelligence (3-layer), Transactions, Exceptions (remediation), Evidence (canonical hash), Reports (Stellar attestation), Settings (org + users + roles).
- ✅ Empty / loading / error / permission-denied states. Status never color-only (glyph + label).
- ✅ Tested: backend 18/18 pytest, frontend 100% of flows.

## Backlog (prioritized)
### P0 (Phase 2)
- Deterministic control engine executing real tests against operational data.
- Full 10,000-transaction synthetic dataset generation.
### P1
- Live Stellar testnet attestation + independent verification tooling.
- Evidence package export (PDF/ZIP) and audit-log UI (append-only viewer).
- Server-side per-org scoping of `control_test_runs` for true multi-tenancy.
- Pagination on transactions/large lists.
### P2
- AI-assisted (non-authoritative) regulatory summarization, mapping suggestions, exception explanations.
- Real contact/lead capture; email notifications.
- Silence `/api/auth/me` 401 console noise on public routes (cosmetic).

## Next Tasks
1. Build control engine + expand transaction dataset (P0).
2. Wire live Stellar testnet attestation (P1).
3. Evidence export + audit-log viewer (P1).
