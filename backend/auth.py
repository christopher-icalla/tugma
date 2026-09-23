"""Custom email/password JWT authentication for TUGMA.

Roles are RegTech-specific (ADMIN, PAYMENT_OPS, COMPLIANCE, RISK, FINANCE,
AUDITOR, VIEWER). Users belong to a single organization (organization_id).
"""
import os
import uuid
import logging
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from html import escape
from urllib.parse import urlparse

import bcrypt
import jwt
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel

from db import db, DEMO_ORG_ID

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"

ROLES = ["ADMIN", "PAYMENT_OPS", "COMPLIANCE", "RISK", "FINANCE", "AUDITOR", "VIEWER"]

# ---- RBAC permission matrix (single-org app: Layer 1 roles + SoD on verify) --
_OPERATIONAL = {"ADMIN", "PAYMENT_OPS", "COMPLIANCE", "RISK", "FINANCE"}
PERMISSIONS = {
    "exception:assign": _OPERATIONAL,
    "exception:transition": _OPERATIONAL,
    "exception:remediate": _OPERATIONAL,
    "exception:comment": _OPERATIONAL,
    "evidence:create": _OPERATIONAL,
    "exception:verify": {"ADMIN", "COMPLIANCE", "RISK"},
    "package:generate": {"ADMIN", "COMPLIANCE"},
    "audit:read": {"ADMIN", "COMPLIANCE", "AUDITOR"},
}


def can(role: str, action: str) -> bool:
    return role in PERMISSIONS.get(action, set())


def require_perm(action: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if not can(user.get("role"), action):
            raise HTTPException(status_code=403,
                                detail=f"Your role ({user.get('role')}) is not permitted to {action.replace(':', ' ')}.")
        return user
    return checker

MAX_FAILED = 5
LOCKOUT_MINUTES = 15
RESET_WINDOW_SECONDS = 900
RESET_MAX_REQUESTS = 5

EMAIL_BASE_URL = (os.environ.get("EMAIL_API_URL") or "").strip().rstrip("/")
EMAIL_KEY = os.environ.get("EMAIL_API_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "TUGMA"


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ------------------------------------------------------------------- tokens
def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def _public_user(user: dict) -> dict:
    user = dict(user)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


# --------------------------------------------------------------- dependency
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        return _public_user(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*allowed: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403,
                                detail="Your role does not have access to this resource.")
        return user
    return checker


# ------------------------------------------------------------------- models
class LoginInput(BaseModel):
    email: str
    password: str


class ForgotInput(BaseModel):
    email: str


class ResetInput(BaseModel):
    token: str
    password: str


# --------------------------------------------------------------- brute force
async def _is_locked(identifier: str) -> bool:
    doc = await db.login_attempts.find_one({"identifier": identifier})
    if not doc:
        return False
    if doc.get("count", 0) >= MAX_FAILED:
        locked_until = doc.get("locked_until")
        if locked_until and datetime.now(timezone.utc) < datetime.fromisoformat(locked_until):
            return True
    return False


async def _record_failure(identifier: str, email: str):
    now = datetime.now(timezone.utc)
    doc = await db.login_attempts.find_one({"identifier": identifier})
    count = (doc.get("count", 0) if doc else 0) + 1
    update = {"identifier": identifier, "email": email, "count": count,
              "updated_at": now.isoformat()}
    if count >= MAX_FAILED:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)


# ------------------------------------------------------------------- emails
async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>We received a request to reset your {brand} password.</p>'
        f'<p><a href="{escape(link)}">Reset your password</a></p>'
        f'<p>This link expires in 1 hour and can be used once. If you did not request it, '
        f'ignore this email — your password is unchanged.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as http_client:
            resp = await http_client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Reset your {EMAIL_FROM_NAME} password",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


# ---------------------------------------------------------------- endpoints
router = APIRouter(prefix="/api/auth", tags=["auth"])
GENERIC_RESET = {"message": "If that email is registered, a reset link has been sent."}


@router.post("/login")
async def login(payload: LoginInput, request: Request, response: Response):
    email = payload.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    if await _is_locked(identifier):
        raise HTTPException(status_code=429,
                            detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await _record_failure(identifier, email)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    await db.login_attempts.delete_many({"identifier": identifier})
    ver = user.get("token_version", 0)
    _set_auth_cookies(response,
                      create_access_token(user["id"], email, ver),
                      create_refresh_token(user["id"], ver))
    return _public_user(user)


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    ver = user.get("token_version", 0)
    response.set_cookie("access_token", create_access_token(user["id"], user["email"], ver),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    return {"message": "refreshed"}


@router.post("/forgot-password")
async def forgot_password(payload: ForgotInput, background_tasks: BackgroundTasks):
    email = payload.email.strip().lower()
    now = datetime.now(timezone.utc)
    await db.password_reset_requests.insert_one({"email": email, "created_at": now.isoformat()})
    window_start = (now - timedelta(seconds=RESET_WINDOW_SECONDS)).isoformat()
    count = await db.password_reset_requests.count_documents(
        {"email": email, "created_at": {"$gte": window_start}})
    if count > RESET_MAX_REQUESTS:
        return GENERIC_RESET
    user = await db.users.find_one({"email": email})
    if not user:
        return GENERIC_RESET
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["id"], "email": email,
        "expires_at": (now + timedelta(hours=1)).isoformat(), "used": False})
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return GENERIC_RESET


@router.post("/reset-password")
async def reset_password(payload: ResetInput):
    h = hashlib.sha256(payload.token.encode()).hexdigest()
    now_iso = datetime.now(timezone.utc).isoformat()
    claimed = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": now_iso}},
        {"$set": {"used": True}})
    if not claimed:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
    email = claimed["email"]
    await db.users.update_one(
        {"id": claimed["user_id"]},
        {"$set": {"password_hash": hash_password(payload.password)},
         "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": claimed["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": email})
    return {"message": "Password updated. You can now sign in."}


# ---------------------------------------------------------------- seeding
DEMO_USERS = [
    {"email": "compliance@tugmademo.ph", "name": "Maria Reyes", "role": "COMPLIANCE",
     "title": "Chief Compliance Officer"},
    {"email": "risk@tugmademo.ph", "name": "Antonio Cruz", "role": "RISK",
     "title": "Risk Officer"},
    {"email": "ops@tugmademo.ph", "name": "Liza Santos", "role": "PAYMENT_OPS",
     "title": "Payment Operations Manager"},
    {"email": "finance@tugmademo.ph", "name": "Ramon Bautista", "role": "FINANCE",
     "title": "Chief Financial Officer"},
    {"email": "auditor@tugmademo.ph", "name": "Grace Villanueva", "role": "AUDITOR",
     "title": "Internal Audit Lead"},
    {"email": "viewer@tugmademo.ph", "name": "Paolo Mendoza", "role": "VIEWER",
     "title": "Observer"},
]


async def seed_users():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").strip().lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    demo_password = os.environ["DEMO_USER_PASSWORD"]

    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_password(admin_password), "name": "TUGMA Administrator",
            "role": "ADMIN", "title": "Administrator", "organization_id": DEMO_ORG_ID,
            "token_version": 0, "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})

    for u in DEMO_USERS:
        if not await db.users.find_one({"email": u["email"]}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()), **u,
                "password_hash": hash_password(demo_password),
                "organization_id": DEMO_ORG_ID, "token_version": 0,
                "created_at": datetime.now(timezone.utc).isoformat()})
