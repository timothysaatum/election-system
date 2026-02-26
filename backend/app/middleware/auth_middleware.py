"""
Offline Election System Authentication Middleware
Role-based auth, per-token failure lockout, and in-process rate limiting.

NOTE ON RATE LIMITING:
  The in-memory RateLimiter below is per-worker-process.  With WORKERS=4,
  the effective limit is RATE_LIMIT_AUTH_REQUESTS × 4 across all workers.
  Settings are intentionally conservative (5 attempts / 5 min) so that even
  in the worst case (4 workers × 5) = 20 attempts remain well below the
  ~1M token space.  The per-token failure lockout (TOKEN_MAX_FAILURES=5) is
  the primary brute-force defence and IS enforced at DB level per token.
"""

import os
from uuid import UUID
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from typing import Dict, Optional, List
import logging
from functools import wraps
from collections import defaultdict
import time

from app.core.database import get_db
from app.core.config import settings
from app.models.electorates import Electorate, VotingSession
from app.utils.security import TokenManager, verify_password
from sqlalchemy.future import select

logger = logging.getLogger(__name__)


class FlexibleHTTPBearer(HTTPBearer):
    """
    Extends HTTPBearer to also accept the JWT via a ?token= query parameter.
    Required for SSE / EventSource connections which cannot set custom headers.

    Priority:
      1. Authorization: Bearer <token>  (standard — all normal requests)
      2. ?token=<token>                 (query param fallback — SSE only)

    Security note: tokens passed via query param appear in access logs.
    For an offline LAN system this is acceptable.  If logs are a concern,
    consider a short-lived SSE ticket exchange instead.
    """

    async def __call__(self, request: Request) -> HTTPAuthorizationCredentials:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            if token:
                return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        token = request.query_params.get("token", "").strip()
        if token:
            return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated",
        )


security_scheme = FlexibleHTTPBearer()
admin_security_scheme = FlexibleHTTPBearer()


# ============================================================================
# ROLE-BASED USER CONFIGURATION
# ============================================================================

def get_all_users_from_env() -> Dict[str, dict]:
    """Parse all users from environment variables with role-based prefixes."""
    import re
    users = {}

    role_map = {
        "ADMIN_USERS": "admin",
        "EC_OFFICIAL_USERS": "ec_official",
        "POLLING_AGENT_USERS": "polling_agent",
    }

    for env_var, role in role_map.items():
        raw = os.getenv(env_var, "")
        if not raw:
            continue
        for entry in re.split(r",(?=[a-zA-Z0-9_]+:)", raw):
            entry = entry.strip()
            if ":" not in entry:
                continue
            username, password_hash = entry.split(":", 1)
            users[username] = {
                "username": username,
                "password_hash": password_hash,
                "role": role,
                "permissions": _get_permissions_for_role(role),
            }

    return users


def _get_permissions_for_role(role: str) -> List[str]:
    permissions_map = {
        "admin": [
            "manage_portfolios",
            "manage_candidates",
            "manage_elections",
            "manage_electorates",
            "generate_tokens",
            "view_results",
            "manage_users",
            "view_statistics",
            "view_voters",
        ],
        "ec_official": [
            "generate_tokens",
            "view_electorates",
            "verify_voters",
            "view_statistics",
            "view_voters"
        ],
        "polling_agent": [
            "view_results",
            "view_statistics",
        ],
    }
    return permissions_map.get(role, [])


def get_user_by_username(username: str) -> Optional[dict]:
    return get_all_users_from_env().get(username)


# ============================================================================
# PERMISSION HELPERS
# ============================================================================

def require_permission(permission: str):
    """
    FastAPI dependency factory — raises 403 if the current user lacks
    the specified permission.

    Usage:
        @router.get("/sensitive")
        async def endpoint(user=Depends(require_permission("manage_electorates"))):
            ...
    """
    async def _checker(current_user: dict = Depends(get_current_user)) -> dict:
        if permission not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required",
            )
        return current_user
    return _checker


