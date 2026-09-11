"""Static synthetic reference data for TUGMA Demo PSP.

Organization, regulatory sources/requirements, control definitions + test
metadata, and demonstration vendors. Transactions, control_test_runs and
exceptions are produced by the control engine (see engine.py) — never faked here.
"""
import hashlib
from datetime import datetime, timezone, timedelta

from db import db, DEMO_ORG_ID

NOW = datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat()


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


ORGANIZATION = {
    "id": DEMO_ORG_ID, "name": "TUGMA Demo PSP", "country": "Philippines",
    "industry": "Payment Service Provider", "environment": "DEMONSTRATION",
    "description": "Synthetic demonstration environment — no production payment data.",
    "created_at": iso(NOW - timedelta(days=120)),
}

REGULATORY_SOURCES = [
    {
        "id": "src-bsp-morps", "regulator": "BSP", "regulator_full": "Bangko Sentral ng Pilipinas",
        "title": "Manual of Regulations for Payment Systems", "document_type": "Regulatory Manual",
        "version": "December 2025", "publication_date": "2025-12-01", "effective_date": "2025-12-01",
        "jurisdiction": "Philippines",
        "section": "Payment Systems, Merchant Payment Acceptance, IT Risk, Governance, End-User Protection",
        "source_url": "https://www.bsp.gov.ph/Regulations/MORPS/MORPS.pdf", "status": "ACTIVE",
        "last_reviewed_at": iso(NOW - timedelta(days=14)), "content_hash": sha("bsp-morps-dec-2025"),
        "coverage": ["Payment Systems", "Merchant Payment Acceptance", "IT Risk Management", "Governance", "End-User Protection"],
    },
    {
        "id": "src-amlc", "regulator": "AMLC", "regulator_full": "Anti-Money Laundering Council",
        "title": "AML/CTF Regulatory Issuances", "document_type": "Regulatory Issuances",
        "version": "2025", "publication_date": "2025-01-15", "effective_date": "2025-01-15",
        "jurisdiction": "Philippines", "section": "AML/CTF, Covered Persons, CTR/STR, Targeted Financial Sanctions",
        "source_url": "https://www.amlc.gov.ph/laws-and-issuances", "status": "ACTIVE",
        "last_reviewed_at": iso(NOW - timedelta(days=21)), "content_hash": sha("amlc-2025"),
        "coverage": ["AML / CTF", "Covered Persons", "CTR / STR", "Targeted Financial Sanctions"],
    },
]

REGULATORY_REQUIREMENTS = [
    {"id": "req-bsp-tpo", "source_id": "src-bsp-morps", "requirement_code": "BSP-ITRM-01",
     "section": "IT Risk Management / Outsourcing", "title": "Oversight of Critical Third-Party Service Providers",
     "requirement_summary": "Operators must exercise appropriate oversight and due diligence over critical third-party and outsourced service providers.",
     "regulatory_intent": "Ensure operational resilience and accountability for outsourced payment functions.",
     "applicability": "All BSP-supervised payment operators", "effective_date": "2025-12-01", "status": "ACTIVE"},
    {"id": "req-bsp-itrm", "source_id": "src-bsp-morps", "requirement_code": "BSP-ITRM-02",
     "section": "IT Risk Management", "title": "IT Risk Management Controls and Evidence",
     "requirement_summary": "Operators must maintain a sound IT risk management framework with documented controls and evidence, including authorization and segregation of duties.",
     "regulatory_intent": "Protect the confidentiality, integrity and availability of payment systems.",
     "applicability": "All BSP-supervised payment operators", "effective_date": "2025-12-01", "status": "ACTIVE"},
    {"id": "req-bsp-eup", "source_id": "src-bsp-morps", "requirement_code": "BSP-EUP-01",
     "section": "End-User Protection", "title": "Merchant and End-User Protection",
     "requirement_summary": "Operators must implement measures protecting merchants and end-users, including complaint handling, disclosure and supporting evidence.",
     "regulatory_intent": "Fair, transparent treatment of merchants and end-users.",
     "applicability": "Merchant-facing payment operators", "effective_date": "2025-12-01", "status": "ACTIVE"},
    {"id": "req-bsp-settle", "source_id": "src-bsp-morps", "requirement_code": "BSP-PS-04",
     "section": "Payment Systems / Settlement", "title": "Settlement Integrity and Reconciliation",
     "requirement_summary": "Operators must ensure funds are settled accurately and reconciled against processor and payout records.",
     "regulatory_intent": "Maintain settlement integrity and prevent fund misallocation.",
     "applicability": "Merchant acquirers, aggregators, facilitators", "effective_date": "2025-12-01", "status": "ACTIVE"},
    {"id": "req-amlc-ctpf", "source_id": "src-amlc", "requirement_code": "AMLC-CTF-01",
     "section": "AML/CTF Program", "title": "AML/CTPF Control Evidence",
     "requirement_summary": "Covered persons must maintain an AML/CTF program with monitoring, reporting (CTR/STR) and record-keeping.",
     "regulatory_intent": "Detect, deter and report money laundering and terrorism financing.",
     "applicability": "Covered persons under the AMLA", "effective_date": "2025-01-15", "status": "ACTIVE"},
]

