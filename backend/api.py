"""Domain API for the TUGMA authenticated application (Phase 2).

All reads/writes are scoped to the requesting user's organization_id.
Dashboard, controls, transactions and exceptions derive entirely from the
control engine's persisted results — no hard-coded metrics.
"""
import re
from fastapi import APIRouter, Depends, Query, HTTPException
from db import db, DEMO_ORG_ID
from auth import get_current_user, require_roles, ROLES
import engine

router = APIRouter(prefix="/api", tags=["tugma"])
PROJ = {"_id": 0}


async def _latest_runs(org_id):
    runs = await db.control_test_runs.find({"organization_id": org_id}, PROJ).sort("completed_at", -1).to_list(1000)
    latest = {}
    for r in runs:
        latest.setdefault(r["control_code"], r)  # first seen = newest
    return latest, runs


@router.get("/organization")
async def get_organization(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user["organization_id"]}, PROJ)
    users = await db.users.find({"organization_id": user["organization_id"]}, {"_id": 0, "password_hash": 0}).to_list(100)
    return {"organization": org, "users": users, "roles": ROLES}


@router.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    controls = await db.controls.find({"organization_id": org_id}, PROJ).sort("control_code", 1).to_list(100)
    latest, _ = await _latest_runs(org_id)

    total_tx = await db.payment_transactions.count_documents({"organization_id": org_id})
    total_exc = await db.exceptions.count_documents({"organization_id": org_id})
    high_risk = await db.exceptions.count_documents({"organization_id": org_id, "severity": "HIGH"})
    open_states = ["OPEN", "IN_REVIEW", "REMEDIATION"]
    open_remediation = await db.exceptions.count_documents({"organization_id": org_id, "status": {"$in": open_states}})
    verified = await db.exceptions.count_documents({"organization_id": org_id, "status": {"$in": ["RESOLVED", "VERIFIED"]}})
    readiness = round(100 * verified / total_exc) if total_exc else 100

    control_health = []
    for c in controls:
        r = latest.get(c["control_code"])
        control_health.append({
            "control_code": c["control_code"], "name": c["name"], "risk_level": c["risk_level"],
            "status": c["status"], "automated": c["automated"],
            "records_tested": r["records_tested"] if r else None,
            "passed_count": r["passed_count"] if r else None,
            "failed_count": r["failed_count"] if r else None,
            "warning_count": r["warning_count"] if r else None,
            "not_testable_count": r["not_testable_count"] if r else None,
            "last_run": r["completed_at"] if r else None})

    priority = await db.exceptions.find(
        {"organization_id": org_id, "status": {"$in": open_states}}, PROJ
    ).to_list(1000)
    sev_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    priority.sort(key=lambda e: (sev_rank.get(e["severity"], 3), e["detected_at"]))

    return {
        "kpis": {
            "transactions_analyzed": total_tx,
            "controls_tested": len([c for c in control_health if c["last_run"]]),
            "exceptions": total_exc,
            "high_risk": high_risk,
            "evidence_readiness": readiness,
            "open_remediation": open_remediation,
        },
        "control_health": control_health,
        "priority_exceptions": priority[:8],
        "engine_status": "LIVE",
    }


@router.get("/regulatory/sources")
async def regulatory_sources(user: dict = Depends(get_current_user)):
    sources = await db.regulatory_sources.find({}, PROJ).to_list(100)
    requirements = await db.regulatory_requirements.find({}, PROJ).to_list(200)
    controls = await db.controls.find({"organization_id": user["organization_id"]}, PROJ).to_list(100)
    for s in sources:
        reqs = [r for r in requirements if r["source_id"] == s["id"]]
        for r in reqs:
            r["mapped_controls"] = [
                {"control_code": c["control_code"], "name": c["name"], "interpretation": c.get("interpretation")}
                for c in controls if c.get("requirement_id") == r["id"]]
        s["requirements"] = reqs
    return {"sources": sources}


@router.get("/controls")
async def list_controls(user: dict = Depends(get_current_user)):
    controls = await db.controls.find({"organization_id": user["organization_id"]}, PROJ).sort("control_code", 1).to_list(100)
    latest, _ = await _latest_runs(user["organization_id"])
    for c in controls:
        c["run"] = latest.get(c["control_code"])
    return {"controls": controls}


