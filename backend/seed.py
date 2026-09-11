"""Synthetic demonstration data for the single TUGMA Demo PSP organization.

All data is fictional. No real customer, merchant, bank or payment data is used.
Seeding is idempotent — keyed on stable string ids / codes.
"""
import hashlib
from datetime import datetime, timezone, timedelta

from db import db, DEMO_ORG_ID

NOW = datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat()


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


# ----------------------------------------------------------- static records
ORGANIZATION = {
    "id": DEMO_ORG_ID,
    "name": "TUGMA Demo PSP",
    "country": "Philippines",
    "industry": "Payment Service Provider",
    "environment": "DEMONSTRATION",
    "description": "Synthetic demonstration environment — no production payment data.",
    "created_at": iso(NOW - timedelta(days=120)),
}

REGULATORY_SOURCES = [
    {
        "id": "src-bsp-morps",
        "regulator": "BSP",
        "regulator_full": "Bangko Sentral ng Pilipinas",
        "title": "Manual of Regulations for Payment Systems",
        "document_type": "Regulatory Manual",
        "version": "December 2025",
        "publication_date": "2025-12-01",
        "effective_date": "2025-12-01",
        "jurisdiction": "Philippines",
        "section": "Payment Systems, Merchant Payment Acceptance, IT Risk, Governance, End-User Protection",
        "source_url": "https://www.bsp.gov.ph/Regulations/MORPS/MORPS.pdf",
        "status": "ACTIVE",
        "last_reviewed_at": iso(NOW - timedelta(days=14)),
        "content_hash": sha("bsp-morps-dec-2025"),
        "coverage": ["Payment Systems", "Merchant Payment Acceptance", "IT Risk Management",
                     "Governance", "End-User Protection"],
    },
    {
        "id": "src-amlc",
        "regulator": "AMLC",
        "regulator_full": "Anti-Money Laundering Council",
        "title": "AML/CTF Regulatory Issuances",
        "document_type": "Regulatory Issuances",
        "version": "2025",
        "publication_date": "2025-01-15",
        "effective_date": "2025-01-15",
        "jurisdiction": "Philippines",
        "section": "AML/CTF, Covered Persons, CTR/STR, Targeted Financial Sanctions",
        "source_url": "https://www.amlc.gov.ph/laws-and-issuances",
        "status": "ACTIVE",
        "last_reviewed_at": iso(NOW - timedelta(days=21)),
        "content_hash": sha("amlc-2025"),
        "coverage": ["AML / CTF", "Covered Persons", "CTR / STR", "Targeted Financial Sanctions"],
    },
]

REGULATORY_REQUIREMENTS = [
    {
        "id": "req-bsp-tpo", "source_id": "src-bsp-morps", "requirement_code": "BSP-ITRM-01",
        "section": "IT Risk Management / Outsourcing",
        "title": "Oversight of Critical Third-Party Service Providers",
        "requirement_summary": "Operators must exercise appropriate oversight and due diligence over critical third-party and outsourced service providers.",
        "regulatory_intent": "Ensure operational resilience and accountability for outsourced payment functions.",
        "applicability": "All BSP-supervised payment operators", "effective_date": "2025-12-01",
        "status": "ACTIVE",
    },
    {
        "id": "req-bsp-itrm", "source_id": "src-bsp-morps", "requirement_code": "BSP-ITRM-02",
        "section": "IT Risk Management",
        "title": "IT Risk Management Controls and Evidence",
        "requirement_summary": "Operators must maintain a sound IT risk management framework with documented controls and evidence.",
        "regulatory_intent": "Protect the confidentiality, integrity and availability of payment systems.",
        "applicability": "All BSP-supervised payment operators", "effective_date": "2025-12-01",
        "status": "ACTIVE",
    },
    {
        "id": "req-bsp-eup", "source_id": "src-bsp-morps", "requirement_code": "BSP-EUP-01",
        "section": "End-User Protection",
        "title": "Merchant and End-User Protection",
        "requirement_summary": "Operators must implement measures protecting merchants and end-users, including complaint handling and disclosure.",
        "regulatory_intent": "Fair, transparent treatment of merchants and end-users.",
        "applicability": "Merchant-facing payment operators", "effective_date": "2025-12-01",
        "status": "ACTIVE",
    },
    {
        "id": "req-bsp-settle", "source_id": "src-bsp-morps", "requirement_code": "BSP-PS-04",
        "section": "Payment Systems / Settlement",
        "title": "Settlement Integrity and Reconciliation",
        "requirement_summary": "Operators must ensure funds are settled accurately and reconciled against processor and payout records.",
        "regulatory_intent": "Maintain settlement integrity and prevent fund misallocation.",
        "applicability": "Merchant acquirers, aggregators, facilitators", "effective_date": "2025-12-01",
        "status": "ACTIVE",
    },
    {
        "id": "req-amlc-ctpf", "source_id": "src-amlc", "requirement_code": "AMLC-CTF-01",
        "section": "AML/CTF Program",
        "title": "AML/CTPF Control Evidence",
        "requirement_summary": "Covered persons must maintain an AML/CTF program with monitoring, reporting (CTR/STR) and record-keeping.",
        "regulatory_intent": "Detect, deter and report money laundering and terrorism financing.",
        "applicability": "Covered persons under the AMLA", "effective_date": "2025-01-15",
        "status": "ACTIVE",
    },
]

