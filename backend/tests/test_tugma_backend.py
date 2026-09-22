"""TUGMA Phase 2 backend API test suite: dataset + engine + auth + domain."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
COMPLIANCE_EMAIL = "compliance@tugmademo.ph"
DEMO_PASSWORD = os.environ["DEMO_USER_PASSWORD"]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# -------- auth
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "ADMIN"
        assert "password_hash" not in data
        assert "_id" not in data
        assert "access_token" in r.cookies
        assert "refresh_token" in r.cookies

    def test_login_demo(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": COMPLIANCE_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "COMPLIANCE"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_authed(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_forgot_password_generic(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": "unknown@example.com"}, timeout=30)
        assert r.status_code == 200


# -------- dashboard (Phase 2 KPIs from real dataset+engine)
class TestDashboard:
    def test_kpis(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/dashboard/summary", timeout=30)
        assert r.status_code == 200
        k = r.json()["kpis"]
        assert k["transactions_analyzed"] == 10000
        assert k["controls_tested"] == 5
        assert k["exceptions"] == 122
        assert k["high_risk"] == 72
        assert "evidence_readiness" in k
        assert "open_remediation" in k

    def test_control_health(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/dashboard/summary", timeout=30)
        ch = r.json()["control_health"]
        assert len(ch) == 5
        by = {c["control_code"]: c for c in ch}
        assert by["CTRL-005"]["records_tested"] == 10000
        assert by["CTRL-005"]["failed_count"] == 82
        assert by["CTRL-005"]["not_testable_count"] == 150
        assert by["CTRL-002"]["failed_count"] == 30
        assert by["CTRL-004"]["warning_count"] == 10


# -------- controls
class TestControls:
    def test_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/controls", timeout=30)
        assert r.status_code == 200
        controls = r.json()["controls"]
        assert len(controls) == 5
        codes = {c["control_code"] for c in controls}
        assert codes == {f"CTRL-00{i}" for i in range(1, 6)}

    def test_detail_ctrl_005(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/controls/CTRL-005", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("source"), "expected regulatory source"
        assert d.get("requirement"), "expected requirement mapping"
        assert len(d.get("runs", [])) >= 1
        assert len(d.get("exceptions", [])) >= 1
        latest = d["runs"][0] if d["runs"] else {}
        assert latest.get("records_tested") == 10000
        assert latest.get("failed_count") == 82

    def test_detail_ctrl_003_not_testable(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/controls/CTRL-003", timeout=30)
        assert r.status_code == 200
        d = r.json()
        latest = d["runs"][0]
        assert latest.get("not_testable_count", 0) >= 1

    def test_run_appends_history_no_dup_exceptions(self, admin_session):
        # capture baseline
        r0 = admin_session.get(f"{BASE_URL}/api/controls/CTRL-005", timeout=30)
        runs_before = len(r0.json()["runs"])
        e0 = admin_session.get(f"{BASE_URL}/api/exceptions?page=1&page_size=1", timeout=30)
        exc_before = e0.json()["total"]

        rr = admin_session.post(f"{BASE_URL}/api/controls/run", timeout=60)
        assert rr.status_code == 200
        result = rr.json().get("result", {})
        assert "CTRL-005" in result

        r1 = admin_session.get(f"{BASE_URL}/api/controls/CTRL-005", timeout=30)
        runs_after = len(r1.json()["runs"])
        e1 = admin_session.get(f"{BASE_URL}/api/exceptions?page=1&page_size=1", timeout=30)
        exc_after = e1.json()["total"]

        assert runs_after == runs_before + 1, "control_test_runs must be append-only"
        assert exc_after == exc_before, "exceptions must not duplicate on re-run (stable code)"


# -------- transactions (paginated + filtered)
class TestTransactions:
    def test_pagination_default(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/transactions?page=1&page_size=25", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 10000
        assert d["pages"] == 400
        assert len(d["transactions"]) == 25

    def test_page_size_cap(self, admin_session):
        # page_size > 100 must be rejected (422) or capped to 100
        r = admin_session.get(f"{BASE_URL}/api/transactions?page=1&page_size=500", timeout=30)
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert len(r.json()["transactions"]) <= 100
        # max=100 should succeed
        r2 = admin_session.get(f"{BASE_URL}/api/transactions?page=1&page_size=100", timeout=30)
        assert r2.status_code == 200
        assert len(r2.json()["transactions"]) == 100

    def test_search_by_txn_id(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/transactions?search=TX-847291", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 1
        assert d["transactions"][0]["transaction_id"] == "TX-847291"

    def test_filter_by_control_and_result(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/transactions?control=CTRL-005&test_status=FAIL", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 82
        for tx in d["transactions"]:
            assert "CTRL-005" in (tx.get("failed_controls") or [])
            assert tx.get("test_status") == "FAIL"

    def test_sort_amount(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/transactions?sort=transaction_amount&direction=desc&page_size=5", timeout=30)
        assert r.status_code == 200
        amts = [t["transaction_amount"] for t in r.json()["transactions"]]
        assert amts == sorted(amts, reverse=True)

    def test_hero_transaction(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/transactions/TX-847291", timeout=30)
        assert r.status_code == 200
        d = r.json()
        t = d["transaction"]
        assert t["transaction_amount"] == 10000.0
        assert t["processor_amount"] == 10000.0
        assert t["expected_settlement"] == 10000.0
        assert t["actual_settlement"] == 9500.0
        assert t["actual_payout"] == 9500.0
        assert "CTRL-005" in t.get("failed_controls", [])
        assert t.get("test_status") == "FAIL"
        assert any(e["exception_code"] == "EXC-CTRL-005-TX-847291" for e in d["exceptions"])


# -------- exceptions
class TestExceptions:
    def test_list_paginated(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/exceptions?page=1&page_size=25", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 122
        assert len(d["exceptions"]) == 25

    def test_filter_by_control(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/exceptions?control=CTRL-005", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 82

    def test_hero_exception_explainability(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/exceptions/EXC-CTRL-005-TX-847291", timeout=30)
        assert r.status_code == 200
        exc = r.json()["exception"]
        exp = exc["explanation"]
        assert exp["expected"] == "PHP 10,000.00"
        assert exp["actual"] == "PHP 9,500.00"
        assert exp["variance"] == "PHP 500.00"
        assert exp["result"] == "FAILED"
        assert exc["transaction_id"] == "TX-847291"
        assert exc["status"] in ("OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "VERIFIED")


# -------- reports + stellar
class TestReports:
    def test_reports_counts(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/reports", timeout=30)
        assert r.status_code == 200
        pkg = r.json()["packages"][0]
        assert pkg.get("transactions_count") == 10000
        assert pkg.get("exceptions_count") == 122
        assert pkg.get("canonical_hash") or pkg.get("sha256_hash")
        st = pkg["stellar"]
        assert st["network"].upper() == "TESTNET"
        assert st["verification_status"] == "NOT_SUBMITTED"
        assert st.get("transaction_hash") is None


# -------- organization + regulatory
class TestOrgAndReg:
    def test_organization(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/organization", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["users"]) == 7
        assert "ADMIN" in d["roles"]
        for u in d["users"]:
            assert "password_hash" not in u
            assert "_id" not in u

    def test_regulatory_sources(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/regulatory/sources", timeout=30)
        assert r.status_code == 200
        assert len(r.json()["sources"]) == 2


# -------- protected route + logout
class TestSecurity:
    def test_unauth_blocked(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", timeout=30)
        assert r.status_code == 401

    def test_logout(self):
        s = requests.Session()
        assert s.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30).status_code == 200
        assert s.post(f"{BASE_URL}/api/auth/logout", timeout=30).status_code == 200
        assert s.get(f"{BASE_URL}/api/auth/me", timeout=30).status_code == 401
