"""Role-based access control checks for exception transitions.

These tests verify that users without the required permissions receive
HTTP 403 responses for prohibited exception state changes.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EXC = "EXC-CTRL-005-TX-847291"

DEMO_PASSWORD = os.environ["DEMO_USER_PASSWORD"]

AUDITOR = ("auditor@tugmademo.ph", DEMO_PASSWORD)
VIEWER = ("viewer@tugmademo.ph", DEMO_PASSWORD)
OPS = ("ops@tugmademo.ph", DEMO_PASSWORD)



def _login(cred):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": cred[0], "password": cred[1]}, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _transition(sess, to_status):
    return sess.post(f"{BASE_URL}/api/exceptions/{EXC}/transition",
                     json={"to_status": to_status}, timeout=30)


def test_auditor_transition_to_in_review_is_403():
    s = _login(AUDITOR)
    r = _transition(s, "IN_REVIEW")
    assert r.status_code == 403, f"Expected 403 role-denied, got {r.status_code}: {r.text}"


def test_auditor_transition_illegal_target_is_still_403_not_400():
    """Role gate must precede legality check: role-denied writes always 403."""
    s = _login(AUDITOR)
    # Try every possible target — none should ever return 400 for auditor,
    # even if the target is illegal for the current state.
    for target in ["OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "VERIFIED"]:
        r = _transition(s, target)
        assert r.status_code == 403, (
            f"AUDITOR -> {target}: expected 403, got {r.status_code}: {r.text}"
        )


def test_viewer_transition_is_403():
    s = _login(VIEWER)
    r = _transition(s, "IN_REVIEW")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


def test_payment_ops_verify_is_403():
    """PAYMENT_OPS has exception:transition but NOT exception:verify."""
    s = _login(OPS)
    r = _transition(s, "VERIFIED")
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