# controls -----------------------------------------------------------------
CONTROLS = [
    {
        "control_code": "CTRL-001", "name": "Critical Third-Party Oversight",
        "requirement_id": "req-bsp-tpo", "category": "Third-Party Risk", "risk_level": "HIGH",
        "control_type": "Preventive", "frequency": "Quarterly", "owner_role": "RISK",
        "objective": "Verify due diligence and oversight of critical outsourced providers.",
        "description": "Confirms that active critical vendors have current due-diligence, contracts and monitoring evidence on file.",
        "automated": True, "status": "ACTIVE",
        "interpretation": "TUGMA interprets BSP outsourcing oversight as requiring current vendor due-diligence artifacts per critical vendor.",
    },
    {
        "control_code": "CTRL-002", "name": "IT Risk Control Evidence",
        "requirement_id": "req-bsp-itrm", "category": "IT Risk", "risk_level": "MEDIUM",
        "control_type": "Detective", "frequency": "Monthly", "owner_role": "RISK",
        "objective": "Ensure IT risk controls have supporting evidence.",
        "description": "Checks that required IT risk controls (access review, change logs, backups) have evidence within the review window.",
        "automated": True, "status": "ACTIVE",
        "interpretation": "TUGMA interprets the IT risk framework requirement as periodic evidence capture per control domain.",
    },
    {
        "control_code": "CTRL-003", "name": "AML/CTPF Control Evidence",
        "requirement_id": "req-amlc-ctpf", "category": "AML/CTF", "risk_level": "HIGH",
        "control_type": "Detective", "frequency": "Monthly", "owner_role": "COMPLIANCE",
        "objective": "Confirm AML program evidence and reporting completeness.",
        "description": "Verifies that AML program artifacts (screening, CTR/STR filing references) exist for the review period. Not an AML transaction-monitoring replacement.",
        "automated": False, "status": "ACTIVE",
        "interpretation": "TUGMA interprets AMLC program requirements as evidence of program operation, not as transaction monitoring.",
    },
    {
        "control_code": "CTRL-004", "name": "Merchant / End-User Protection",
        "requirement_id": "req-bsp-eup", "category": "End-User Protection", "risk_level": "MEDIUM",
        "control_type": "Detective", "frequency": "Monthly", "owner_role": "COMPLIANCE",
        "objective": "Ensure merchant/end-user protection measures are evidenced.",
        "description": "Checks disclosure, complaint-handling and dispute-resolution evidence for the period.",
        "automated": False, "status": "ACTIVE",
        "interpretation": "TUGMA interprets end-user protection as requiring evidenced complaint handling and disclosure.",
    },
    {
        "control_code": "CTRL-005", "name": "Settlement Reconciliation",
        "requirement_id": "req-bsp-settle", "category": "Settlement Integrity", "risk_level": "HIGH",
        "control_type": "Detective", "frequency": "Daily", "owner_role": "PAYMENT_OPS",
        "objective": "Detect discrepancies between processor, settlement and payout amounts.",
        "description": "Tests every transaction where |processor_amount - actual_settlement| exceeds tolerance and raises a HIGH exception requiring evidence.",
        "automated": True, "status": "ACTIVE", "primary": True,
        "interpretation": "TUGMA interprets settlement integrity as automated per-transaction reconciliation within a defined tolerance.",
    },
]

CONTROL_TESTS = {
    "CTRL-005": {
        "name": "Settlement vs Processor Reconciliation",
        "description": "Compares processor_amount against actual_settlement within tolerance.",
        "data_sources": ["payment_transactions", "processor_records", "settlement_records"],
        "required_fields": ["processor_amount", "actual_settlement"],
        "logic_type": "TOLERANCE", "logic_definition": "abs(processor_amount - actual_settlement) > tolerance",
        "threshold": "0.01 PHP", "frequency": "Daily", "active": True,
    },
}


