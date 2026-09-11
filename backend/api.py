"""Domain API endpoints for the TUGMA authenticated application.

Every read is scoped to the requesting user's organization_id. No
cross-organization access is possible.
"""
from fastapi import APIRouter, Depends
from db import db
from auth import get_current_user, ROLES

router = APIRouter(prefix="/api", tags=["tugma"])

PROJ = {"_id": 0}


async def _find(collection, org_id, query=None, sort=None, limit=1000):
    q = {"organization_id": org_id}
    if query:
        q.update(query)
    cursor = db[collection].find(q, PROJ)
    if sort:
        cursor = cursor.sort(*sort)
    return await cursor.to_list(limit)


@router.get("/organization")
async def get_organization(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user["organization_id"]}, PROJ)
    users = await db.users.find({"organization_id": user["organization_id"]},
                                {"_id": 0, "password_hash": 0}).to_list(100)
    return {"organization": org, "users": users, "roles": ROLES}


@router.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    org_id = user["organization_id"]
    controls = await _find("controls", org_id)
    runs = await db.control_test_runs.find({}, PROJ).to_list(100)
    exceptions = await _find("exceptions", org_id)
    evidence = await _find("evidence", org_id)
    packages = await _find("evidence_packages", org_id)
    txns_analyzed = sum(r.get("records_tested", 0) for r in runs) or 0
    open_remediation = len([e for e in exceptions if e["status"] != "RESOLVED"])
    high_risk = len([e for e in exceptions if e["severity"] == "HIGH"])
    completeness = packages[0]["completeness_score"] if packages else 0

    control_health = []
    for c in controls:
        run = next((r for r in runs if r["control_test_id"] == f"tst-{c['control_code'].lower()}"), None)
        control_health.append({
            "control_code": c["control_code"], "name": c["name"], "risk_level": c["risk_level"],
            "status": c["status"], "automated": c["automated"],
            "records_tested": run["records_tested"] if run else None,
            "passed_count": run["passed_count"] if run else None,
            "failed_count": run["failed_count"] if run else None,
            "last_run": run["completed_at"] if run else None})

    priority = sorted(
        [e for e in exceptions if e["status"] != "RESOLVED"],
        key=lambda e: (0 if e["severity"] == "HIGH" else 1, e["detected_at"]))

    return {
        "kpis": {
            "transactions_analyzed": txns_analyzed,
            "controls_tested": len([c for c in controls if c["status"] == "ACTIVE"]),
            "exceptions": len(exceptions),
            "high_risk": high_risk,
            "evidence_readiness": completeness,
            "open_remediation": open_remediation,
        },
        "control_health": control_health,
        "priority_exceptions": priority,
        "engine_status": "FOUNDATION_DEMO",
    }


@router.get("/regulatory/sources")
async def regulatory_sources(user: dict = Depends(get_current_user)):
    sources = await db.regulatory_sources.find({}, PROJ).to_list(100)
    requirements = await db.regulatory_requirements.find({}, PROJ).to_list(200)
    controls = await _find("controls", user["organization_id"])
    for s in sources:
        reqs = [r for r in requirements if r["source_id"] == s["id"]]
        for r in reqs:
            r["mapped_controls"] = [
                {"control_code": c["control_code"], "name": c["name"],
                 "interpretation": c.get("interpretation")}
                for c in controls if c.get("requirement_id") == r["id"]]
        s["requirements"] = reqs
    return {"sources": sources}


@router.get("/controls")
async def list_controls(user: dict = Depends(get_current_user)):
    controls = await _find("controls", user["organization_id"], sort=("control_code", 1))
    runs = await db.control_test_runs.find({}, PROJ).to_list(100)
    requirements = await db.regulatory_requirements.find({}, PROJ).to_list(200)
    for c in controls:
        c["run"] = next((r for r in runs if r["control_test_id"] == f"tst-{c['control_code'].lower()}"), None)
        req = next((r for r in requirements if r["id"] == c.get("requirement_id")), None)
        c["requirement"] = req
    return {"controls": controls}


@router.get("/transactions")
async def list_transactions(user: dict = Depends(get_current_user)):
    txns = await _find("payment_transactions", user["organization_id"],
                       sort=("transaction_timestamp", -1))
    return {"transactions": txns, "total": len(txns)}


@router.get("/exceptions")
async def list_exceptions(user: dict = Depends(get_current_user)):
    exceptions = await _find("exceptions", user["organization_id"], sort=("detected_at", -1))
    remediations = await db.remediation_actions.find({}, PROJ).to_list(200)
    for e in exceptions:
        e["remediation_actions"] = [r for r in remediations if r["exception_id"] == e["id"]]
    return {"exceptions": exceptions}


@router.get("/evidence")
async def list_evidence(user: dict = Depends(get_current_user)):
    evidence = await _find("evidence", user["organization_id"], sort=("captured_at", -1))
    packages = await _find("evidence_packages", user["organization_id"])
    return {"evidence": evidence, "packages": packages}


@router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    packages = await _find("evidence_packages", user["organization_id"])
    attestations = await db.stellar_attestations.find({}, PROJ).to_list(100)
    for p in packages:
        p["stellar"] = next((a for a in attestations if a["evidence_package_id"] == p["id"]), None)
    return {"packages": packages}


@router.get("/stellar/attestations")
async def stellar_attestations(user: dict = Depends(get_current_user)):
    packages = await _find("evidence_packages", user["organization_id"])
    pkg_ids = {p["id"] for p in packages}
    attestations = await db.stellar_attestations.find({}, PROJ).to_list(100)
    return {"attestations": [a for a in attestations if a["evidence_package_id"] in pkg_ids]}
