"""Deterministic synthetic payment dataset for TUGMA Demo PSP.

Generates exactly 10,000 reproducible transactions (fixed seed) for ~150
merchants, with a precise, traceable set of injected demonstration defects.
Detection is performed genuinely by the control engine against transaction
fields — the injected flags here only shape the data, they are not read back
as "answers".
"""
import random
from datetime import datetime, timezone, timedelta

from db import db, DEMO_ORG_ID

SEED = 42
TOTAL = 10000
N_MERCHANTS = 150
FEE_RATE = 0.018

# Exact, traceable defect counts.
DEFECT_SPEC = {
    "settlement_discrepancy": 60,
    "payout_threshold_breach": 7,
    "duplicate_transaction": 15,
    "missing_approval": 25,
    "segregation_of_duty": 5,
    "missing_evidence": 10,
}
N_PENDING = 150  # not-yet-settled -> NOT_TESTABLE for CTRL-005 (genuine, not a defect)

OPERATORS = [f"opuser-{i:02d}" for i in range(1, 13)]
BASE_TIME = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _round(v):
    return round(float(v), 2)


def generate_transactions():
    rng = random.Random(SEED)
    merchants = [f"MERCH-{i:04d}" for i in range(1, N_MERCHANTS + 1)]

    numbers = rng.sample(range(100000, 1000000), TOTAL)
    # Guarantee the hero demo transaction TX-847291 exists at index 0.
    if 847291 in numbers:
        numbers.remove(847291)
    else:
        numbers.pop()
    numbers.insert(0, 847291)

    txns = []
    for i, num in enumerate(numbers):
        ts = BASE_TIME + timedelta(minutes=i * 4, seconds=rng.randint(0, 59))
        amount = _round(rng.uniform(500, 60000))
        processor = amount
        expected_settle = processor
        expected_payout = _round(processor * (1 - FEE_RATE))
        initiator = rng.choice(OPERATORS)
        approver = rng.choice([o for o in OPERATORS if o != initiator])
        txns.append({
            "id": f"txn-{num}",
            "organization_id": DEMO_ORG_ID,
            "transaction_id": f"TX-{num}",
            "merchant_id": rng.choice(merchants),
            "currency": "PHP",
            "transaction_amount": amount,
            "processor_amount": processor,
            "expected_settlement": expected_settle,
            "actual_settlement": expected_settle,
            "expected_payout": expected_payout,
            "actual_payout": expected_payout,
            "transaction_timestamp": ts.isoformat(),
            "settlement_timestamp": (ts + timedelta(hours=2)).isoformat(),
            "payout_timestamp": (ts + timedelta(days=1)).isoformat(),
            "payment_status": "SETTLED",
            "risk_status": "NORMAL",
            "idempotency_key": f"IK-{num}",
            "approval_status": "APPROVED",
            "initiated_by": initiator,
            "approved_by": approver,
            "has_evidence": True,
            "duplicate_of": None,
            "created_at": ts.isoformat(),
        })

    # ---- deterministic defect assignment (disjoint indices) --------------
    pool = list(range(1, TOTAL))  # keep index 0 (TX-847291) reserved for settlement
    rng.shuffle(pool)
    cursor = 0

    def take(n):
        nonlocal cursor
        chunk = pool[cursor:cursor + n]
        cursor += n
        return chunk

    settlement_idx = [0] + take(DEFECT_SPEC["settlement_discrepancy"] - 1)
    payout_idx = take(DEFECT_SPEC["payout_threshold_breach"])
    duplicate_idx = take(DEFECT_SPEC["duplicate_transaction"])
    approval_idx = take(DEFECT_SPEC["missing_approval"])
    sod_idx = take(DEFECT_SPEC["segregation_of_duty"])
    evidence_idx = take(DEFECT_SPEC["missing_evidence"])
    pending_idx = take(N_PENDING)
    original_idx = take(DEFECT_SPEC["duplicate_transaction"])  # clean originals for duplicates

    # Settlement discrepancies
    for j, idx in enumerate(settlement_idx):
        t = txns[idx]
        if idx == 0:  # TX-847291 exact demo scenario
            t.update(transaction_amount=10000.0, processor_amount=10000.0,
                     expected_settlement=10000.0, actual_settlement=9500.0,
                     expected_payout=9500.0, actual_payout=9500.0)
        else:
            var = _round(rng.uniform(50, 3500))
            t["actual_settlement"] = _round(t["expected_settlement"] - var)
        t["risk_status"] = "HIGH"

    # Payout threshold breaches (settlement fine, payout off)
    for idx in payout_idx:
        t = txns[idx]
        var = _round(rng.uniform(75, 2500))
        t["actual_payout"] = _round(t["expected_payout"] - var)
        t["risk_status"] = "HIGH"

    # Duplicates share an idempotency_key with a distinct clean original
    for d, o in zip(duplicate_idx, original_idx):
        orig = txns[o]
        dup = txns[d]
        dup.update(
            merchant_id=orig["merchant_id"],
            transaction_amount=orig["transaction_amount"],
            processor_amount=orig["processor_amount"],
            expected_settlement=orig["expected_settlement"],
            actual_settlement=orig["actual_settlement"],
            expected_payout=orig["expected_payout"],
            actual_payout=orig["actual_payout"],
            idempotency_key=orig["idempotency_key"],
            duplicate_of=orig["transaction_id"],
            risk_status="MEDIUM",
        )
        odt = datetime.fromisoformat(orig["transaction_timestamp"]) + timedelta(minutes=3)
        dup["transaction_timestamp"] = odt.isoformat()

    # Missing approvals
    for idx in approval_idx:
        txns[idx]["approval_status"] = "MISSING"
        txns[idx]["risk_status"] = "MEDIUM"

    # Segregation-of-duty (same actor initiates and approves)
    for idx in sod_idx:
        txns[idx]["approved_by"] = txns[idx]["initiated_by"]
        txns[idx]["risk_status"] = "HIGH"

    # Missing evidence
    for idx in evidence_idx:
        txns[idx]["has_evidence"] = False

    # Pending (unsettled) — genuine NOT_TESTABLE for settlement reconciliation
    for idx in pending_idx:
        t = txns[idx]
        t.update(payment_status="PENDING", actual_settlement=None, actual_payout=None,
                 settlement_timestamp=None, payout_timestamp=None)

    return txns


async def ensure_dataset():
    """Idempotent: (re)generate only when the collection is not exactly 10,000."""
    count = await db.payment_transactions.count_documents({"organization_id": DEMO_ORG_ID})
    if count == TOTAL:
        return False
    await db.payment_transactions.delete_many({"organization_id": DEMO_ORG_ID})
    await db.payment_transactions.insert_many(generate_transactions())
    return True
