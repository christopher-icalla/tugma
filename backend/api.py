"""Domain API for the TUGMA authenticated application (Phase 2).

All reads/writes are scoped to the requesting user's organization_id.
Dashboard, controls, transactions and exceptions derive entirely from the
control engine's persisted results — no hard-coded metrics.
"""
import re
import json
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from db import db, DEMO_ORG_ID
from auth import get_current_user, require_roles, require_perm, can, ROLES
import engine

router = APIRouter(prefix="/api", tags=["tugma"])
PROJ = {"_id": 0}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


async def _audit(user, action, entity_type, entity_id, before=None, after=None):
    """Append-only audit record. No update/delete route exists for audit_logs."""
    await db.audit_logs.insert_one({
        "id": f"aud-{hashlib.sha1((entity_id + action + _now_iso()).encode()).hexdigest()[:12]}",
        "organization_id": user["organization_id"], "user_id": user["id"],
        "user_name": user.get("name"), "user_role": user.get("role"),
        "action": action, "entity_type": entity_type, "entity_id": entity_id,
        "before_state": before, "after_state": after, "timestamp": _now_iso()})


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
    exc_with_evidence = await db.evidence.distinct("exception_id", {"organization_id": org_id, "exception_id": {"$ne": None}})
    readiness = round(100 * len(exc_with_evidence) / total_exc) if total_exc else 0

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
    evidence = await db.evidence.find({"organization_id": org_id, "exception_id": exc["id"]}, PROJ).to_list(50)
    audit = await db.audit_logs.find({"organization_id": org_id, "entity_id": exc["id"]}, PROJ).sort("timestamp", -1).to_list(100)
    role = user.get("role")
    perms = {
        "can_assign": can(role, "exception:assign"),
        "can_transition": can(role, "exception:transition"),
        "can_remediate": can(role, "exception:remediate"),
        "can_comment": can(role, "exception:comment"),
        "can_add_evidence": can(role, "evidence:create"),
        "can_verify": can(role, "exception:verify"),
    }
    return {"exception": exc, "transaction": tx, "control": control,
            "remediation_actions": remediations, "test_run": run, "evidence": evidence,
            "audit": audit, "permissions": perms}


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


# ============================ Exception workflow ==========================
ALLOWED_NEXT = {
    "OPEN": ["IN_REVIEW"],
    "IN_REVIEW": ["REMEDIATION"],
    "REMEDIATION": ["RESOLVED"],
    "RESOLVED": ["VERIFIED"],
    "VERIFIED": [],
}


class AssignInput(BaseModel):
    owner_id: str
    due_date: str = None


class TransitionInput(BaseModel):
    to_status: str


class RemediationInput(BaseModel):
    action: str = None
    status: str = None
    completion_note: str = None


class CommentInput(BaseModel):
    text: str


async def _get_exc(org_id, code):
    exc = await db.exceptions.find_one({"organization_id": org_id, "exception_code": code}, PROJ)
    if not exc:
        raise HTTPException(status_code=404, detail=f"Exception {code} not found.")
    return exc


@router.post("/exceptions/{code}/assign")
async def assign_exception(code: str, payload: AssignInput, user: dict = Depends(require_perm("exception:assign"))):
    exc = await _get_exc(user["organization_id"], code)
    owner = await db.users.find_one({"id": payload.owner_id, "organization_id": user["organization_id"]}, PROJ)
    if not owner:
        raise HTTPException(status_code=404, detail="Assignee not found in this organization.")
    before = {"owner_id": exc.get("owner_id"), "due_date": exc.get("due_date")}
    after = {"owner_id": owner["id"], "owner_name": owner["name"], "owner_role": owner["role"],
             "due_date": payload.due_date or exc.get("due_date"), "assigned_at": _now_iso()}
    await db.exceptions.update_one({"exception_code": code}, {"$set": {**after, "updated_at": _now_iso()}})
    await _audit(user, "exception:assign", "exception", exc["id"], before, after)
    return {"message": f"Assigned to {owner['name']}.", **after}


