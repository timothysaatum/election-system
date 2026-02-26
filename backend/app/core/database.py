"""
Async SQLAlchemy database integration for Offline Election System
Optimized for high-volume offline operations
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, AsyncEngine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import text
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Use settings as the single source of truth — no fallback string
DATABASE_URL = settings.DATABASE_URL

# Lazy-load engine to avoid issues during Alembic migrations
_engine: AsyncEngine | None = None
_AsyncSessionLocal = None

Base = declarative_base()


def get_engine() -> AsyncEngine:
    """
    Get or create the async engine (lazy initialization).
    pool_pre_ping=True ensures stale connections are detected and replaced
    automatically — critical for long-running offline deployments.
    """
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            DATABASE_URL,
            echo=settings.DATABASE_ECHO,
            future=True,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            pool_timeout=settings.DATABASE_POOL_TIMEOUT,
            pool_recycle=settings.DATABASE_POOL_RECYCLE,
            pool_pre_ping=True,   # Replace stale connections automatically
            connect_args={
                # asyncpg-specific: short statement timeout prevents runaway queries
                "command_timeout": 30,
            },
        )
        logger.info(
            "Database engine created (pool_size=%d, max_overflow=%d)",
            settings.DATABASE_POOL_SIZE,
            settings.DATABASE_MAX_OVERFLOW,
        )
    return _engine


def get_session_factory():
    """
    Get or create the sessionmaker.
    expire_on_commit=False is intentional: keeps objects usable after commit
    without triggering lazy loads in an async context.
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
    FastAPI dependency — yields a database session.
    Rolls back automatically on unhandled exceptions.
    """
    AsyncSessionLocal = get_session_factory()
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def check_db_health() -> bool:
    """
    Quick connectivity check — used by health-check endpoints.
    Returns True if the database is reachable, False otherwise.
    """
    try:
        async with get_session_factory()() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error("Database health check failed: %s", exc)
        return False


__all__ = ["get_db", "get_engine", "get_session_factory", "Base", "check_db_health"]