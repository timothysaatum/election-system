"""
Authentication Router
4-CHARACTER TOKENS + mandatory Student ID second factor
"""

import os
import uuid
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.config import settings
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
from app.crud.crud_voting_tokens import get_voting_token_by_hash
from app.utils.security import TokenManager, verify_password
from app.utils.security_audit import SecurityAuditLogger

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/verify-id", response_model=TokenVerificationResponse)
@rate_limit_auth
async def verify_voting_id(
    request: Request,
    verification_data: TokenVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify 4-character voting token + mandatory student ID, then create a
    30-minute voting session.

    Security measures applied here:
      • student_id is always required (second factor against brute force)
      • Failed attempts increment the token's failure_count; after
        TOKEN_MAX_FAILURES the token is auto-revoked at DB level
      • Successful auth resets the failure counter
      • All outcomes are written to the audit_logs table
    """
    client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

    # ── 1. Validate and normalise token ──────────────────────────────────────
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

    # ── 2. student_id is mandatory ────────────────────────────────────────────
    if not verification_data.student_id or not verification_data.student_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student ID is required",
        )

    # ── 3. Look up token ──────────────────────────────────────────────────────
    token_hash = hashlib.sha256(clean_token.encode()).hexdigest()
    voting_token = await get_voting_token_by_hash(db, token_hash)

    # Unified error — don't reveal whether token exists or student ID is wrong
    _auth_fail_detail = "Invalid token or student ID"

    if not voting_token:
        await SecurityAuditLogger.log_token_verified(
            db, "unknown", success=False, reason="token_not_found"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_auth_fail_detail)

    electorate = voting_token.electorate
    if not electorate or electorate.is_deleted or electorate.is_banned:
        await SecurityAuditLogger.log_token_verified(
            db, str(voting_token.electorate_id), success=False, reason="voter_not_found_or_banned"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")

    # ── 4. Check token validity ───────────────────────────────────────────────
    if voting_token.revoked:
        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="token_revoked"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    expires_at = voting_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="token_expired"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    # ── 5. Verify student ID (mandatory second factor) ────────────────────────
    provided_student_id = StudentIDConverter.normalize(verification_data.student_id)
    electorate_student_id = StudentIDConverter.normalize(electorate.student_id)

    if provided_student_id != electorate_student_id:
        # Increment failure counter — may auto-revoke the token
        auto_revoked = voting_token.increment_failure(
            max_failures=settings.TOKEN_MAX_FAILURES
        )
        await db.commit()

        if auto_revoked:
            await SecurityAuditLogger.log_token_auto_revoked(
                db,
                str(electorate.id),
                str(voting_token.id),
                f"Auto-revoked after {settings.TOKEN_MAX_FAILURES} failed student_id attempts",
            )
            await db.commit()

        await SecurityAuditLogger.log_token_verified(
            db, str(electorate.id), success=False, reason="student_id_mismatch"
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=_auth_fail_detail)

    # ── 6. Record successful use — reset failure counter ─────────────────────
    voting_token.record_successful_use()

    # ── 7. Create voting session ───────────────────────────────────────────────
    session_expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.SESSION_EXPIRE_MINUTES
    )
    session = VotingSession(
        electorate_id=electorate.id,
        session_token=str(uuid.uuid4()),   # always a proper UUID — no f-string
        device_fingerprint="offline",
        user_agent="offline",
        user_agent_hash="offline",
        ip_address=client_ip,
        login_method="offline_token",
        is_valid=True,
        expires_at=session_expires,
    )
    db.add(session)
    await db.flush()   # get session.id before commit

    # ── 8. Audit ──────────────────────────────────────────────────────────────
    await SecurityAuditLogger.log_token_verified(
        db, str(electorate.id), success=True
    )
    await SecurityAuditLogger.log_session_created(
        db, str(electorate.id), str(session.id), settings.SESSION_EXPIRE_MINUTES
    )
    await db.commit()
    await db.refresh(session)

    # ── 9. Generate JWT ───────────────────────────────────────────────────────
    access_token = TokenManager.create_access_token(
        data={
            "sub": str(electorate.id),
            "session_id": str(session.id),
            "type": "voting_session",
        },
        expires_delta=timedelta(minutes=settings.SESSION_EXPIRE_MINUTES),
        session_id=session.id,
    )

    # Clear IP-based rate limit on successful auth
    auth_rate_limiter.clear(client_ip)

    return TokenVerificationResponse(
        success=True,
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.SESSION_EXPIRE_MINUTES * 60,
        electorate=electorate,
    )


@router.get("/verify-session")
async def verify_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Verify current voting session status."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )

    token = auth_header.split(" ", 1)[1]
    try:
        payload = TokenManager.decode_token(token)
        session_id = payload.get("session_id")
        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No session found",
            )

        from sqlalchemy import select as sa_select
        result = await db.execute(
            sa_select(VotingSession).where(VotingSession.id == session_id)
        )
        session = result.scalar_one_or_none()

        if not session or not session.is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session",
            )

        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired",
            )

        time_remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds())
        return {
            "valid": True,
            "electorate_id": payload.get("sub"),
            "session_id": session_id,
            "expires_in": max(0, time_remaining),
        }

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(
    request: Request,
    login_data: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin/staff login — returns a scoped JWT."""
    client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

    all_users = get_all_users_from_env()
    if not all_users:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No admin users configured",
        )

    user_config = all_users.get(login_data.username)
    if not user_config or not verify_password(user_config["password_hash"], login_data.password):
        await SecurityAuditLogger.log(
            db,
            "admin_login_failed",
            actor_id=login_data.username,
            ip_address=client_ip,
            details={"reason": "invalid_credentials"},
            severity="WARNING",
            success=False,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

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
        db,
        "admin_login",
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
        db,
        "admin_logout",
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
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env in ("production", "prod"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Disabled in production",
        )

    if not password or len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )

    from argon2 import PasswordHasher
    ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, hash_len=32, salt_len=16)
    password_hash = ph.hash(password)

    return PasswordHashResponse(
        password_hash=password_hash,
        message="Copy this hash to your .env file",
    )


__all__ = ["router"]