def _control_docs():
    controls, tests, runs = [], [], []
    for c in CONTROLS:
        cid = f"ctl-{c['control_code'].lower()}"
        controls.append({
            "id": cid, "organization_id": DEMO_ORG_ID, "created_at": iso(NOW - timedelta(days=90)),
            "updated_at": iso(NOW - timedelta(days=1)), **c})
        t = CONTROL_TESTS.get(c["control_code"])
        if t:
            tid = f"tst-{c['control_code'].lower()}"
            tests.append({"id": tid, "control_id": cid, **t})
            runs.append({
                "id": f"run-{c['control_code'].lower()}", "control_test_id": tid,
                "started_at": iso(NOW - timedelta(hours=6)), "completed_at": iso(NOW - timedelta(hours=5, minutes=52)),
                "records_tested": 10000, "passed_count": 9873, "failed_count": 127,
                "warning_count": 0, "not_testable_count": 0, "status": "COMPLETED",
                "execution_metadata": {"engine": "deterministic", "phase": "foundation-demo"}})
    return controls, tests, runs


# transactions --------------------------------------------------------------
def _transactions():
    txs = []
    merchants = ["MERCH-1042", "MERCH-2087", "MERCH-3311", "MERCH-4520", "MERCH-5098"]
    base = 15000.0
    for i in range(24):
        amt = round(base + i * 137.25, 2)
        proc = amt
        # A handful of intentional settlement discrepancies for CTRL-005 exceptions.
        mismatch = i in (3, 11, 19)
        actual_settle = round(proc - (250.50 if mismatch else 0.0), 2)
        ts = NOW - timedelta(hours=i * 3)
        txs.append({
            "id": f"txn-{i+1:04d}", "organization_id": DEMO_ORG_ID,
            "transaction_id": f"TX-2026-{40010 + i}", "merchant_id": merchants[i % len(merchants)],
            "currency": "PHP", "transaction_amount": amt, "processor_amount": proc,
            "expected_settlement": proc, "actual_settlement": actual_settle,
            "expected_payout": round(proc * 0.982, 2),
            "actual_payout": round(proc * 0.982, 2) if not mismatch else round(proc * 0.982 - 250.50, 2),
            "transaction_timestamp": iso(ts), "settlement_timestamp": iso(ts + timedelta(hours=2)),
            "payout_timestamp": iso(ts + timedelta(days=1)),
            "payment_status": "SETTLED", "risk_status": "HIGH" if mismatch else "NORMAL",
            "created_at": iso(ts)})
    return txs


# exceptions ----------------------------------------------------------------
def _exceptions_and_remediation():
    exceptions, remediations, evidence = [], [], []
    mismatch_txns = ["txn-0004", "txn-0012", "txn-0020"]
    severities = ["HIGH", "HIGH", "MEDIUM"]
    statuses = ["OPEN", "IN_REMEDIATION", "RESOLVED"]
    for idx, txn in enumerate(mismatch_txns):
        eid = f"exc-{idx+1:03d}"
        detected = NOW - timedelta(hours=5, minutes=30 + idx)
        ex = {
            "id": eid, "organization_id": DEMO_ORG_ID, "control_test_run_id": "run-ctrl-005",
            "control_id": "ctl-ctrl-005", "transaction_id": txn,
            "exception_code": f"EXC-SETTLE-{idx+1:03d}",
            "title": "Settlement amount below processor amount",
            "description": "Processor amount and actual settlement differ by 250.50 PHP, exceeding tolerance.",
            "severity": severities[idx], "status": statuses[idx], "detected_at": iso(detected),
            "due_date": iso(detected + timedelta(days=5)), "owner_role": "PAYMENT_OPS",
            "root_cause": "Fee reversal not reflected in settlement file" if idx == 2 else None,
            "remediation_summary": "Reconciled and corrected in ledger" if idx == 2 else None,
            "resolved_at": iso(detected + timedelta(days=2)) if idx == 2 else None,
            "verified_at": iso(detected + timedelta(days=2, hours=3)) if idx == 2 else None,
        }
        exceptions.append(ex)
        remediations.append({
            "id": f"rem-{idx+1:03d}", "exception_id": eid,
            "action": "Investigate settlement file and correct ledger entry",
            "owner_role": "PAYMENT_OPS", "due_date": iso(detected + timedelta(days=5)),
            "status": "COMPLETED" if idx == 2 else ("IN_PROGRESS" if idx == 1 else "PENDING"),
            "completion_note": "Ledger corrected; processor credit confirmed." if idx == 2 else None,
            "completed_at": iso(detected + timedelta(days=2)) if idx == 2 else None,
            "verified_by": "COMPLIANCE" if idx == 2 else None,
            "verified_at": iso(detected + timedelta(days=2, hours=3)) if idx == 2 else None})
        if idx == 2:
            evidence.append({
                "id": f"evd-{idx+1:03d}", "organization_id": DEMO_ORG_ID, "control_id": "ctl-ctrl-005",
                "exception_id": eid, "evidence_type": "RESOLUTION_RECORD",
                "name": "Ledger correction record", "description": "Signed ledger correction and processor credit confirmation.",
                "source_system": "ERP", "file_reference": "synthetic://evidence/ledger-correction-003.pdf",
                "captured_at": iso(detected + timedelta(days=2)), "captured_by": "PAYMENT_OPS",
                "content_hash": sha("ledger-correction-003"), "valid_from": iso(detected),
                "valid_until": iso(detected + timedelta(days=365)), "verification_status": "VERIFIED",
                "created_at": iso(detected + timedelta(days=2))})
    return exceptions, remediations, evidence


