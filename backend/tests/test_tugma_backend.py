"""TUGMA backend API test suite covering auth + domain endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://compliance-proof-4.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "nelson@patika.dev"
ADMIN_PASSWORD = "TugmaAdmin!2026"
COMPLIANCE_EMAIL = "compliance@tugmademo.ph"
DEMO_PASSWORD = "TugmaDemo!2026"


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
        # httpOnly cookies
        assert "access_token" in r.cookies
        assert "refresh_token" in r.cookies

    def test_login_demo_compliance(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": COMPLIANCE_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "COMPLIANCE"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_session(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_forgot_password_generic(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": "unknown@example.com"}, timeout=30)
        assert r.status_code == 200
        assert "reset link" in r.json()["message"].lower()

    def test_forgot_password_registered(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": ADMIN_EMAIL}, timeout=30)
        assert r.status_code == 200


# -------- dashboard
class TestDashboard:
    def test_dashboard_kpis(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/dashboard/summary", timeout=30)
        assert r.status_code == 200
        data = r.json()
        k = data["kpis"]
        assert k["transactions_analyzed"] == 10000
        assert k["controls_tested"] == 5
        assert k["exceptions"] == 3
        assert k["high_risk"] == 2
        assert k["evidence_readiness"] == 87
        assert k["open_remediation"] == 2
        assert len(data["control_health"]) == 5
        assert isinstance(data["priority_exceptions"], list)


# -------- domain endpoints
class TestDomain:
    def test_organization(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/organization", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["organization"]["name"]
        assert len(data["users"]) == 7
        assert "ADMIN" in data["roles"]
        # sanitized
        for u in data["users"]:
            assert "password_hash" not in u
            assert "_id" not in u

    def test_regulatory_sources(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/regulatory/sources", timeout=30)
        assert r.status_code == 200
        srcs = r.json()["sources"]
        assert len(srcs) == 2
        codes = {s.get("code") or s.get("regulator") or s.get("name") for s in srcs}
        # ensure has requirements
        total_reqs = sum(len(s["requirements"]) for s in srcs)
        assert total_reqs == 5

    def test_controls(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/controls", timeout=30)
        assert r.status_code == 200
        controls = r.json()["controls"]
        assert len(controls) == 5
        codes = [c["control_code"] for c in controls]
        for i in range(1, 6):
            assert f"CTRL-00{i}" in codes
        ctrl5 = next(c for c in controls if c["control_code"] == "CTRL-005")
        assert ctrl5["run"] is not None
        assert ctrl5["run"]["records_tested"] == 10000
        assert ctrl5["run"]["passed_count"] == 9873
        assert ctrl5["run"]["failed_count"] == 127

    def test_transactions(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/transactions", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 24
        assert len(data["transactions"]) == 24

    def test_exceptions(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/exceptions", timeout=30)
        assert r.status_code == 200
        excs = r.json()["exceptions"]
        assert len(excs) == 3
        assert all("remediation_actions" in e for e in excs)

    def test_evidence(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/evidence", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data["packages"]) == 1
        pkg = data["packages"][0]
        assert pkg["completeness_score"] == 87
        assert "sha256" in str(pkg).lower() or pkg.get("canonical_hash") or pkg.get("sha256_hash")

    def test_reports_with_stellar(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/reports", timeout=30)
        assert r.status_code == 200
        pkgs = r.json()["packages"]
        assert len(pkgs) == 1
        assert pkgs[0]["stellar"] is not None
        st = pkgs[0]["stellar"]
        assert st.get("network", "").upper() == "TESTNET" or "TESTNET" in str(st).upper()

    def test_stellar_attestations(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/stellar/attestations", timeout=30)
        assert r.status_code == 200
        att = r.json()["attestations"]
        assert len(att) == 1

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", timeout=30)
        assert r.status_code == 401


# -------- logout
class TestLogout:
    def test_logout(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=30)
        assert r.status_code == 200
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401