CONTROLS = [
    {"control_code": "CTRL-001", "name": "Critical Third-Party Oversight", "requirement_id": "req-bsp-tpo",
     "category": "Third-Party Risk", "risk_level": "HIGH", "control_type": "Preventive", "frequency": "Quarterly",
     "owner_role": "RISK", "objective": "Verify due diligence and oversight of critical outsourced providers.",
     "description": "Confirms that active critical vendors have current due-diligence, contracts and monitoring evidence on file.",
     "automated": True, "status": "ACTIVE",
     "interpretation": "TUGMA interprets BSP outsourcing oversight as requiring current vendor due-diligence artifacts per critical vendor.",
     "test_logic": "For each critical vendor: due_diligence_status == 'CURRENT' -> PASS, else WARNING."},
    {"control_code": "CTRL-002", "name": "IT Risk Control Evidence", "requirement_id": "req-bsp-itrm",
     "category": "IT Risk", "risk_level": "MEDIUM", "control_type": "Detective", "frequency": "Monthly",
     "owner_role": "RISK", "objective": "Ensure authorization and segregation-of-duty controls are evidenced.",
     "description": "Checks that each transaction carries a recorded approval and that the initiator and approver are different operators.",
     "automated": True, "status": "ACTIVE",
     "interpretation": "TUGMA interprets the IT risk framework requirement as evidenced authorization and segregation of duties per transaction.",
     "test_logic": "approval_status == 'MISSING' -> FAIL; initiated_by == approved_by -> FAIL (SoD); else PASS."},
    {"control_code": "CTRL-003", "name": "AML/CTPF Control Evidence", "requirement_id": "req-amlc-ctpf",
     "category": "AML/CTF", "risk_level": "HIGH", "control_type": "Detective", "frequency": "Monthly",
     "owner_role": "COMPLIANCE", "objective": "Confirm AML program evidence and reporting completeness.",
     "description": "Verifies that AML program artifacts exist for the review period. Not an AML transaction-monitoring replacement.",
     "automated": False, "status": "ACTIVE",
     "interpretation": "TUGMA interprets AMLC program requirements as evidence of program operation, not as transaction monitoring.",
     "test_logic": "If AML program evidence artifacts are present for the period -> PASS, else NOT_TESTABLE."},
    {"control_code": "CTRL-004", "name": "Merchant / End-User Protection", "requirement_id": "req-bsp-eup",
     "category": "End-User Protection", "risk_level": "MEDIUM", "control_type": "Detective", "frequency": "Monthly",
     "owner_role": "COMPLIANCE", "objective": "Ensure merchant/end-user supporting evidence is present.",
     "description": "Checks that each transaction has an associated supporting evidence record; missing evidence raises a warning.",
     "automated": True, "status": "ACTIVE",
     "interpretation": "TUGMA interprets end-user protection as requiring retrievable supporting evidence per transaction.",
     "test_logic": "has_evidence == False -> WARNING; else PASS."},
    {"control_code": "CTRL-005", "name": "Settlement Reconciliation", "requirement_id": "req-bsp-settle",
     "category": "Settlement Integrity", "risk_level": "HIGH", "control_type": "Detective", "frequency": "Daily",
     "owner_role": "PAYMENT_OPS", "objective": "Detect discrepancies between processor, settlement and payout amounts.",
     "description": "Tests every settled transaction: settlement variance, payout variance and duplicate detection against a configured tolerance.",
     "automated": True, "status": "ACTIVE", "primary": True,
     "interpretation": "TUGMA interprets settlement integrity as automated per-transaction reconciliation within a defined tolerance.",
     "test_logic": "expected_settlement = processor_amount; variance = expected_settlement - actual_settlement; |variance| > tolerance -> FAIL. Also |expected_payout - actual_payout| > tolerance -> FAIL. Duplicate idempotency key -> FAIL. Unsettled -> NOT_TESTABLE."},
]

