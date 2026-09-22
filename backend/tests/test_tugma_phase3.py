"""TUGMA Phase 3 backend tests: exception workflow, evidence, package + RBAC.

This suite runs the hero flow end-to-end on EXC-CTRL-005-TX-847291. It is
designed to be idempotent: if the exception has already been advanced past
OPEN by a previous run (e.g. UI test), the hero flow tests are skipped, but
gating/RBAC/package/audit tests still execute.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EXC = "EXC-CTRL-005-TX-847291"

ADMIN = (
    os.environ["ADMIN_EMAIL"],
    os.environ["ADMIN_PASSWORD"],
)

DEMO_PASSWORD = os.environ["DEMO_USER_PASSWORD"]

COMPLIANCE = ("compliance@tugmademo.ph", DEMO_PASSWORD)
OPS = ("ops@tugmademo.ph", DEMO_PASSWORD)
AUDITOR = ("auditor@tugmademo.ph", DEMO_PASSWORD)
VIEWER = ("viewer@tugmademo.ph", DEMO_PASSWORD)


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    s, u = _login(*ADMIN)
    return s, u


@pytest.fixture(scope="module")
def compliance():
    s, u = _login(*COMPLIANCE)
    return s, u


@pytest.fixture(scope="module")
def ops():
    s, u = _login(*OPS)
    return s, u


@pytest.fixture(scope="module")
def auditor():
    s, u = _login(*AUDITOR)
    return s, u


@pytest.fixture(scope="module")
def viewer():
    s, u = _login(*VIEWER)
    return s, u


def _exc_status(sess):
    return sess.get(f"{BASE_URL}/api/exceptions/{EXC}", timeout=30).json()["exception"]["status"]


# ============================ Evidence chain (hero) ==========================
class TestEvidenceChain:
    def test_chain_shape(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/exceptions/{EXC}/chain", timeout=30)
        assert r.status_code == 200
        steps = [c["step"] for c in r.json()["chain"]]
        assert steps == ["REGULATION", "REQUIREMENT", "CONTROL", "TEST",
                         "TRANSACTION", "EXCEPTION", "REMEDIATION", "EVIDENCE"]

    def test_explainability(self, admin):
        s, _ = admin
        exc = s.get(f"{BASE_URL}/api/exceptions/{EXC}", timeout=30).json()["exception"]
        exp = exc["explanation"]
        assert exp["expected"] == "PHP 10,000.00"
        assert exp["actual"] == "PHP 9,500.00"
        assert exp["variance"] == "PHP 500.00"
        assert exp["result"] == "FAILED"


# ============================ RBAC deny (independent) ========================
class TestRBACDeny:
    def test_viewer_comment_forbidden(self, viewer):
        s, _ = viewer
        r = s.post(f"{BASE_URL}/api/exceptions/{EXC}/comment",
                   json={"text": "nope"}, timeout=30)
        assert r.status_code == 403

    def test_viewer_audit_forbidden(self, viewer):
        s, _ = viewer
        assert s.get(f"{BASE_URL}/api/audit-logs", timeout=30).status_code == 403

    def test_viewer_package_forbidden(self, viewer):
        s, _ = viewer
        r = s.post(f"{BASE_URL}/api/evidence-packages/generate",
                   json={"period_start": "2026-01-01", "period_end": "2026-03-31"}, timeout=30)
        assert r.status_code == 403

    def test_auditor_can_read_audit(self, auditor):
        s, _ = auditor
        assert s.get(f"{BASE_URL}/api/audit-logs", timeout=30).status_code == 200

    def test_auditor_operational_forbidden(self, auditor):
        s, _ = auditor
        r = s.post(f"{BASE_URL}/api/exceptions/{EXC}/comment",
                   json={"text": "audit"}, timeout=30)
        assert r.status_code == 403

    def test_perms_flags_shape(self, viewer):
        s, _ = viewer
        d = s.get(f"{BASE_URL}/api/exceptions/{EXC}", timeout=30).json()
        p = d["permissions"]
        assert p["can_assign"] is False
        assert p["can_transition"] is False
        assert p["can_comment"] is False
        assert p["can_verify"] is False


# ============================ Hero flow OPEN -> VERIFIED =====================
class TestHeroFlow:
    def test_hero_full_flow(self, ops, compliance):
        ops_s, ops_u = ops
        cmp_s, _ = compliance

        status = _exc_status(ops_s)
        if status != "OPEN":
            pytest.skip(f"Exception already advanced past OPEN (status={status}); flow re-run skipped.")

        # -- assign to ops user
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/assign",
                       json={"owner_id": ops_u["id"], "due_date": "2026-02-15"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["owner_name"] == ops_u["name"]

        # -- OPEN -> IN_REVIEW
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "IN_REVIEW"}, timeout=30)
        assert r.status_code == 200

        # -- IN_REVIEW -> REMEDIATION
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "REMEDIATION"}, timeout=30)
        assert r.status_code == 200

        # -- gating: RESOLVED without evidence should fail
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "RESOLVED"}, timeout=30)
        assert r.status_code == 400
        assert "evidence" in r.json()["detail"].lower()

        # -- mark remediation complete
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/remediation",
                       json={"status": "COMPLETED", "completion_note": "done"}, timeout=30)
        assert r.status_code == 200

        # still no evidence => still 400
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "RESOLVED"}, timeout=30)
        assert r.status_code == 400

        # -- attach evidence
        exc = ops_s.get(f"{BASE_URL}/api/exceptions/{EXC}", timeout=30).json()["exception"]
        r = ops_s.post(f"{BASE_URL}/api/evidence", json={
            "name": "TEST_ resolution_receipt",
            "evidence_type": "RESOLUTION_RECORD",
            "source_system": "ERP",
            "content": "Adjustment JV-2026-0001 posted PHP 500.00",
            "exception_id": exc["id"], "control_id": exc.get("control_id"),
            "transaction_id": exc.get("transaction_id"),
        }, timeout=30)
        assert r.status_code == 200, r.text
        ev = r.json()["evidence"]
        assert ev["content_hash"] and len(ev["content_hash"]) == 64
        assert ev["exception_id"] == exc["id"]

        # -- REMEDIATION -> RESOLVED (now allowed)
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "RESOLVED"}, timeout=30)
        assert r.status_code == 200

        # -- segregation of duties: same user cannot verify (also lacks verify perm)
        r = ops_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "VERIFIED"}, timeout=30)
        assert r.status_code == 403

        # -- compliance verifies -> VERIFIED
        r = cmp_s.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                       json={"to_status": "VERIFIED"}, timeout=30)
        assert r.status_code == 200, r.text

        final = cmp_s.get(f"{BASE_URL}/api/exceptions/{EXC}", timeout=30).json()["exception"]
        assert final["status"] == "VERIFIED"
        assert final.get("verified_by_name")


# ============================ Evidence completeness =========================
class TestEvidenceCompleteness:
    def test_completeness_non_zero_after_flow(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/evidence/completeness", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total_exceptions"] == 122
        assert d["exceptions_with_evidence"] >= 1
        assert d["completeness"] > 0

    def test_evidence_list_has_hero(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/evidence", timeout=30)
        assert r.status_code == 200
        evs = r.json()["evidence"]
        assert any(ev["name"].startswith("TEST_") for ev in evs)


# ============================ Package generation (deterministic) ============
class TestPackage:
    def test_generate_and_deterministic_hash(self, compliance):
        s, _ = compliance
        payload = {"name": "TEST_ Q1 Package", "period_start": "2026-01-01",
                   "period_end": "2026-03-31"}
        r1 = s.post(f"{BASE_URL}/api/evidence-packages/generate", json=payload, timeout=60)
        assert r1.status_code == 200, r1.text
        p1 = r1.json()["package"]
        assert p1["canonical_hash"] and len(p1["canonical_hash"]) == 64
        assert p1["controls_count"] == 5
        assert p1["exceptions_count"] >= 1
        assert p1["evidence_count"] >= 1
        assert 0 <= p1["completeness_score"] <= 100

        # regenerate same period => same canonical hash
        r2 = s.post(f"{BASE_URL}/api/evidence-packages/generate", json=payload, timeout=60)
        assert r2.status_code == 200
        assert r2.json()["package"]["canonical_hash"] == p1["canonical_hash"]

    def test_stellar_not_submitted(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/evidence-packages", timeout=30)
        pkgs = r.json()["packages"]
        assert pkgs, "at least one package expected"
        for p in pkgs:
            stellar = p.get("stellar")
            if stellar:
                assert stellar["verification_status"] == "NOT_SUBMITTED"
                assert stellar.get("transaction_hash") is None


# ============================ Audit trail (append-only) =====================
class TestAudit:
    def test_audit_records_hero_actions(self, admin):
        s, _ = admin
        r = s.get(f"{BASE_URL}/api/audit-logs?limit=200", timeout=30)
        assert r.status_code == 200
        actions = {a["action"] for a in r.json()["audit_logs"]}
        for expected in ["exception:assign", "exception:transition",
                         "exception:remediation", "evidence:upload", "package:generate"]:
            assert expected in actions, f"missing {expected} in {actions}"


# ============================ Dashboard reflects real records ==============
class TestDashboardDynamic:
    def test_readiness_dynamic(self, admin):
        s, _ = admin
        d = s.get(f"{BASE_URL}/api/dashboard/summary", timeout=30).json()["kpis"]
        # After hero flow the readiness must be > 0 and open_remediation reduced.
        assert d["evidence_readiness"] >= 1
        assert d["open_remediation"] <= 122
