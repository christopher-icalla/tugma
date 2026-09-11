# TUGMA — Product Requirements Document

## Implemented (2026-09-11 — Phase 2: Control Engine + Dataset)
- ✅ Deterministic dataset (`dataset.py`, seed=42): exactly 10,000 transactions, ~150 merchants, PHP, with injected traceable defects — 60 settlement discrepancies, 7 payout breaches, 15 duplicates, 25 missing approvals, 5 segregation-of-duty, 10 missing evidence, plus 150 unsettled (NOT_TESTABLE). Hero TX-847291 = ₱10,000 settlement vs ₱9,500 actual (₱500 variance).
- ✅ Deterministic control engine (`engine.py`): runs CTRL-001..005 producing genuine PASS/FAIL/WARNING/NOT_TESTABLE from real field comparisons; appends control_test_runs (never overwrites); auto-creates exceptions with structured explainability + remediation actions (idempotent by exception_code, preserves workflow status); writes per-transaction result flags for fast filtering; derives a real evidence package + conceptual NOT_SUBMITTED Stellar attestation.
- ✅ Results: 122 exceptions (CTRL-005=82, CTRL-002=30, CTRL-004=10 warnings); CTRL-003 NOT_TESTABLE; CTRL-001 vendor check with 1 warning. High-risk=72.
- ✅ Dashboard fully DB-backed (no hard-coded metrics). Transactions page with server-side pagination/search/filter/sort over 10k. Transaction detail with money-flow + control results + linked exceptions. Exception detail with "WHY TUGMA FLAGGED THIS" explainability generated from the real test result + 5-state workflow. Control detail with regulatory mapping (source→requirement→interpretation→automated test), latest + historical runs, and related exceptions. POST /api/controls/run for new historical runs.
- ✅ Tested: backend 26/26 pytest, frontend 100%. Hero acceptance path verified: TX-847291 → CTRL-005 → ₱500 → FAILED → exception → Dashboard/Exceptions → explainability.

## Backlog (prioritized)
### P0 (Phase 3)
- Live Stellar Testnet attestation (currently NOT_SUBMITTED / conceptual SHA-256 only) + independent verification tooling.
- Full evidence package workflow: capture/attach evidence records to exceptions & controls, finalize packages.
### P1
- Exception workflow actions (advance status, assign owner, record remediation) with audit-log writes + audit-log UI (append-only viewer).
- Tighten multi-tenant scoping and CORS for production; throttle POST /api/controls/run.
- Paginate related-exceptions on control detail for scale.
### P2
- AI-assisted (non-authoritative) summarization, mapping suggestions, exception explanations.
- Real contact/lead capture + notifications.

## Next Tasks
1. Evidence capture + package finalization workflow (P0).
2. Live Stellar Testnet attestation + verification (P0).
3. Exception workflow actions + audit-log UI (P1).

## Implemented (2026-09-11 — Phase 3: Evidence + Remediation + Evidence Package)
- ✅ Exception workflow OPEN→IN_REVIEW→REMEDIATION→RESOLVED→VERIFIED (RESOLVED & VERIFIED distinct). Endpoints: assign, transition, remediation, comment. Gating: RESOLVED requires ≥1 attached evidence + a completed remediation action; VERIFIED requires the `exception:verify` permission AND an independent verifier (resolver ≠ verifier, SoD).
- ✅ Evidence Center: create evidence associated with requirement/control/test/exception/transaction/remediation; each record carries a real SHA-256 content hash; dynamic evidence completeness (`/api/evidence/completeness`). No fabricated evidence.
- ✅ Evidence chain per exception (`/api/exceptions/{code}/chain`): REGULATION→REQUIREMENT→CONTROL→TEST→TRANSACTION→EXCEPTION→REMEDIATION→EVIDENCE, each step linking to its record.
- ✅ Evidence Package generation for a reporting period (`/api/evidence-packages/generate`): gathers sources/requirements/controls/runs/transactions/exceptions/remediations/evidence, computes counts + completeness, canonicalizes deterministically and stores a real SHA-256 (same package ⇒ same hash, verified). Stellar shown as `NOT_SUBMITTED` — "Stellar Testnet Attestation — Coming in next phase" (no keys, no broadcast).
- ✅ RBAC (single-org, Layer-1 roles + SoD): operational writes = ADMIN/PAYMENT_OPS/COMPLIANCE/RISK/FINANCE; verify = ADMIN/COMPLIANCE/RISK; package generate = ADMIN/COMPLIANCE; audit read = ADMIN/COMPLIANCE/AUDITOR. AUDITOR & VIEWER read-only; verified server-side (UI mirrors for gating only).
- ✅ Append-only audit_logs for assign/transition/remediation/evidence upload/verification/package generation (no update/delete route). Per-exception audit history + Settings audit-trail view.
- ✅ Dashboard Evidence Readiness (evidence-based) + Open Remediation computed from real records.
- ✅ Tested: Phase 3 backend 15 tests + Phase 2 regression 26/26, frontend 100%. Hero flow verified: TX-847291 → assign → REMEDIATION → (resolve blocked w/o evidence) → evidence + remediation → RESOLVED → (same-user verify blocked, SoD) → COMPLIANCE VERIFIED → generate package → deterministic SHA-256. (TX-847291 reset to OPEN for a repeatable live demo.)

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
