"""TUGMA backend entrypoint.

Wires authentication + domain routers, creates indexes, and seeds the
synthetic demonstration organization on startup.
"""
import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db
import auth
import api
from seed import seed_demo_data

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
    await auth.seed_users()
    await seed_demo_data()
    logger.info("TUGMA startup complete: users + synthetic demo data seeded.")


@app.on_event("shutdown")
async def shutdown():
    db.client.close() if hasattr(db, "client") else None