@router.get("/controls/{code}")
async def control_detail(code: str, user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    control = await db.controls.find_one({"organization_id": org_id, "control_code": code.upper()}, PROJ)
    if not control:
        raise HTTPException(status_code=404, detail=f"Control {code} not found.")
    test = await db.control_tests.find_one({"control_id": control["id"]}, PROJ)
    requirement = await db.regulatory_requirements.find_one({"id": control.get("requirement_id")}, PROJ)
    source = None
    if requirement:
        source = await db.regulatory_sources.find_one({"id": requirement["source_id"]}, PROJ)
    runs = await db.control_test_runs.find({"organization_id": org_id, "control_code": code.upper()}, PROJ).sort("completed_at", -1).to_list(100)
    exceptions = await db.exceptions.find({"organization_id": org_id, "control_code": code.upper()}, PROJ).sort("detected_at", -1).to_list(200)
    return {"control": control, "test": test, "requirement": requirement, "source": source,
            "latest_run": runs[0] if runs else None, "runs": runs,
            "exceptions_count": len(exceptions), "exceptions": exceptions[:50]}


@router.post("/controls/run")
async def run_controls(user: dict = Depends(require_roles("ADMIN", "PAYMENT_OPS", "RISK", "COMPLIANCE"))):
    result = await engine.run_all_controls(triggered_by=user["email"])
    return {"message": "Control run completed.", "result": result["runs"], "exceptions_detected": result["exceptions"]}


@router.get("/transactions")
async def list_transactions(
    user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    search: str = Query(None), payment_status: str = Query(None), risk_status: str = Query(None),
    control: str = Query(None), test_status: str = Query(None), has_exception: str = Query(None),
    sort: str = Query("transaction_timestamp"), direction: str = Query("desc"),
):
    q = {"organization_id": user["organization_id"]}
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        q["$or"] = [{"transaction_id": rx}, {"merchant_id": rx}]
    if payment_status:
        q["payment_status"] = payment_status
    if risk_status:
        q["risk_status"] = risk_status
    if control:
        q["failed_controls"] = control.upper()
    if test_status:
        q["test_status"] = test_status
    if has_exception in ("true", "false"):
        q["has_exception"] = has_exception == "true"

    allowed_sort = {"transaction_timestamp", "transaction_amount", "merchant_id", "transaction_id"}
    sort_field = sort if sort in allowed_sort else "transaction_timestamp"
    sort_dir = -1 if direction == "desc" else 1

    total = await db.payment_transactions.count_documents(q)
    items = await db.payment_transactions.find(q, PROJ).sort(sort_field, sort_dir).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"transactions": items, "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size}


@router.get("/transactions/{transaction_id}")
async def transaction_detail(transaction_id: str, user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    tx = await db.payment_transactions.find_one({"organization_id": org_id, "transaction_id": transaction_id}, PROJ)
    if not tx:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    exceptions = await db.exceptions.find({"organization_id": org_id, "transaction_id": transaction_id}, PROJ).to_list(50)
    # Reconstruct which controls evaluated this transaction and their result.
    control_results = []
    for code in ["CTRL-005", "CTRL-002", "CTRL-004"]:
        failed = code in (tx.get("failed_controls") or [])
        if tx.get("payment_status") != "SETTLED" and code == "CTRL-005":
            res = "NOT_TESTABLE"
        elif failed:
            res = "WARNING" if code == "CTRL-004" else "FAIL"
        else:
            res = "PASS"
        control_results.append({"control_code": code, "result": res})
    return {"transaction": tx, "exceptions": exceptions, "control_results": control_results}


@router.get("/exceptions")
async def list_exceptions(
    user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    search: str = Query(None), control: str = Query(None), severity: str = Query(None),
    status: str = Query(None),
):
    q = {"organization_id": user["organization_id"]}
    if search:
        rx = re.compile(re.escape(search), re.IGNORECASE)
        q["$or"] = [{"exception_code": rx}, {"title": rx}, {"transaction_id": rx}]
    if control:
        q["control_code"] = control.upper()
    if severity:
        q["severity"] = severity
    if status:
        q["status"] = status
    total = await db.exceptions.count_documents(q)
    items = await db.exceptions.find(q, PROJ).sort("detected_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    # facets for the UI
    facets = {
        "by_control": {c["_id"]: c["count"] async for c in db.exceptions.aggregate([
            {"$match": {"organization_id": user["organization_id"]}},
            {"$group": {"_id": "$control_code", "count": {"$sum": 1}}}])},
    }
    return {"exceptions": items, "total": total, "page": page, "page_size": page_size,
            "pages": (total + page_size - 1) // page_size, "facets": facets}


@router.get("/exceptions/{code}")
async def exception_detail(code: str, user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    exc = await db.exceptions.find_one({"organization_id": org_id, "exception_code": code}, PROJ)
    if not exc:
        exc = await db.exceptions.find_one({"organization_id": org_id, "id": code}, PROJ)
    if not exc:
        raise HTTPException(status_code=404, detail=f"Exception {code} not found.")
    tx = None
    if exc.get("transaction_id"):
        tx = await db.payment_transactions.find_one({"organization_id": org_id, "transaction_id": exc["transaction_id"]}, PROJ)
    control = await db.controls.find_one({"id": exc.get("control_id")}, PROJ)
    remediations = await db.remediation_actions.find({"exception_code": exc["exception_code"]}, PROJ).to_list(50)
    run = await db.control_test_runs.find_one({"id": exc.get("control_test_run_id")}, PROJ)
    return {"exception": exc, "transaction": tx, "control": control,
            "remediation_actions": remediations, "test_run": run}


@router.get("/evidence")
async def list_evidence(user: dict = Depends(get_current_user)):
    evidence = await db.evidence.find({"organization_id": user["organization_id"]}, PROJ).to_list(200)
    packages = await db.evidence_packages.find({"organization_id": user["organization_id"]}, PROJ).to_list(50)
    return {"evidence": evidence, "packages": packages}


@router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    packages = await db.evidence_packages.find({"organization_id": user["organization_id"]}, PROJ).to_list(50)
    attestations = await db.stellar_attestations.find({}, PROJ).to_list(50)
    for p in packages:
        p["stellar"] = next((a for a in attestations if a["evidence_package_id"] == p["id"]), None)
    return {"packages": packages}


@router.get("/stellar/attestations")
async def stellar_attestations(user: dict = Depends(get_current_user)):
    packages = await db.evidence_packages.find({"organization_id": user["organization_id"]}, PROJ).to_list(50)
    pkg_ids = {p["id"] for p in packages}
    attestations = await db.stellar_attestations.find({}, PROJ).to_list(50)
    return {"attestations": [a for a in attestations if a["evidence_package_id"] in pkg_ids]}
