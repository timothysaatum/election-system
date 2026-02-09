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
    WORKERS: int = 4  # Increased for better scalability
    RELOAD: bool = True

    # Admin Credentials (Role-based)
    ADMIN_USERS: Optional[str] = None  # Format: username1:hash1,username2:hash2
    EC_OFFICIAL_USERS: Optional[str] = None
    POLLING_AGENT_USERS: Optional[str] = None

    # Security
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours for admin sessions
    VOTING_TOKEN_EXPIRE_HOURS: int = 24  # 24 hours for voting tokens

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://kratos_user:SecurePass!123@database:5432/kratos_election"
    DATABASE_POOL_SIZE: int = 20  # Increased for scalability
    DATABASE_MAX_OVERFLOW: int = 40
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 3600
    DATABASE_ECHO: bool = False

    # CORS Settings (for local network)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.*:3000",
        "http://10.0.*:3000",
    ]
    ALLOWED_METHODS: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    ALLOWED_HEADERS: List[str] = ["*"]
    ALLOW_CREDENTIALS: bool = True

    # Rate Limiting (simplified for offline)
    RATE_LIMIT_AUTH_REQUESTS: int = 10  # Login attempts per window
    RATE_LIMIT_AUTH_WINDOW: int = 300  # 5 minutes
    RATE_LIMIT_VOTE_REQUESTS: int = 5  # Vote attempts per window
    RATE_LIMIT_VOTE_WINDOW: int = 60  # 1 minute

    # Session Configuration
    SESSION_EXPIRE_MINUTES: int = 30  # Voting session timeout
    SESSION_COOKIE_NAME: str = "voting_session"
    SESSION_COOKIE_SECURE: bool = False  # Offline system
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "lax"

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_FILE: Optional[str] = "election_system.log"

    # Election-Specific Settings
    MAX_CANDIDATES_PER_PORTFOLIO: int = 50
    MAX_VOTERS_PER_ELECTION: int = 50000  # Increased for scalability
    VOTING_TOKEN_LENGTH: int = 8  # Format: AB12-CD34

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
            return [origin.strip() for origin in v.split(",")]
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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Development Settings
class DevelopmentSettings(Settings):
    """Development environment settings"""

    ENVIRONMENT: Environment = Environment.DEVELOPMENT
    DEBUG: bool = True
    RELOAD: bool = True
    DATABASE_ECHO: bool = True
    LOG_LEVEL: str = "DEBUG"


# Production Settings
class ProductionSettings(Settings):
    """Production environment settings"""

    ENVIRONMENT: Environment = Environment.PRODUCTION
    DEBUG: bool = False
    RELOAD: bool = False
    DATABASE_ECHO: bool = False
    LOG_LEVEL: str = "WARNING"

    # Enhanced connection pooling for production
    DATABASE_POOL_SIZE: int = 30
    DATABASE_MAX_OVERFLOW: int = 60

    # Stricter rate limiting
    RATE_LIMIT_AUTH_REQUESTS: int = 5
    RATE_LIMIT_VOTE_REQUESTS: int = 3

    @field_validator("SECRET_KEY")
    def secret_key_required(cls, v):
        if not v or len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters in production")
        return v


# Factory function
def get_settings() -> Settings:
    """Get settings based on environment variable"""
    env = os.getenv("ENVIRONMENT", "development").lower()

    if env == "production":
        return ProductionSettings()
    else:
        return DevelopmentSettings()


# Global settings instance
settings = get_settings()

# Rate Limiting Configuration
RATE_LIMIT_CONFIG = {
    "auth": f"{settings.RATE_LIMIT_AUTH_REQUESTS}/{settings.RATE_LIMIT_AUTH_WINDOW}",
    "voting": f"{settings.RATE_LIMIT_VOTE_REQUESTS}/{settings.RATE_LIMIT_VOTE_WINDOW}",
}

# Export commonly used settings
__all__ = [
    "settings",
    "Settings",
    "DevelopmentSettings",
    "ProductionSettings",
    "get_settings",
    "RATE_LIMIT_CONFIG",
]