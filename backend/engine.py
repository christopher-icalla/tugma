"""Deterministic TUGMA control engine.

Runs the five existing controls against the synthetic dataset and control
evidence, producing genuine PASS / FAIL / WARNING / NOT_TESTABLE results.
Persists append-only control_test_runs, upserts exceptions (preserving any
workflow status already set), writes per-transaction result flags for fast
filtering, and derives a real evidence-package + conceptual attestation.
"""
import uuid
import hashlib
from datetime import datetime, timezone, timedelta

from pymongo import UpdateOne
from db import db, DEMO_ORG_ID

TOLERANCE = 0.01  # PHP — CTRL-005 configured tolerance

SEVERITY_OF = {
    "settlement_discrepancy": "HIGH",
    "payout_threshold_breach": "HIGH",
    "duplicate_transaction": "MEDIUM",
    "missing_approval": "MEDIUM",
    "segregation_of_duty": "HIGH",
    "missing_evidence": "MEDIUM",
}

# 5-state workflow spread (deterministic, index-based). TX-847291 is forced OPEN.
WORKFLOW_CYCLE = ["OPEN", "OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "VERIFIED", "OPEN"]


def _sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def _now():
    return datetime.now(timezone.utc)


async def _role_owners():
    users = await db.users.find({"organization_id": DEMO_ORG_ID}, {"_id": 0}).to_list(100)
    by_role = {}
    for u in users:
        by_role.setdefault(u["role"], u)
    return by_role


def _explanation(check, expected, actual, variance, result, narrative):
    return {"check": check, "expected": expected, "actual": actual,
            "variance": variance, "tolerance": f"{TOLERANCE:.2f} PHP" if variance is not None else "n/a",
            "result": result, "narrative": narrative}


async def run_all_controls(triggered_by="system"):
    started = _now()
    owners = await _role_owners()
    txns = await db.payment_transactions.find({"organization_id": DEMO_ORG_ID}, {"_id": 0}).to_list(None)

    # Genuine duplicate detection: group by idempotency_key, flag all but earliest.
    groups = {}
    for t in txns:
        groups.setdefault(t["idempotency_key"], []).append(t)
    duplicate_ids = set()
    for _, grp in groups.items():
        if len(grp) > 1:
            grp_sorted = sorted(grp, key=lambda x: x["transaction_timestamp"])
            for dup in grp_sorted[1:]:
                duplicate_ids.add(dup["transaction_id"])

    findings = []            # (control_code, txn, defect_type, explanation)
    counts = {}              # control_code -> counters
    tx_flags = {}            # transaction_id -> {failed_controls, defect_types, severity}

    def bump(code, key):
        c = counts.setdefault(code, {"records_tested": 0, "passed_count": 0,
                                     "failed_count": 0, "warning_count": 0, "not_testable_count": 0})
        c[key] += 1

    def flag(txn, code, defect):
        f = tx_flags.setdefault(txn["transaction_id"], {"failed_controls": [], "defect_types": [], "severity": "NORMAL"})
        f["failed_controls"].append(code)
        f["defect_types"].append(defect)
        sev = SEVERITY_OF.get(defect, "MEDIUM")
        if sev == "HIGH" or f["severity"] == "HIGH":
            f["severity"] = "HIGH"
        elif sev == "MEDIUM":
            f["severity"] = "MEDIUM"

    # ---- CTRL-005 Settlement Reconciliation (per transaction) ------------
    for t in txns:
        bump("CTRL-005", "records_tested")
        if t["payment_status"] != "SETTLED" or t["actual_settlement"] is None:
            bump("CTRL-005", "not_testable_count")
            continue
        settle_var = round(t["expected_settlement"] - t["actual_settlement"], 2)
        payout_var = round(t["expected_payout"] - t["actual_payout"], 2)
        if abs(settle_var) > TOLERANCE:
            bump("CTRL-005", "failed_count")
            flag(t, "CTRL-005", "settlement_discrepancy")
            findings.append(("CTRL-005", t, "settlement_discrepancy", _explanation(
                "Settlement variance", f"PHP {t['expected_settlement']:,.2f}",
                f"PHP {t['actual_settlement']:,.2f}", f"PHP {settle_var:,.2f}", "FAILED",
                "Actual settlement differs from processor amount beyond the configured tolerance.")))
        elif abs(payout_var) > TOLERANCE:
            bump("CTRL-005", "failed_count")
            flag(t, "CTRL-005", "payout_threshold_breach")
            findings.append(("CTRL-005", t, "payout_threshold_breach", _explanation(
                "Payout variance", f"PHP {t['expected_payout']:,.2f}",
                f"PHP {t['actual_payout']:,.2f}", f"PHP {payout_var:,.2f}", "FAILED",
                "Actual merchant payout differs from expected payout beyond the configured tolerance.")))
        elif t["transaction_id"] in duplicate_ids:
            bump("CTRL-005", "failed_count")
            flag(t, "CTRL-005", "duplicate_transaction")
            findings.append(("CTRL-005", t, "duplicate_transaction", _explanation(
                "Duplicate transaction", "Unique idempotency key",
                f"Duplicate of {t.get('duplicate_of')}", None, "FAILED",
                "A second transaction shares an idempotency key with an earlier settled transaction.")))
        else:
            bump("CTRL-005", "passed_count")

    # ---- CTRL-002 IT Risk Control Evidence (authorization / SoD) ---------
    for t in txns:
        bump("CTRL-002", "records_tested")
        if t["approval_status"] == "MISSING":
            bump("CTRL-002", "failed_count")
            flag(t, "CTRL-002", "missing_approval")
            findings.append(("CTRL-002", t, "missing_approval", _explanation(
                "Authorization evidence", "Approval recorded", "No approval on file",
                None, "FAILED", "Transaction was processed without a recorded authorization.")))
        elif t["initiated_by"] == t["approved_by"]:
            bump("CTRL-002", "failed_count")
            flag(t, "CTRL-002", "segregation_of_duty")
            findings.append(("CTRL-002", t, "segregation_of_duty", _explanation(
                "Segregation of duties", "Initiator \u2260 approver",
                f"{t['initiated_by']} initiated and approved", None, "FAILED",
                "The same operator both initiated and approved the transaction.")))
        else:
            bump("CTRL-002", "passed_count")

    # ---- CTRL-004 Merchant / End-User Protection (evidence completeness) -
    for t in txns:
        bump("CTRL-004", "records_tested")
        if not t["has_evidence"]:
            bump("CTRL-004", "warning_count")
            flag(t, "CTRL-004", "missing_evidence")
            findings.append(("CTRL-004", t, "missing_evidence", _explanation(
                "Supporting evidence", "Evidence record attached", "No evidence record",
                None, "WARNING", "Required supporting evidence for this transaction is missing.")))
        else:
            bump("CTRL-004", "passed_count")

    # ---- CTRL-001 Critical Third-Party Oversight (vendor evidence) -------
    vendors = await db.vendors.find({"organization_id": DEMO_ORG_ID}, {"_id": 0}).to_list(100)
    for v in vendors:
        bump("CTRL-001", "records_tested")
        if v.get("due_diligence_status") == "CURRENT":
            bump("CTRL-001", "passed_count")
        else:
            bump("CTRL-001", "warning_count")

    # ---- CTRL-003 AML/CTPF Control Evidence (program evidence absent) ----
    bump("CTRL-003", "records_tested")
    bump("CTRL-003", "not_testable_count")  # AML program evidence not present in this dataset

    completed = _now()

    # ---- persist append-only control_test_runs ---------------------------
    controls = await db.controls.find({"organization_id": DEMO_ORG_ID}, {"_id": 0}).to_list(100)
    code_to_control = {c["control_code"]: c for c in controls}
    run_ids = {}
    for code, c in counts.items():
        run_id = f"run-{uuid.uuid4().hex[:12]}"
        run_ids[code] = run_id
        ctl = code_to_control.get(code, {})
        await db.control_test_runs.insert_one({
            "id": run_id,
            "organization_id": DEMO_ORG_ID,
            "control_id": ctl.get("id"),
            "control_code": code,
            "control_test_id": f"tst-{code.lower()}",
            "started_at": started.isoformat(),
            "completed_at": completed.isoformat(),
            "records_tested": c["records_tested"],
            "passed_count": c["passed_count"],
            "failed_count": c["failed_count"],
            "warning_count": c["warning_count"],
            "not_testable_count": c["not_testable_count"],
            "status": "COMPLETED",
            "triggered_by": triggered_by,
            "execution_metadata": {"engine": "deterministic", "seed": 42, "tolerance": TOLERANCE},
        })

    # ---- upsert exceptions (preserve existing workflow status) -----------
    for i, (code, t, defect, expl) in enumerate(findings):
        ctl = code_to_control.get(code, {})
        exc_code = f"EXC-{code}-{t['transaction_id']}"
        severity = SEVERITY_OF.get(defect, "MEDIUM")
        owner = owners.get(ctl.get("owner_role"))
        default_status = "OPEN" if t["transaction_id"] == "TX-847291" else WORKFLOW_CYCLE[i % len(WORKFLOW_CYCLE)]
        now = completed
        existing = await db.exceptions.find_one({"exception_code": exc_code})
        set_fields = {
            "control_id": ctl.get("id"),
            "control_code": code,
            "control_test_run_id": run_ids.get(code),
            "transaction_id": t["transaction_id"],
            "defect_type": defect,
            "title": f"{expl['check']} — {t['transaction_id']}",
            "description": expl["narrative"],
            "explanation": expl,
            "severity": severity,
            "updated_at": now.isoformat(),
        }
        insert_fields = {
            "id": f"exc-{uuid.uuid4().hex[:12]}",
            "organization_id": DEMO_ORG_ID,
            "exception_code": exc_code,
            "status": default_status,
            "detected_at": started.isoformat(),
            "due_date": (started + timedelta(days=5)).isoformat(),
            "owner_role": ctl.get("owner_role"),
            "owner_id": owner.get("id") if owner else None,
            "owner_name": owner.get("name") if owner else None,
            "evidence_id": None,
            "root_cause": None,
            "resolved_at": None,
            "verified_at": None,
        }
        await db.exceptions.update_one(
            {"exception_code": exc_code},
            {"$set": set_fields, "$setOnInsert": insert_fields},
            upsert=True)
        # keep resolved/verified timestamps coherent for freshly-seeded states
        if not existing and default_status in ("RESOLVED", "VERIFIED"):
            await db.exceptions.update_one({"exception_code": exc_code}, {"$set": {
                "resolved_at": (started + timedelta(days=1)).isoformat(),
                "verified_at": (started + timedelta(days=2)).isoformat() if default_status == "VERIFIED" else None,
            }})
        if not existing:
            await db.remediation_actions.update_one(
                {"exception_code": exc_code},
                {"$setOnInsert": {
                    "id": f"rem-{uuid.uuid4().hex[:12]}", "exception_code": exc_code,
                    "action": f"Investigate and remediate: {expl['check'].lower()}",
                    "owner_role": ctl.get("owner_role"),
                    "due_date": (started + timedelta(days=5)).isoformat(),
                    "status": "PENDING", "completion_note": None, "completed_at": None,
                    "verified_by": None, "verified_at": None}},
                upsert=True)

    # ---- write per-transaction result flags (bulk, for fast filtering) ---
    ops = []
    for t in txns:
        f = tx_flags.get(t["transaction_id"])
        if f:
            fc = sorted(set(f["failed_controls"]))
            ops.append(UpdateOne({"transaction_id": t["transaction_id"]}, {"$set": {
                "has_exception": True, "failed_controls": fc,
                "defect_types": sorted(set(f["defect_types"])),
                "test_status": "WARNING" if fc == ["CTRL-004"] else "FAIL",
                "exception_severity": f["severity"]}}))
        else:
            status = "NOT_TESTABLE" if t["payment_status"] != "SETTLED" else "PASS"
            ops.append(UpdateOne({"transaction_id": t["transaction_id"]}, {"$set": {
                "has_exception": False, "failed_controls": [], "defect_types": [],
                "test_status": status, "exception_severity": "NORMAL"}}))
    if ops:
        await db.payment_transactions.bulk_write(ops, ordered=False)

    # ---- derive real evidence package + conceptual attestation -----------
    await _build_package(started)

    total_exc = sum(len([f for f in findings if f[0] == c]) for c in counts)
    return {"runs": {c: counts[c] for c in counts}, "exceptions": len(findings),
            "run_ids": run_ids, "started_at": started.isoformat()}


async def _build_package(started):
    total_tx = await db.payment_transactions.count_documents({"organization_id": DEMO_ORG_ID})
    total_exc = await db.exceptions.count_documents({"organization_id": DEMO_ORG_ID})
    verified = await db.exceptions.count_documents({"organization_id": DEMO_ORG_ID, "status": {"$in": ["RESOLVED", "VERIFIED"]}})
    evidence_count = await db.evidence.count_documents({"organization_id": DEMO_ORG_ID})
    readiness = round(100 * verified / total_exc) if total_exc else 100
    summary = f"tugma|tx={total_tx}|exc={total_exc}|verified={verified}|evidence={evidence_count}"
    canonical = _sha(summary)
    pkg_id = "pkg-2026-q1"
    await db.evidence_packages.update_one({"id": pkg_id}, {"$set": {
        "id": pkg_id, "organization_id": DEMO_ORG_ID,
        "name": "Q1 2026 Control Evidence Package", "period_start": "2026-01-01",
        "period_end": "2026-03-31", "controls_count": 5, "transactions_count": total_tx,
        "exceptions_count": total_exc, "evidence_count": evidence_count,
        "completeness_score": readiness, "canonical_hash": canonical,
        "generated_at": started.isoformat(), "status": "DRAFT"}}, upsert=True)
    await db.stellar_attestations.update_one({"id": "stl-001"}, {"$set": {
        "id": "stl-001", "evidence_package_id": pkg_id, "network": "TESTNET",
        "stellar_account": "Not submitted — conceptual integrity layer (no keys, no broadcast)",
        "transaction_hash": None, "ledger": None, "attestation_hash": canonical,
        "submitted_at": None, "verified_at": None,
        "verification_status": "NOT_SUBMITTED"}}, upsert=True)