# ============================================================================
# ADMIN/STAFF AUTHENTICATION
# ============================================================================

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(admin_security_scheme),
) -> dict:
    """
    Validate a Bearer JWT and return the user dict.
    Accepts tokens of type 'admin_access' or 'access' (any role).
    """
    token = credentials.credentials
    try:
        payload = TokenManager.decode_token(token)
        username: str = payload.get("sub")
        role: str = payload.get("role")
        token_type: str = payload.get("type")

        if token_type not in ("admin_access", "access", None):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if role not in ("admin", "ec_official", "polling_agent"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid user role",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_config = get_user_by_username(username)
        if not user_config:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if user_config["role"] != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role mismatch",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return {
            "username": user_config["username"],
            "role": user_config["role"],
            "permissions": user_config["permissions"],
            "is_admin": user_config["role"] == "admin",
        }

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Require admin role explicitly."""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


# ============================================================================
# VOTER AUTHENTICATION
# ============================================================================

async def get_current_voter(
    request: Request,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> Electorate:
    """
    Validate a voter JWT, verify the session is still live, and return
    the Electorate ORM object.
    """
    token = credentials.credentials
    try:
        payload = TokenManager.decode_token(token)
        voter_id: str = payload.get("sub")
        session_id: str = payload.get("session_id")
        token_type: str = payload.get("type")

        if token_type != "voting_session":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not voter_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        result = await db.execute(
            select(Electorate).where(Electorate.id == UUID(voter_id))
        )
        voter = result.scalar_one_or_none()

        if not voter or voter.is_deleted or voter.is_banned:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Voter not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if session_id:
            session = await _validate_voter_session(db, UUID(session_id), voter.id)
            if not session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired. Please log in again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        return voter

    except (JWTError, ValueError) as exc:
        logger.warning("Invalid voter authentication: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def _validate_voter_session(
    db: AsyncSession,
    session_id: UUID,
    electorate_id: UUID,
) -> Optional[VotingSession]:
    """Validate a VotingSession and update its activity timestamp."""
    result = await db.execute(
        select(VotingSession).where(VotingSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        return None

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not session.is_valid or expires_at < datetime.now(timezone.utc):
        if session.is_valid:
            session.terminate("Session expired")
            await db.commit()
        return None

    if session.electorate_id != electorate_id:
        session.terminate("Session electorate mismatch")
        await db.commit()
        return None

    session.update_activity("offline")
    await db.commit()
    return session


# ============================================================================
# RATE LIMITING
# ============================================================================

class RateLimiter:
    """
    Simple sliding-window in-memory rate limiter (per process).
    Intentionally conservative limits compensate for multi-worker state isolation.
    """

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict = defaultdict(list)

    def is_rate_limited(self, identifier: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        # Expire old entries
        self._attempts[identifier] = [
            t for t in self._attempts[identifier] if t > cutoff
        ]
        if len(self._attempts[identifier]) >= self.max_attempts:
            return True
        self._attempts[identifier].append(now)
        return False

    def clear(self, identifier: str):
        """Explicitly clear attempts for an identifier (e.g. after successful auth)."""
        self._attempts.pop(identifier, None)


auth_rate_limiter = RateLimiter(
    max_attempts=settings.RATE_LIMIT_AUTH_REQUESTS,
    window_seconds=settings.RATE_LIMIT_AUTH_WINDOW,
)
voting_rate_limiter = RateLimiter(
    max_attempts=settings.RATE_LIMIT_VOTE_REQUESTS,
    window_seconds=settings.RATE_LIMIT_VOTE_WINDOW,
)


def rate_limit_auth(func):
    """Decorator: rate-limit authentication endpoints by client IP."""
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"
        if auth_rate_limiter.is_rate_limited(client_ip):
            logger.warning("Auth rate limit hit for IP: %s", client_ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
            )
        return await func(request, *args, **kwargs)
    return wrapper


def rate_limit_voting(func):
    """Decorator: rate-limit voting endpoints by client IP."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        request: Optional[Request] = kwargs.get("request") or next(
            (a for a in args if isinstance(a, Request)), None
        )
        if not request:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Request object not found in voting rate limiter",
            )
        client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"
        if voting_rate_limiter.is_rate_limited(client_ip):
            logger.warning("Voting rate limit hit for IP: %s", client_ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many voting attempts. Please wait.",
            )
        return await func(*args, **kwargs)
    return wrapper


# ============================================================================
# AUDIT LOGGING (thin compatibility shim — real logging via SecurityAuditLogger)
# ============================================================================

class SecurityAuditLogger:
    """Synchronous shim kept for backward-compatibility with existing call sites."""

    @staticmethod
    def log_successful_auth(electorate_id: str, ip_address: str):
        logger.info("Successful auth - Voter: %s, IP: %s", electorate_id, ip_address)

    @staticmethod
    def log_failed_auth(reason: str, ip_address: str):
        logger.warning("Failed auth - Reason: %s, IP: %s", reason, ip_address)

    @staticmethod
    def log_session_creation(electorate_id: str, ip_address: str, duration: int):
        logger.info(
            "Session created - Voter: %s, IP: %s, Duration: %dmin",
            electorate_id, ip_address, duration,
        )

    @staticmethod
    def log_admin_action(username: str, action: str, resource: str, details: dict = None):
        role = (details or {}).get("role", "unknown")
        logger.info(
            "Admin action - User: %s, Role: %s, Action: %s, Resource: %s",
            username, role, action, resource,
        )


__all__ = [
    "get_current_user",
    "get_current_admin",
    "get_current_voter",
    "require_permission",
    "rate_limit_auth",
    "rate_limit_voting",
    "get_all_users_from_env",
    "SecurityAuditLogger",
    "auth_rate_limiter",
    "voting_rate_limiter",
]