@router.post("/exceptions/{code}/transition")
async def transition_exception(code: str, payload: TransitionInput, user: dict = Depends(get_current_user)):
    exc = await _get_exc(user["organization_id"], code)
    to = payload.to_status.upper()
    current = exc["status"]
    if to not in ALLOWED_NEXT.get(current, []):
        raise HTTPException(status_code=400, detail=f"Illegal transition {current} → {to}.")

    # verification is a separate, gated permission
    if to == "VERIFIED":
        if not can(user["role"], "exception:verify"):
            raise HTTPException(status_code=403, detail=f"Your role ({user['role']}) cannot verify exceptions.")
        if exc.get("resolved_by") and exc["resolved_by"] == user["id"]:
            raise HTTPException(status_code=403, detail="Independent verification required: the verifier must differ from the user who resolved the exception (segregation of duties).")
    elif not can(user["role"], "exception:transition"):
        raise HTTPException(status_code=403, detail=f"Your role ({user['role']}) cannot change exception status.")

    # RESOLVED requires evidence + a completed remediation action
    if to == "RESOLVED":
        ev = await db.evidence.count_documents({"organization_id": user["organization_id"], "exception_id": exc["id"]})
        rem_done = await db.remediation_actions.count_documents({"exception_code": code, "status": "COMPLETED"})
        if ev == 0:
            raise HTTPException(status_code=400, detail="Cannot resolve: at least one resolution evidence record must be attached first.")
        if rem_done == 0:
            raise HTTPException(status_code=400, detail="Cannot resolve: a remediation action must be marked complete first.")

    updates = {"status": to, "updated_at": _now_iso()}
    if to == "RESOLVED":
        updates["resolved_by"] = user["id"]
        updates["resolved_at"] = _now_iso()
    if to == "VERIFIED":
        updates["verified_by"] = user["id"]
        updates["verified_by_name"] = user["name"]
        updates["verified_at"] = _now_iso()
        updates["verification_status"] = "VERIFIED"
    await db.exceptions.update_one({"exception_code": code}, {"$set": updates})
    await _audit(user, "exception:transition", "exception", exc["id"], {"status": current}, {"status": to})
    return {"message": f"Status changed to {to}.", "status": to}


@router.post("/exceptions/{code}/remediation")
async def update_remediation(code: str, payload: RemediationInput, user: dict = Depends(require_perm("exception:remediate"))):
    exc = await _get_exc(user["organization_id"], code)
    rem = await db.remediation_actions.find_one({"exception_code": code}, PROJ)
    now = _now_iso()
    if not rem:
        rem_id = f"rem-{hashlib.sha1((code + now).encode()).hexdigest()[:10]}"
        doc = {"id": rem_id, "exception_code": code, "action": payload.action or "Remediation action",
               "owner_role": exc.get("owner_role"), "due_date": exc.get("due_date"),
               "status": payload.status or "IN_PROGRESS", "completion_note": payload.completion_note,
               "completed_at": now if payload.status == "COMPLETED" else None,
               "verified_by": None, "verified_at": None}
        await db.remediation_actions.insert_one(doc)
        after = doc
    else:
        updates = {}
        if payload.action:
            updates["action"] = payload.action
        if payload.status:
            updates["status"] = payload.status
            if payload.status == "COMPLETED":
                updates["completed_at"] = now
        if payload.completion_note is not None:
            updates["completion_note"] = payload.completion_note
        await db.remediation_actions.update_one({"exception_code": code}, {"$set": updates})
        after = updates
    await _audit(user, "exception:remediation", "exception", exc["id"], None, after)
    return {"message": "Remediation updated.", "remediation": after}


@router.post("/exceptions/{code}/comment")
async def comment_exception(code: str, payload: CommentInput, user: dict = Depends(require_perm("exception:comment"))):
    exc = await _get_exc(user["organization_id"], code)
    comment = {"author": user["name"], "role": user["role"], "text": payload.text, "at": _now_iso()}
    await db.exceptions.update_one({"exception_code": code}, {"$push": {"comments": comment}})
    await _audit(user, "exception:comment", "exception", exc["id"], None, {"text": payload.text})
    return {"message": "Comment added.", "comment": comment}


