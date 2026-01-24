"""
Async SQLAlchemy database integration for the Election System
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import Settings
import os

settings = Settings()

# Example: 'postgresql+asyncpg://user:password@localhost/dbname'
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://kratos_user:SecurePass!123@database:5432/kratos_election")

# Lazy-load engine to avoid issues during Alembic migrations
_engine = None
_AsyncSessionLocal = None

def get_engine():
    """Get or create the async engine (lazy initialization)"""
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            DATABASE_URL,
            echo=settings.DEBUG,
            future=True,
        )
    return _engine

def get_session_factory():
    """Get or create the sessionmaker"""
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

Base = declarative_base()


async def get_db():
    """Get database session"""
    AsyncSessionLocal = get_session_factory()
    async with AsyncSessionLocal() as session:
        yield session
