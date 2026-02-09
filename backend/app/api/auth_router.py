"""
Offline Authentication Router
Simplified authentication for offline voting
"""

import os
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.middleware.auth_middleware import (
    get_all_users_from_env,
    get_current_user,
    rate_limit_auth
)
from app.models.electorates import VotingSession
from app.schemas.electorates import (
    AdminLoginRequest,
    AdminLoginResponse,
    PasswordHashResponse,
    TokenVerificationRequest,
    TokenVerificationResponse,
)
from app.crud.crud_voting_tokens import get_voting_token_by_hash, update_token_usage
from app.utils.security import TokenManager, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/verify-id", response_model=TokenVerificationResponse)
@rate_limit_auth
async def verify_voting_id(
    request: Request,
    verification_data: TokenVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify voting token and create session - OFFLINE MODE
    
    Args:
        request: HTTP request
        verification_data: Token verification data
        db: Database session
        
    Returns:
        TokenVerificationResponse with access token and electorate info
        
    Raises:
        HTTPException: If token is invalid, expired, or revoked
    """
    
    # Validate and normalize token
    token_input = verification_data.token.strip()
    if not token_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token cannot be empty"
        )
    
    # Clean and normalize token
    clean_token = token_input.replace("-", "").replace(" ", "").upper()
    
    if len(clean_token) != 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid token format. Expected 8 characters, got {len(clean_token)}"
        )
    
    if not clean_token.isalnum():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token must be alphanumeric"
        )
    
    # Find token by hash
    token_hash = hashlib.sha256(clean_token.encode()).hexdigest()
    voting_token = await get_voting_token_by_hash(db, token_hash)
    
    if not voting_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    # Check expiration
    expires_at = voting_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    
    # Check if revoked
    if voting_token.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revoked"
        )
    
    # Get electorate
    electorate = voting_token.electorate
    if not electorate or electorate.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voter not found"
        )
    
    # Update token usage
    await update_token_usage(db, voting_token.id)
    
    # Create voting session
    session = VotingSession(
        electorate_id=electorate.id,
        session_token=f"offline_{electorate.id}_{datetime.now(timezone.utc).timestamp()}",
        device_fingerprint="offline",
        user_agent="offline",
        user_agent_hash="offline",
        ip_address="127.0.0.1",
        login_method="offline_token",
        is_valid=True,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    # Generate JWT access token
    access_token = TokenManager.create_access_token(
        data={
            "sub": str(electorate.id),
            "session_id": str(session.id),
            "type": "voting_session",
        },
        expires_delta=timedelta(minutes=30),
        session_id=session.id,
    )
    
    return TokenVerificationResponse(
        access_token=access_token,
        token_type="bearer",
        valid=True,
        electorate=electorate,
        message="Token verified successfully",
    )


@router.get("/verify-session")
async def verify_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify current voting session status
    
    Args:
        request: HTTP request with authorization header
        db: Database session
        
    Returns:
        Session status information
        
    Raises:
        HTTPException: If session is invalid or expired
    """
    
    # Extract token from header
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )
    
    token = auth_header.split(" ")[1]
    
    try:
        # Decode token
        payload = TokenManager.decode_token(token)
        session_id = payload.get("session_id")
        
        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No session found"
            )
        
        # Get session from database
        session = await db.get(VotingSession, session_id)
        
        if not session or not session.is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid session"
            )
        
        # Check expiration
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired"
            )
        
        time_remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds())
        
        return {
            "valid": True,
            "electorate_id": payload.get("sub"),
            "session_id": session_id,
            "expires_in": max(0, time_remaining),
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(
    request: Request,
    login_data: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Admin/staff login
    
    Args:
        request: HTTP request
        login_data: Login credentials
        db: Database session
        
    Returns:
        AdminLoginResponse with access token
        
    Raises:
        HTTPException: If credentials are invalid
    """
    
    # Get all configured users
    all_users = get_all_users_from_env()
    
    if not all_users:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No admin users configured"
        )
    
    # Find user
    user_config = all_users.get(login_data.username)
    
    if not user_config:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Verify password
    if not verify_password(user_config["password_hash"], login_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Create access token
    access_token = TokenManager.create_access_token(
        data={
            "sub": user_config["username"],
            "role": user_config["role"],
            "type": "admin_access",
            "permissions": user_config["permissions"],
        },
        expires_delta=timedelta(hours=8),
    )
    
    return AdminLoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=28800,  # 8 hours
        username=user_config["username"],
        role=user_config["role"],
        permissions=user_config["permissions"],
        is_admin=user_config["role"] == "admin",
    )


@router.post("/admin/logout")
async def admin_logout(
    request: Request,
    admin: dict = Depends(get_current_user),
):
    """
    Admin logout
    
    Args:
        request: HTTP request
        admin: Current admin user
        
    Returns:
        Logout confirmation
    """
    return {
        "message": "Logged out successfully",
        "username": admin["username"]
    }


@router.get("/admin/verify")
async def verify_admin_token(current_user: dict = Depends(get_current_user)):
    """
    Verify admin token validity
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        Token verification information
    """
    return {
        "valid": True,
        "username": current_user["username"],
        "role": current_user["role"],
        "permissions": current_user["permissions"],
        "is_admin": current_user["is_admin"],
    }


@router.post("/generate-password-hash", response_model=PasswordHashResponse)
async def generate_password_hash(password: str):
    """
    Generate password hash for .env file (development only)
    
    Args:
        password: Plain text password
        
    Returns:
        PasswordHashResponse with hash
        
    Raises:
        HTTPException: If used in production or password is too short
    """
    
    # Disable in production
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env in ["production", "prod"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Disabled in production for security"
        )
    
    # Validate password
    if not password or len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )
    
    # Generate hash
    from argon2 import PasswordHasher
    
    ph = PasswordHasher(
        time_cost=3,
        memory_cost=65536,
        parallelism=1,
        hash_len=32,
        salt_len=16
    )
    password_hash = ph.hash(password)
    
    return PasswordHashResponse(
        password_hash=password_hash,
        message="Copy this hash to your .env file"
    )


__all__ = ["router"]