@router.get("/exceptions/{code}/chain")
async def evidence_chain(code: str, user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    exc = await _get_exc(org_id, code)
    control = await db.controls.find_one({"id": exc.get("control_id")}, PROJ)
    requirement = await db.regulatory_requirements.find_one({"id": control.get("requirement_id")}, PROJ) if control else None
    source = await db.regulatory_sources.find_one({"id": requirement["source_id"]}, PROJ) if requirement else None
    test = await db.control_tests.find_one({"control_id": control["id"]}, PROJ) if control else None
    run = await db.control_test_runs.find_one({"id": exc.get("control_test_run_id")}, PROJ)
    tx = await db.payment_transactions.find_one({"organization_id": org_id, "transaction_id": exc.get("transaction_id")}, PROJ) if exc.get("transaction_id") else None
    remediations = await db.remediation_actions.find({"exception_code": code}, PROJ).to_list(50)
    evidence = await db.evidence.find({"organization_id": org_id, "exception_id": exc["id"]}, PROJ).to_list(50)
    chain = [
        {"step": "REGULATION", "label": source["regulator"] + " · " + source["title"] if source else None, "route": "/app/regulatory-intelligence"},
        {"step": "REQUIREMENT", "label": (requirement["requirement_code"] + " — " + requirement["title"]) if requirement else None, "route": "/app/regulatory-intelligence"},
        {"step": "CONTROL", "label": (control["control_code"] + " — " + control["name"]) if control else None, "route": "/app/controls"},
        {"step": "TEST", "label": test["name"] if test else None, "route": "/app/controls"},
        {"step": "TRANSACTION", "label": tx["transaction_id"] if tx else "n/a", "route": f"/app/transactions/{tx['transaction_id']}" if tx else None},
        {"step": "EXCEPTION", "label": exc["exception_code"], "route": f"/app/exceptions/{exc['exception_code']}"},
        {"step": "REMEDIATION", "label": (remediations[0]["status"] if remediations else "None"), "route": None},
        {"step": "EVIDENCE", "label": f"{len(evidence)} record(s)", "route": "/app/evidence"},
    ]
    return {"chain": chain}


# ============================ Evidence Center =============================
class EvidenceInput(BaseModel):
    name: str
    evidence_type: str
    description: str = None
    source_system: str = None
    content: str = None
    requirement_id: str = None
    control_id: str = None
    control_test_id: str = None
    exception_id: str = None
    transaction_id: str = None
    remediation_id: str = None


@router.post("/evidence")
async def create_evidence(payload: EvidenceInput, user: dict = Depends(require_perm("evidence:create"))):
    now = _now_iso()
    canonical = json.dumps({"name": payload.name, "type": payload.evidence_type,
                            "content": payload.content or "", "source": payload.source_system or ""}, sort_keys=True)
    content_hash = _sha(canonical)
    doc = {"id": f"evd-{hashlib.sha1((payload.name + now).encode()).hexdigest()[:10]}",
           "organization_id": user["organization_id"], "evidence_type": payload.evidence_type,
           "name": payload.name, "description": payload.description, "source_system": payload.source_system,
           "content": payload.content, "file_reference": None,
           "requirement_id": payload.requirement_id, "control_id": payload.control_id,
           "control_test_id": payload.control_test_id, "exception_id": payload.exception_id,
           "transaction_id": payload.transaction_id, "remediation_id": payload.remediation_id,
           "captured_at": now, "captured_by": user["name"], "content_hash": content_hash,
           "valid_from": now, "valid_until": None, "verification_status": "CAPTURED", "created_at": now}
    await db.evidence.insert_one(doc)
    await _audit(user, "evidence:upload", "evidence", doc["id"], None, {"name": payload.name, "hash": content_hash})
    doc.pop("_id", None)
    return {"message": "Evidence recorded.", "evidence": doc}


@router.get("/evidence/completeness")
async def evidence_completeness(user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    total_exc = await db.exceptions.count_documents({"organization_id": org_id})
    with_ev = await db.evidence.distinct("exception_id", {"organization_id": org_id, "exception_id": {"$ne": None}})
    by_control = {c["_id"]: c["count"] async for c in db.evidence.aggregate([
        {"$match": {"organization_id": org_id, "control_id": {"$ne": None}}},
        {"$group": {"_id": "$control_id", "count": {"$sum": 1}}}])}
    return {"total_exceptions": total_exc, "exceptions_with_evidence": len(with_ev),
            "completeness": round(100 * len(with_ev) / total_exc) if total_exc else 0,
            "by_control": by_control}


# ========================== Evidence Package ==============================
class PackageInput(BaseModel):
    name: str = None
    period_start: str
    period_end: str


@router.post("/evidence-packages/generate")
async def generate_package(payload: PackageInput, user: dict = Depends(require_perm("package:generate"))):
    org_id = user["organization_id"]
    ps, pe = payload.period_start, payload.period_end

    def in_period(iso_ts):
        return iso_ts and ps <= iso_ts[:10] <= pe

    sources = await db.regulatory_sources.find({}, PROJ).to_list(50)
    requirements = await db.regulatory_requirements.find({}, PROJ).to_list(200)
    controls = await db.controls.find({"organization_id": org_id}, PROJ).to_list(50)
    latest, _ = await _latest_runs(org_id)
    # Period membership follows the underlying payment activity date, not detection time.
    period_tx = await db.payment_transactions.find(
        {"organization_id": org_id, "transaction_timestamp": {"$gte": ps, "$lte": pe + "T23:59:59"}},
        {"_id": 0, "transaction_id": 1}).to_list(20000)
    period_tx_ids = {t["transaction_id"] for t in period_tx}
    all_exc = await db.exceptions.find({"organization_id": org_id}, PROJ).to_list(2000)
    exceptions = [e for e in all_exc if (e.get("transaction_id") in period_tx_ids)
                  or (not e.get("transaction_id") and in_period(e.get("detected_at")))]
    exc_ids = {e["id"] for e in exceptions}
    tx_ids = sorted({e["transaction_id"] for e in exceptions if e.get("transaction_id")})
    remediations = await db.remediation_actions.find({"exception_code": {"$in": [e["exception_code"] for e in exceptions]}}, PROJ).to_list(2000)
    evidence = [ev for ev in await db.evidence.find({"organization_id": org_id}, PROJ).to_list(2000)
                if ev.get("exception_id") in exc_ids or in_period(ev.get("created_at"))]
    exc_with_ev = {ev["exception_id"] for ev in evidence if ev.get("exception_id") in exc_ids}
    completeness = round(100 * len(exc_with_ev) / len(exceptions)) if exceptions else 0

    manifest = {
        "period": [ps, pe],
        "regulatory_sources": sorted(s["id"] for s in sources),
        "requirements": sorted(r["id"] for r in requirements),
        "controls": sorted(c["control_code"] for c in controls),
        "test_runs": sorted(r["id"] for r in latest.values()),
        "transactions": tx_ids,
        "exceptions": sorted(e["exception_code"] for e in exceptions),
        "remediations": sorted(r["id"] for r in remediations),
        "evidence": sorted(f"{ev['id']}:{ev.get('content_hash')}" for ev in evidence),
        "counts": {"controls": len(controls), "transactions": len(tx_ids),
                   "exceptions": len(exceptions), "evidence": len(evidence), "completeness": completeness},
    }
    canonical_str = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    canonical_hash = _sha(canonical_str)

    pkg_id = f"pkg-{ps}-{pe}"
    pkg = {"id": pkg_id, "organization_id": org_id,
           "name": payload.name or f"Evidence Package {ps} → {pe}",
           "period_start": ps, "period_end": pe,
           "controls_count": len(controls), "transactions_count": len(tx_ids),
           "exceptions_count": len(exceptions), "evidence_count": len(evidence),
           "completeness_score": completeness, "canonical_hash": canonical_hash,
           "manifest": manifest, "generated_at": _now_iso(), "generated_by": user["name"], "status": "FINALIZED"}
    await db.evidence_packages.update_one({"id": pkg_id}, {"$set": pkg}, upsert=True)
    await db.stellar_attestations.update_one({"evidence_package_id": pkg_id}, {"$set": {
        "id": f"stl-{pkg_id}", "evidence_package_id": pkg_id, "network": "TESTNET",
        "attestation_hash": canonical_hash, "stellar_account": None, "transaction_hash": None,
        "ledger": None, "submitted_at": None, "verified_at": None,
        "verification_status": "NOT_SUBMITTED",
        "note": "Stellar Testnet Attestation — Coming in next phase"}}, upsert=True)
    await _audit(user, "package:generate", "evidence_package", pkg_id, None,
                 {"canonical_hash": canonical_hash, "counts": manifest["counts"]})
    pkg.pop("_id", None)
    return {"message": "Evidence package generated.", "package": pkg}


@router.get("/evidence-packages")
async def list_packages(user: dict = Depends(get_current_user)):
    packages = await db.evidence_packages.find({"organization_id": user["organization_id"]}, PROJ).sort("generated_at", -1).to_list(50)
    attestations = await db.stellar_attestations.find({}, PROJ).to_list(50)
    for p in packages:
        p["stellar"] = next((a for a in attestations if a["evidence_package_id"] == p["id"]), None)
    return {"packages": packages}


@router.get("/evidence-packages/{pkg_id}")
async def package_detail(pkg_id: str, user: dict = Depends(get_current_user)):
    pkg = await db.evidence_packages.find_one({"organization_id": user["organization_id"], "id": pkg_id}, PROJ)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found.")
    att = await db.stellar_attestations.find_one({"evidence_package_id": pkg_id}, PROJ)
    pkg["stellar"] = att
    return {"package": pkg}


# ============================== Audit Trail ===============================
@router.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_perm("audit:read")),
                     entity_id: str = Query(None), limit: int = Query(100, ge=1, le=500)):
    q = {"organization_id": user["organization_id"]}
    if entity_id:
        q["entity_id"] = entity_id
    logs = await db.audit_logs.find(q, PROJ).sort("timestamp", -1).to_list(limit)
    return {"audit_logs": logs}
