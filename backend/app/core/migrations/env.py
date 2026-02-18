import sys
import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# Add app to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from app.core.config import Settings
from app.core.database import Base

# Import all models to ensure they are registered with Base.metadata
from app.models.electorates import Electorate, VotingToken, VotingSession

settings = Settings()

# Alembic Config object
config = context.config
fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Always use a synchronous driver for Alembic migrations
def get_url():
    """Get the synchronous database URL for migrations"""
    # Try ALEMBIC_DATABASE_URL first, fallback to DATABASE_URL, then default
    url = os.getenv(
        "ALEMBIC_DATABASE_URL",
        os.getenv("DATABASE_URL", "postgresql://kratos_user:SecurePass!123@database:5432/kratos_election")
    )
    
    # Ensure it's using psycopg2 (sync driver) for migrations
    if "postgresql+asyncpg://" in url:
        url = url.replace("postgresql+asyncpg://", "postgresql://")
    elif url.startswith("postgresql://") and "+psycopg2" not in url:
        # Explicitly use psycopg2
        url = url.replace("postgresql://", "postgresql+psycopg2://")
    
    return url

# Set the URL in config
config.set_main_option("sqlalchemy.url", get_url())


def run_migrations_offline():
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=get_url(),
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()