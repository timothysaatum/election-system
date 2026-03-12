"""
Offline Election System Configuration
Simplified configuration for offline-only voting operations
"""

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import List, Optional
import secrets
import os
from enum import Enum


class Environment(str, Enum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Application settings for offline election system"""

    # Application Info
    APP_NAME: str = "Offline University Election System"
    VERSION: str = "2.0.0"
    DESCRIPTION: str = "Secure offline election system for universities"
    API_PREFIX: str = "/api"

    # Environment
    ENVIRONMENT: Environment = Environment.DEVELOPMENT
    DEBUG: bool = True

    # Server Configuration
    HOST: str = "0.0.0.0"  # Allow connections from local network
    PORT: int = 8000
    WORKERS: int = 4
    RELOAD: bool = True

    # Admin Credentials (Role-based)
    ADMIN_USERS: Optional[str] = None  # Format: username1:hash1,username2:hash2
    EC_OFFICIAL_USERS: Optional[str] = None
    POLLING_AGENT_USERS: Optional[str] = None

    # Security
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # fallback / legacy (8 hours)
    VOTING_TOKEN_EXPIRE_HOURS: int = 24     # 24 hours for voting tokens

    # Role-specific session durations (minutes)
    # Admin (EC Head): full election day + buffer — can re-login if needed
    ADMIN_SESSION_EXPIRE_MINUTES: int = 720          # 12 hours
    # EC Officials: full election day — token generation, voter verification
    EC_OFFICIAL_SESSION_EXPIRE_MINUTES: int = 1440   # 24 hours
    # Polling Agents: must stay logged in for entire voting period unattended
    POLLING_AGENT_SESSION_EXPIRE_MINUTES: int = 2880  # 48 hours

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://kratos_user:SecurePass!123@database:5432/kratos_election"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 3600
    DATABASE_ECHO: bool = False

    # CORS Settings - enumerate real IPs; wildcards are NOT supported by CORSMiddleware
    # Add your actual LAN IPs here. Comma-separated in .env:
    # ALLOWED_ORIGINS=http://192.168.1.10:3000,http://192.168.1.11:3000
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    ALLOWED_METHODS: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
    ALLOWED_HEADERS: List[str] = ["*"]
    ALLOW_CREDENTIALS: bool = True

    # Rate Limiting — these are PER-PROCESS limits.
    # With multiple workers, effective attempts = limit × workers.
    # Keep conservative so even cross-worker abuse is bounded.
    RATE_LIMIT_AUTH_REQUESTS: int = 5   # per window per IP
    RATE_LIMIT_AUTH_WINDOW: int = 300   # 5 minutes
    RATE_LIMIT_VOTE_REQUESTS: int = 3   # per window per IP
    RATE_LIMIT_VOTE_WINDOW: int = 60    # 1 minute

    # Per-token failure lockout: revoke token after this many bad attempts
    TOKEN_MAX_FAILURES: int = 5

    # Session Configuration
    SESSION_EXPIRE_MINUTES: int = 30
    SESSION_COOKIE_NAME: str = "voting_session"
    SESSION_COOKIE_SECURE: bool = False   # HTTP is fine for LAN-only offline
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "lax"

    # SSE streaming bounds
    SSE_MIN_INTERVAL: int = 1    # seconds — never allow tighter than this
    SSE_MAX_INTERVAL: int = 60   # seconds — never allow looser than this
    SSE_DEFAULT_INTERVAL: int = 3

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_FILE: Optional[str] = "election_system.log"

    # Election-Specific Settings
    # Tokens are 4 characters from a 32-char alphabet (excludes 0/O/1/I/l).
    # 32^4 = 1,048,576 combinations.  Brute force is mitigated by:
    #   a) per-token failure lockout (TOKEN_MAX_FAILURES above)
    #   b) mandatory student_id second factor in verify-id endpoint
    VOTING_TOKEN_LENGTH: int = 4
    MAX_CANDIDATES_PER_PORTFOLIO: int = 50
    MAX_VOTERS_PER_ELECTION: int = 50000

    # Audit & Compliance
    AUDIT_LOG_ENABLED: bool = True
    AUDIT_LOG_LEVEL: str = "INFO"
    DATA_RETENTION_DAYS: int = 365

    @field_validator("ENVIRONMENT", mode="before")
    def validate_environment(cls, v):
        if isinstance(v, str):
            return Environment(v.lower())
        return v

    @field_validator("SECRET_KEY", mode="before")
    def validate_secret_key(cls, v, values):
        if not v or v == "your-secret-key-change-this":
            if values.data.get("ENVIRONMENT") == Environment.PRODUCTION:
                raise ValueError("SECRET_KEY must be set for production")
            return secrets.token_urlsafe(32)
        return v

    @field_validator("ALLOWED_ORIGINS", mode="before")
    def validate_cors_origins(cls, v):
        if isinstance(v, str):
            origins = [o.strip() for o in v.split(",") if o.strip()]
            # Warn if wildcards are present — they won't work
            for origin in origins:
                if "*" in origin:
                    import warnings
                    warnings.warn(
                        f"CORS origin '{origin}' contains a wildcard which is NOT "
                        "supported by CORSMiddleware. Use exact origin strings.",
                        stacklevel=2,
                    )
            return origins
        return v

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == Environment.DEVELOPMENT

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == Environment.PRODUCTION

    @property
    def database_url_sync(self) -> str:
        """Synchronous database URL for Alembic migrations"""
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    def clamp_sse_interval(self, requested: int) -> int:
        """Return a safe SSE interval within configured bounds."""
        return max(self.SSE_MIN_INTERVAL, min(requested, self.SSE_MAX_INTERVAL))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Development Settings
class DevelopmentSettings(Settings):
    ENVIRONMENT: Environment = Environment.DEVELOPMENT
    DEBUG: bool = True
    RELOAD: bool = True
    DATABASE_ECHO: bool = False   # keep False even in dev — too noisy with async
    LOG_LEVEL: str = "DEBUG"


# Production Settings
class ProductionSettings(Settings):
    ENVIRONMENT: Environment = Environment.PRODUCTION
    DEBUG: bool = False
    RELOAD: bool = False
    DATABASE_ECHO: bool = False
    LOG_LEVEL: str = "WARNING"

    DATABASE_POOL_SIZE: int = 30
    DATABASE_MAX_OVERFLOW: int = 60

    # Slightly tighter in production — adjust to match your actual election window
    ADMIN_SESSION_EXPIRE_MINUTES: int = 720          # 12 hours
    EC_OFFICIAL_SESSION_EXPIRE_MINUTES: int = 1440   # 24 hours
    POLLING_AGENT_SESSION_EXPIRE_MINUTES: int = 2880  # 48 hours

    # Tighter rate limits in production
    RATE_LIMIT_AUTH_REQUESTS: int = 3
    RATE_LIMIT_VOTE_REQUESTS: int = 2

    @field_validator("SECRET_KEY")
    def secret_key_required(cls, v):
        if not v or len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters in production")
        return v


def get_settings() -> Settings:
    """Get settings based on environment variable"""
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env == "production":
        return ProductionSettings()
    return DevelopmentSettings()


settings = get_settings()

# Validate at startup — refuse to run with obviously wrong config
if settings.is_production and settings.DEBUG:
    raise RuntimeError(
        "FATAL: DEBUG=True in PRODUCTION environment. "
        "Set ENVIRONMENT=development or DEBUG=False."
    )

RATE_LIMIT_CONFIG = {
    "auth": f"{settings.RATE_LIMIT_AUTH_REQUESTS}/{settings.RATE_LIMIT_AUTH_WINDOW}",
    "voting": f"{settings.RATE_LIMIT_VOTE_REQUESTS}/{settings.RATE_LIMIT_VOTE_WINDOW}",
}

__all__ = [
    "settings",
    "Settings",
    "DevelopmentSettings",
    "ProductionSettings",
    "get_settings",
    "RATE_LIMIT_CONFIG",
]