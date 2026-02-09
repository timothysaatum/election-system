"""
Offline Election System Security Utilities
Simplified security without device fingerprinting or online dependencies
"""

from argon2 import PasswordHasher
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from typing import Optional
import os
import hashlib
import secrets
from uuid import UUID

from dotenv import load_dotenv

load_dotenv()

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY")
assert SECRET_KEY, "SECRET_KEY is not set in the .env file"

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
VOTING_TOKEN_EXPIRE_HOURS = int(os.getenv("VOTING_TOKEN_EXPIRE_HOURS", "24"))

# Argon2 password hashing configuration
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16
)


class FriendlyTokenGenerator:
    """Generate user-friendly voting tokens for offline use"""

    # Exclude confusing characters: 0, O, I, l, 1
    SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    @staticmethod
    def generate_voting_token(length: int = 8) -> str:
        """
        Generate voting token in format: AB12-CD34
        
        Args:
            length: Total length (default 8 for AB12-CD34 format)
            
        Returns:
            Formatted voting token
        """
        chars = FriendlyTokenGenerator.SAFE_CHARS
        code = ''.join(secrets.choice(chars) for _ in range(length))
        
        # Format as AB12-CD34
        if length == 8:
            return f"{code[:2]}{code[2:4]}-{code[4:6]}{code[6:8]}"
        
        # For other lengths, add hyphens every 4 characters
        return '-'.join([code[i:i+4] for i in range(0, len(code), 4)])

    @staticmethod
    def validate_token_format(token: str, expected_length: int = 8) -> bool:
        """
        Validate token format (accepts all alphanumeric)
        
        Args:
            token: Token to validate
            expected_length: Expected length without hyphens
            
        Returns:
            True if valid format
        """
        if not token:
            return False

        # Remove hyphens and spaces, convert to uppercase
        clean_token = token.replace("-", "").replace(" ", "").upper()

        # Check length
        if len(clean_token) != expected_length:
            return False

        # Accept all alphanumeric characters
        return clean_token.isalnum()

    @staticmethod
    def normalize_token(token: str) -> str:
        """
        Normalize token for consistent comparison
        
        Returns:
            Cleaned, uppercase token without hyphens/spaces
        """
        return token.replace("-", "").replace(" ", "").upper()


class TokenManager:
    """JWT token management for authentication"""

    @staticmethod
    def create_access_token(
        data: dict,
        expires_delta: Optional[timedelta] = None,
        session_id: Optional[UUID] = None,
    ) -> str:
        """
        Create JWT access token
        
        Args:
            data: Token payload
            expires_delta: Optional custom expiration
            session_id: Optional session ID to include
            
        Returns:
            Encoded JWT token
        """
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + (
            expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
        })

        # Set default type if not provided
        if "type" not in to_encode:
            to_encode["type"] = "access"

        # Include session ID if provided
        if session_id and "session_id" not in to_encode:
            to_encode["session_id"] = str(session_id)

        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    @staticmethod
    def create_voting_token() -> str:
        """
        Create user-friendly voting token
        
        Returns:
            Voting token in format AB12-CD34
        """
        return FriendlyTokenGenerator.generate_voting_token(length=8)

    @staticmethod
    def decode_token(token: str) -> dict:
        """
        Decode and verify JWT token
        
        Args:
            token: JWT token to decode
            
        Returns:
            Token payload
            
        Raises:
            ValueError: If token is invalid or expired
        """
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError as e:
            raise ValueError("Invalid or expired token") from e

    @staticmethod
    def hash_voting_token(token: str) -> str:
        """
        Hash voting token for storage
        
        Args:
            token: Voting token to hash
            
        Returns:
            SHA-256 hash of normalized token
        """
        clean_token = FriendlyTokenGenerator.normalize_token(token)
        return hashlib.sha256(clean_token.encode()).hexdigest()


def hash_password(password: str) -> str:
    """
    Hash password using Argon2
    
    Args:
        password: Plain text password
        
    Returns:
        Argon2 hash
        
    Raises:
        ValueError: If password is empty
    """
    if not password:
        raise ValueError("Password cannot be empty")
    return ph.hash(password)


def verify_password(stored_hash: str, plain_password: str) -> bool:
    """
    Verify password against stored hash
    
    Args:
        stored_hash: Argon2 hash from storage
        plain_password: Plain text password to verify
        
    Returns:
        True if password matches, False otherwise
    """
    try:
        ph.verify(stored_hash, plain_password)
        return True
    except Exception:
        return False


# Utility functions for backward compatibility
def verify_pin(voting_pin: str, stored_hash: str) -> bool:
    """Verify voting PIN against stored hash"""
    return verify_password(stored_hash, voting_pin)


__all__ = [
    "FriendlyTokenGenerator",
    "TokenManager",
    "hash_password",
    "verify_password",
    "verify_pin",
]