CONTROL_TESTS = {
    "CTRL-005": {"name": "Settlement vs Processor Reconciliation",
                 "description": "Compares processor_amount against actual_settlement and expected vs actual payout within tolerance.",
                 "data_sources": ["payment_transactions"], "required_fields": ["processor_amount", "actual_settlement", "expected_payout", "actual_payout"],
                 "logic_type": "TOLERANCE", "logic_definition": "abs(expected - actual) > tolerance", "threshold": "0.01 PHP", "frequency": "Daily", "active": True},
    "CTRL-002": {"name": "Authorization & Segregation of Duties",
                 "description": "Checks approval presence and initiator/approver separation.",
                 "data_sources": ["payment_transactions"], "required_fields": ["approval_status", "initiated_by", "approved_by"],
                 "logic_type": "RULE", "logic_definition": "approval present AND initiator != approver", "threshold": "n/a", "frequency": "Monthly", "active": True},
    "CTRL-004": {"name": "Supporting Evidence Presence",
                 "description": "Checks each transaction has a supporting evidence record.",
                 "data_sources": ["payment_transactions", "evidence"], "required_fields": ["has_evidence"],
                 "logic_type": "RULE", "logic_definition": "has_evidence == True", "threshold": "n/a", "frequency": "Monthly", "active": True},
    "CTRL-001": {"name": "Vendor Due-Diligence Currency",
                 "description": "Checks critical vendors have current due-diligence.",
                 "data_sources": ["vendors"], "required_fields": ["due_diligence_status"],
                 "logic_type": "RULE", "logic_definition": "due_diligence_status == CURRENT", "threshold": "n/a", "frequency": "Quarterly", "active": True},
    "CTRL-003": {"name": "AML Program Evidence",
                 "description": "Checks AML program evidence artifacts for the period.",
                 "data_sources": ["evidence"], "required_fields": [],
                 "logic_type": "RULE", "logic_definition": "AML program evidence present", "threshold": "n/a", "frequency": "Monthly", "active": False},
}

VENDORS = [
    {"id": "ven-001", "organization_id": DEMO_ORG_ID, "name": "Core Processing Partner", "category": "Payment Processor", "criticality": "CRITICAL", "due_diligence_status": "CURRENT", "last_reviewed": iso(NOW - timedelta(days=40))},
    {"id": "ven-002", "organization_id": DEMO_ORG_ID, "name": "Cloud Infrastructure Provider", "category": "Cloud", "criticality": "CRITICAL", "due_diligence_status": "CURRENT", "last_reviewed": iso(NOW - timedelta(days=60))},
    {"id": "ven-003", "organization_id": DEMO_ORG_ID, "name": "KYC Verification Vendor", "category": "Identity", "criticality": "HIGH", "due_diligence_status": "CURRENT", "last_reviewed": iso(NOW - timedelta(days=25))},
    {"id": "ven-004", "organization_id": DEMO_ORG_ID, "name": "Settlement Bank Connector", "category": "Banking", "criticality": "CRITICAL", "due_diligence_status": "DUE_FOR_REVIEW", "last_reviewed": iso(NOW - timedelta(days=400))},
]


async def _replace(collection, docs, key="id"):
    coll = db[collection]
    for d in docs:
        await coll.replace_one({key: d[key]}, d, upsert=True)


def control_docs():
    controls, tests = [], []
    for c in CONTROLS:
        cid = f"ctl-{c['control_code'].lower()}"
        controls.append({"id": cid, "organization_id": DEMO_ORG_ID,
                         "created_at": iso(NOW - timedelta(days=90)), "updated_at": iso(NOW - timedelta(days=1)), **c})
        t = CONTROL_TESTS.get(c["control_code"])
        if t:
            tests.append({"id": f"tst-{c['control_code'].lower()}", "control_id": cid, **t})
    return controls, tests


async def seed_static():
    await _replace("organizations", [ORGANIZATION])
    await _replace("regulatory_sources", REGULATORY_SOURCES)
    await _replace("regulatory_requirements", REGULATORY_REQUIREMENTS)
    controls, tests = control_docs()
    await _replace("controls", controls)
    await _replace("control_tests", tests)
    await _replace("vendors", VENDORS)
