"""
Offline Election System Authentication Middleware
Simplified authentication without device fingerprinting
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
from app.models.electorates import Electorate, VotingSession
from app.utils.security import TokenManager, verify_password
from sqlalchemy.future import select

logger = logging.getLogger(__name__)

security_scheme = HTTPBearer()
admin_security_scheme = HTTPBearer()


# ============================================================================
# ROLE-BASED USER CONFIGURATION
# ============================================================================

def get_all_users_from_env() -> Dict[str, dict]:
    """
    Parse all users from environment variables with role-based prefixes.
    
    Returns:
        Dictionary of users keyed by username
    """
    users = {}
    
    import re
    
    # Admin users
    admin_users_str = os.getenv("ADMIN_USERS", "")
    if admin_users_str:
        entries = re.split(r",(?=[a-zA-Z0-9_]+:)", admin_users_str)
        for user_entry in entries:
            user_entry = user_entry.strip()
            if ":" in user_entry:
                username, password_hash = user_entry.split(":", 1)
                users[username] = {
                    "username": username,
                    "password_hash": password_hash,
                    "role": "admin",
                    "permissions": _get_permissions_for_role("admin"),
                }
    
    # EC Official users
    ec_users_str = os.getenv("EC_OFFICIAL_USERS", "")
    if ec_users_str:
        entries = re.split(r",(?=[a-zA-Z0-9_]+:)", ec_users_str)
        for user_entry in entries:
            user_entry = user_entry.strip()
            if ":" in user_entry:
                username, password_hash = user_entry.split(":", 1)
                users[username] = {
                    "username": username,
                    "password_hash": password_hash,
                    "role": "ec_official",
                    "permissions": _get_permissions_for_role("ec_official"),
                }
    
    # Polling Agent users
    agent_users_str = os.getenv("POLLING_AGENT_USERS", "")
    if agent_users_str:
        entries = re.split(r",(?=[a-zA-Z0-9_]+:)", agent_users_str)
        for user_entry in entries:
            user_entry = user_entry.strip()
            if ":" in user_entry:
                username, password_hash = user_entry.split(":", 1)
                users[username] = {
                    "username": username,
                    "password_hash": password_hash,
                    "role": "polling_agent",
                    "permissions": _get_permissions_for_role("polling_agent"),
                }
    
    return users


def _get_permissions_for_role(role: str) -> List[str]:
    """Get default permissions for each role"""
    permissions_map = {
        "admin": [
            "manage_portfolios",
            "manage_candidates",
            "manage_elections",
            "manage_electorates",
            "generate_tokens",
            "view_results",
            "manage_users",
        ],
        "ec_official": [
            "generate_tokens",
            "view_electorates",
            "verify_voters"
        ],
        "polling_agent": [
            "view_results",
            "view_statistics"
        ],
    }
    return permissions_map.get(role, [])


def get_user_by_username(username: str) -> Optional[dict]:
    """Get user configuration by username"""
    all_users = get_all_users_from_env()
    return all_users.get(username)


# ============================================================================
# ADMIN/STAFF AUTHENTICATION
# ============================================================================

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(admin_security_scheme),
) -> dict:
    """
    Get current authenticated admin/staff user
    
    Returns:
        User dict with username, role, permissions, is_admin
        
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials

    try:
        # Decode JWT token
        payload = TokenManager.decode_token(token)
        username = payload.get("sub")
        role = payload.get("role")
        token_type = payload.get("type")

        # Validate token type
        if token_type not in ["admin_access", "access", None]:
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

        # Verify valid role
        if role not in ["admin", "ec_official", "polling_agent"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid user role",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify user exists
        user_config = get_user_by_username(username)
        if not user_config:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Verify role matches
        if user_config["role"] != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role mismatch",
                headers={"WWW-Authenticate": "Bearer"},
            )

        logger.info(f"Admin access - Username: {username}, Role: {role}")

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
    """
    Require admin role
    
    Returns:
        Admin user dict
        
    Raises:
        HTTPException: If user is not admin
    """
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
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
    Get current authenticated voter
    
    Returns:
        Electorate object
        
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials

    try:
        # Decode JWT token
        payload = TokenManager.decode_token(token)
        voter_id = payload.get("sub")
        session_id = payload.get("session_id")
        token_type = payload.get("type")

        # Validate token type
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

        # Get voter from database
        result = await db.execute(
            select(Electorate).where(Electorate.id == UUID(voter_id))
        )
        voter = result.scalar_one_or_none()

        if not voter or voter.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Voter not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Validate session if session_id is present
        if session_id:
            session = await _validate_voter_session(db, UUID(session_id), voter.id)
            if not session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session expired. Please login again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        return voter

    except (JWTError, ValueError) as e:
        logger.warning(f"Invalid voter authentication: {str(e)}")
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
    """
    Validate voting session
    
    Returns:
        VotingSession if valid, None otherwise
    """
    result = await db.execute(
        select(VotingSession).where(VotingSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        return None

    # Check expiration
    expires_at = session.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if not session.is_valid or expires_at < datetime.now(timezone.utc):
        if session.is_valid:
            session.terminate("Session expired")
            await db.commit()
        return None

    # Verify electorate matches
    if session.electorate_id != electorate_id:
        session.terminate("Session mismatch")
        await db.commit()
        return None

    # Update activity
    session.update_activity("offline")
    await db.commit()
    
    return session


# ============================================================================
# RATE LIMITING
# ============================================================================

class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.attempts = defaultdict(list)

    def is_rate_limited(self, identifier: str) -> bool:
        """
        Check if identifier is rate limited
        
        Args:
            identifier: Unique identifier (IP, user ID, etc.)
            
        Returns:
            True if rate limited
        """
        now = time.time()
        
        # Clean old attempts
        self.attempts[identifier] = [
            attempt_time
            for attempt_time in self.attempts[identifier]
            if now - attempt_time < self.window_seconds
        ]

        # Check limit
        if len(self.attempts[identifier]) >= self.max_attempts:
            return True

        # Record attempt
        self.attempts[identifier].append(now)
        return False


# Rate limiter instances
auth_rate_limiter = RateLimiter(max_attempts=10, window_seconds=300)  # 10 attempts per 5 min
voting_rate_limiter = RateLimiter(max_attempts=5, window_seconds=60)  # 5 attempts per min


def rate_limit_auth(func):
    """Decorator to rate limit authentication endpoints"""
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        # Use IP address for rate limiting
        client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

        if auth_rate_limiter.is_rate_limited(client_ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
            )

        return await func(request, *args, **kwargs)

    return wrapper


def rate_limit_voting(func):
    """Decorator to rate limit voting endpoints"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # Get request object
        request = kwargs.get("request") or next(
            (a for a in args if isinstance(a, Request)), None
        )

        if not request:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Request object not found",
            )

        # Use IP address for rate limiting
        client_ip = getattr(request.client, "host", "unknown") if request.client else "unknown"

        if voting_rate_limiter.is_rate_limited(client_ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many voting attempts. Please wait.",
            )

        return await func(*args, **kwargs)

    return wrapper


# ============================================================================
# AUDIT LOGGING
# ============================================================================

class SecurityAuditLogger:
    """Security audit logging"""
    
    @staticmethod
    def log_successful_auth(electorate_id: str, ip_address: str):
        logger.info(f"Successful auth - Voter: {electorate_id}, IP: {ip_address}")

    @staticmethod
    def log_failed_auth(reason: str, ip_address: str):
        logger.warning(f"Failed auth - Reason: {reason}, IP: {ip_address}")

    @staticmethod
    def log_session_creation(electorate_id: str, ip_address: str, duration: int):
        logger.info(f"Session created - Voter: {electorate_id}, IP: {ip_address}, Duration: {duration}min")

    @staticmethod
    def log_admin_action(username: str, action: str, resource: str, details: dict = None):
        role = details.get("role", "unknown") if details else "unknown"
        logger.info(f"Admin action - User: {username}, Role: {role}, Action: {action}, Resource: {resource}")


__all__ = [
    "get_current_user",
    "get_current_admin",
    "get_current_voter",
    "rate_limit_auth",
    "rate_limit_voting",
    "get_all_users_from_env",
    "SecurityAuditLogger",
]