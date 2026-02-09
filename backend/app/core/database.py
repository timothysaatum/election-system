"""
Async SQLAlchemy database integration for Offline Election System
Optimized for high-volume offline operations
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import Settings
import os

settings = Settings()

# Database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://kratos_user:SecurePass!123@database:5432/kratos_election"
)

# Lazy-load engine to avoid issues during Alembic migrations
_engine = None
_AsyncSessionLocal = None

Base = declarative_base()


def get_engine():
    """
    Get or create the async engine (lazy initialization)
    
    Returns:
        AsyncEngine instance
    """
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            DATABASE_URL,
            echo=settings.DEBUG,
            future=True,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            pool_timeout=settings.DATABASE_POOL_TIMEOUT,
            pool_recycle=settings.DATABASE_POOL_RECYCLE,
            pool_pre_ping=True,  # Enable connection health checks
        )
    return _engine


def get_session_factory():
    """
    Get or create the sessionmaker
    
    Returns:
        AsyncSession factory
    """
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        _AsyncSessionLocal = sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _AsyncSessionLocal


async def get_db():
    """
    Get database session (dependency injection)
    
    Yields:
        AsyncSession instance
    """
    AsyncSessionLocal = get_session_factory()
    async with AsyncSessionLocal() as session:
        yield session


__all__ = ["get_db", "get_engine", "get_session_factory", "Base"]