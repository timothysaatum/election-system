"""
Authentication Router
4-CHARACTER TOKENS + mandatory Student ID second factor

Voter flow:
  POST /auth/verify-id  →  4-char token + student_id
                        →  JWT with election_id + voting_token_id embedded

Admin/staff flow:
  POST /auth/login  →  username + password  →  scoped JWT
"""

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.crud.election import get_active_election
from app.crud.crud_voting_tokens import get_voting_token_by_plaintext
from app.middleware.auth_middleware import (
    get_all_users_from_env,
    get_current_user,
    rate_limit_auth,
    auth_rate_limiter,
)
from app.models.electorates import VotingSession
from app.schemas.electorates import (
    AdminLoginRequest,
    AdminLoginResponse,
    PasswordHashResponse,
    TokenVerificationRequest,
    TokenVerificationResponse,
    StudentIDConverter,
)
from app.utils.security import TokenManager, verify_password
from app.utils.security_audit import SecurityAuditLogger

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

_AUTH_FAIL = "Invalid token or student ID"


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return getattr(request.client, "host", "unknown") if request.client else "unknown"


# ---------------------------------------------------------------------------
# Voter token verification
# ---------------------------------------------------------------------------

@router.post("/verify-id", response_model=TokenVerificationResponse)
@rate_limit_auth
async def verify_voting_id(
    request: Request,
    verification_data: TokenVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify 4-character voting token + mandatory student ID.

    Returns a JWT that embeds election_id and voting_token_id so all
    downstream voting endpoints are automatically scoped without needing
    those as query params.

    Security layers:
      • student_id required as second factor (prevents brute-force)
      • Failed student_id attempts increment token.failure_count;
        after TOKEN_MAX_FAILURES the token is auto-revoked
      • Per-IP rate limiting via @rate_limit_auth decorator
      • All outcomes written to audit_logs
    """
    client_ip = _client_ip(request)

    # ── 1. Validate and normalise token ──────────────────────────────────
    token_input = (verification_data.token or "").strip()
    if not token_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token cannot be empty")

    clean_token = token_input.replace("-", "").replace(" ", "").upper()
    if len(clean_token) != settings.VOTING_TOKEN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid token format. Expected {settings.VOTING_TOKEN_LENGTH} characters.",
        )
    if not clean_token.isalnum():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token must be alphanumeric",
        )

    # ── 2. student_id is mandatory ────────────────────────────────────────
    if not verification_data.student_id or not verification_data.student_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student ID is required",
        )

    # ── 3. Find the currently active election ────────────────────────────
    election = await get_active_election(db)
    if not election:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No election is currently open for voting",
        )

    # ── 4. Look up token (hashes internally, scoped to this election) ────
    voting_token = await get_voting_token_by_plaintext(db, clean_token, election.id)

    if not voting_token:
        await SecurityAuditLogger.log_token_verified(
            db, "unknown", success=False, reason="token_not_found"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_AUTH_FAIL)

    electorate = voting_token.electorate
    if not electorate or electorate.is_deleted or electorate.is_banned:
        await SecurityAuditLogger.log_token_verified(
            db, str(voting_token.electorate_id),
            success=False, reason="voter_not_found_or_banned",
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")

    # ── 5. Check token validity ───────────────────────────────────────────
    if voting_token.is_used:
        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="token_already_used"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="You have already voted")

    if voting_token.revoked:
        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="token_revoked"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    expires_at = voting_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="token_expired"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")

    # ── 6. Verify student ID (second factor) ─────────────────────────────
    provided_id = StudentIDConverter.normalize(verification_data.student_id)
    stored_id = StudentIDConverter.normalize(electorate.student_id)

    if provided_id != stored_id:
        auto_revoked = voting_token.increment_failure(max_failures=settings.TOKEN_MAX_FAILURES)
        await db.commit()
        if auto_revoked:
            await SecurityAuditLogger.log_token_auto_revoked(
                db, str(electorate.id), str(voting_token.id),
                f"Auto-revoked after {settings.TOKEN_MAX_FAILURES} failed student_id attempts",
            )
            await db.commit()
        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="student_id_mismatch"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_AUTH_FAIL)

    # ── 7. Record successful use (resets failure counter) ─────────────────
    voting_token.record_use()   # was record_successful_use() — wrong name, caused AttributeError

    # ── 8. Create voting session ──────────────────────────────────────────
    session_expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.SESSION_EXPIRE_MINUTES
    )
    session = VotingSession(
        electorate_id=electorate.id,
        election_id=election.id,              # was missing — NOT NULL violation
        voting_token_id=voting_token.id,      # was missing — NOT NULL violation
        session_token=str(uuid.uuid4()),
        station_identifier=client_ip,         # replaces deleted device_fingerprint column
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent", "offline"),
        # device_fingerprint, user_agent_hash — removed, columns don't exist on model
        login_method="offline_token",
        is_valid=True,
        expires_at=session_expires,
    )
    db.add(session)
    await db.flush()

    # ── 9. Audit ──────────────────────────────────────────────────────────
    await SecurityAuditLogger.log_token_verified(db, str(electorate.id), success=True)
    await SecurityAuditLogger.log_session_created(
        db, str(electorate.id), str(session.id), settings.SESSION_EXPIRE_MINUTES
    )
    await db.commit()
    await db.refresh(session)

    # ── 10. Issue JWT — embeds election_id and voting_token_id ────────────
    access_token = TokenManager.create_access_token(
        data={
            "sub": str(electorate.id),
            "session_id": str(session.id),
            "election_id": str(election.id),         # consumed by voting_router
            "voting_token_id": str(voting_token.id), # consumed by voting_router
            "type": "voting_session",
        },
        expires_delta=timedelta(minutes=settings.SESSION_EXPIRE_MINUTES),
        session_id=session.id,
    )

    auth_rate_limiter.clear(client_ip)

    return TokenVerificationResponse(
        success=True,
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.SESSION_EXPIRE_MINUTES * 60,
        electorate=electorate,
    )


# ---------------------------------------------------------------------------
# Session status
# ---------------------------------------------------------------------------

@router.get("/verify-session")
async def verify_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Check whether the current voting-session JWT is still valid."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    try:
        payload = TokenManager.decode_token(auth_header.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    session_id = payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No session found")

    result = await db.execute(
        select(VotingSession).where(VotingSession.id == UUID(session_id))
    )
    session = result.scalar_one_or_none()

    if not session or not session.is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    time_remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds())
    return {
        "valid": True,
        "electorate_id": payload.get("sub"),
        "election_id": payload.get("election_id"),
        "session_id": session_id,
        "expires_in": max(0, time_remaining),
    }


# ---------------------------------------------------------------------------
# Admin / staff login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(
    request: Request,
    login_data: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin/EC Official/Polling Agent login — returns a scoped JWT."""
    client_ip = _client_ip(request)

    all_users = get_all_users_from_env()
    if not all_users:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No admin users configured",
        )

    user_config = all_users.get(login_data.username)
    if not user_config or not verify_password(user_config["password_hash"], login_data.password):
        await SecurityAuditLogger.log(
            db, "admin_login_failed",
            actor_id=login_data.username,
            ip_address=client_ip,
            details={"reason": "invalid_credentials"},
            severity="WARNING",
            success=False,
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = TokenManager.create_access_token(
        data={
            "sub": user_config["username"],
            "role": user_config["role"],
            "type": "admin_access",
            "permissions": user_config["permissions"],
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    await SecurityAuditLogger.log(
        db, "admin_login",
        actor_id=user_config["username"],
        actor_role=user_config["role"],
        ip_address=client_ip,
        severity="INFO",
        success=True,
    )
    await db.commit()

    return AdminLoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        username=user_config["username"],
        role=user_config["role"],
        permissions=user_config["permissions"],
        is_admin=user_config["role"] == "admin",
    )


@router.post("/admin/logout")
async def admin_logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_user),
):
    """Admin logout."""
    await SecurityAuditLogger.log(
        db, "admin_logout",
        actor_id=admin["username"],
        actor_role=admin["role"],
        severity="INFO",
        success=True,
    )
    await db.commit()
    return {"message": "Logged out successfully", "username": admin["username"]}


@router.get("/admin/verify")
async def verify_admin_token(current_user: dict = Depends(get_current_user)):
    """Verify admin token validity."""
    return {
        "valid": True,
        "username": current_user["username"],
        "role": current_user["role"],
        "permissions": current_user["permissions"],
        "is_admin": current_user["is_admin"],
    }


@router.post("/generate-password-hash", response_model=PasswordHashResponse)
async def generate_password_hash(password: str):
    """Generate Argon2 password hash (development only)."""
    if os.getenv("ENVIRONMENT", "development").lower() in ("production", "prod"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Disabled in production")
    if not password or len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )
    from argon2 import PasswordHasher
    ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, hash_len=32, salt_len=16)
    return PasswordHashResponse(
        password_hash=ph.hash(password),
        message="Copy this hash to your .env file",
    )


__all__ = ["router"]