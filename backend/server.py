"""TUGMA backend entrypoint.

Wires authentication + domain routers, creates indexes, and seeds the
synthetic demonstration organization on startup.
"""
import os
import logging
from datetime import datetime, timezone
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db
import auth
import api
import engine
from seed import seed_static
from dataset import ensure_dataset

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("tugma")

app = FastAPI(title="TUGMA API", version="0.1.0")

app.include_router(auth.router)
app.include_router(api.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.password_reset_requests.create_index("email")
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    # domain indexes for the 10k-transaction dataset + engine results
    await db.payment_transactions.create_index("transaction_id", unique=True)
    await db.payment_transactions.create_index("merchant_id")
    await db.payment_transactions.create_index("payment_status")
    await db.payment_transactions.create_index("risk_status")
    await db.payment_transactions.create_index("test_status")
    await db.payment_transactions.create_index("failed_controls")
    await db.payment_transactions.create_index("transaction_timestamp")
    await db.exceptions.create_index("exception_code", unique=True)
    await db.exceptions.create_index("control_code")
    await db.exceptions.create_index("status")
    await db.exceptions.create_index("severity")
    await db.exceptions.create_index("transaction_id")
    await db.control_test_runs.create_index("control_code")
    await db.control_test_runs.create_index("completed_at")

    await auth.seed_users()
    await seed_static()
    # Purge legacy Phase-1 demo records that predate the control engine.
    await db.exceptions.delete_many({"control_code": {"$exists": False}})
    await db.remediation_actions.delete_many({"exception_code": {"$exists": False}})
    await db.evidence.delete_many({"id": {"$regex": "^evd-"}})
    await db.evidence_package_items.delete_many({})
    regenerated = await ensure_dataset()
    runs_exist = await db.control_test_runs.count_documents({}) > 0
    if regenerated or not runs_exist:
        result = await engine.run_all_controls(triggered_by="startup")
        logger.info("Control engine baseline run: %s exceptions detected.", result["exceptions"])
    await engine._build_package(datetime.now(timezone.utc))
    logger.info("TUGMA startup complete: users, static reference data, 10k dataset and control results ready.")


@app.on_event("shutdown")
async def shutdown():
    db.client.close() if hasattr(db, "client") else None