# evidence packages ---------------------------------------------------------
def _evidence_and_packages(exc_evidence):
    evidence = list(exc_evidence)
    control_evidence = [
        ("evd-c001", "ctl-ctrl-001", "PROCESSOR_RECORD", "Vendor due-diligence bundle Q4", "VENDOR_PORTAL"),
        ("evd-c002", "ctl-ctrl-002", "SYSTEM_LOG", "Quarterly access review export", "IAM"),
        ("evd-c005", "ctl-ctrl-005", "SETTLEMENT_RECORD", "Daily settlement reconciliation report", "SETTLEMENT"),
    ]
    for eid, cid, etype, name, src in control_evidence:
        evidence.append({
            "id": eid, "organization_id": DEMO_ORG_ID, "control_id": cid, "exception_id": None,
            "evidence_type": etype, "name": name, "description": f"Synthetic {name.lower()}.",
            "source_system": src, "file_reference": f"synthetic://evidence/{eid}.pdf",
            "captured_at": iso(NOW - timedelta(days=3)), "captured_by": "PAYMENT_OPS",
            "content_hash": sha(eid), "valid_from": iso(NOW - timedelta(days=3)),
            "valid_until": iso(NOW + timedelta(days=362)), "verification_status": "VERIFIED",
            "created_at": iso(NOW - timedelta(days=3))})

    package_id = "pkg-2026-q1"
    canonical = sha("tugma-package-2026-q1-canonical")
    package = {
        "id": package_id, "organization_id": DEMO_ORG_ID,
        "name": "Q1 2026 Settlement Evidence Package", "period_start": "2026-01-01",
        "period_end": "2026-03-31", "controls_count": 5, "transactions_count": 10000,
        "exceptions_count": 3, "evidence_count": len(evidence), "completeness_score": 87,
        "canonical_hash": canonical, "generated_at": iso(NOW - timedelta(days=2)),
        "status": "FINALIZED"}
    items = [{"id": f"pki-{i+1:03d}", "package_id": package_id, "evidence_id": e["id"],
              "exception_id": e.get("exception_id"), "control_id": e.get("control_id")}
             for i, e in enumerate(evidence)]
    stellar = {
        "id": "stl-001", "evidence_package_id": package_id, "network": "TESTNET",
        "stellar_account": "G*** (demonstration account, not a production credential)",
        "transaction_hash": sha("stellar-tx-" + canonical)[:64],
        "ledger": 51234567, "attestation_hash": canonical,
        "submitted_at": iso(NOW - timedelta(days=2, hours=-1)),
        "verified_at": iso(NOW - timedelta(days=2, hours=-1, minutes=-4)),
        "verification_status": "VERIFIED"}
    return evidence, package, items, stellar


async def _replace(collection, docs, key="id"):
    coll = db[collection]
    for d in docs:
        await coll.replace_one({key: d[key]}, d, upsert=True)


async def seed_demo_data():
    await _replace("organizations", [ORGANIZATION])
    await _replace("regulatory_sources", REGULATORY_SOURCES)
    await _replace("regulatory_requirements", REGULATORY_REQUIREMENTS)
    controls, tests, runs = _control_docs()
    await _replace("controls", controls)
    await _replace("control_tests", tests)
    await _replace("control_test_runs", runs)
    await _replace("payment_transactions", _transactions())
    exceptions, remediations, exc_evidence = _exceptions_and_remediation()
    await _replace("exceptions", exceptions)
    await _replace("remediation_actions", remediations)
    evidence, package, items, stellar = _evidence_and_packages(exc_evidence)
    await _replace("evidence", evidence)
    await _replace("evidence_packages", [package])
    await _replace("evidence_package_items", items)
    await _replace("stellar_attestations", [stellar])
