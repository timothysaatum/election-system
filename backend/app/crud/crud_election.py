"""
app/crud/crud_elections.py
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from app.models.electorates import Election
from app.schemas.electorates import ElectionCreate, ElectionUpdate


async def create_election_engine(db: AsyncSession, election_data: ElectionCreate) -> Election:
    """Create a new election. is_active defaults to False on the model."""
    election = Election(**election_data.model_dump())
    db.add(election)
    await db.commit()
    await db.refresh(election)
    return election


async def get_election_engine(db: AsyncSession, election_id: UUID) -> Optional[Election]:
    """Get an election by ID."""
    result = await db.execute(
        select(Election).where(Election.id == election_id)
    )
    return result.scalar_one_or_none()


async def get_active_election(db: AsyncSession) -> Optional[Election]:
    """Get the currently active election, if any."""
    result = await db.execute(
        select(Election).where(Election.is_active == True)
    )
    return result.scalar_one_or_none()


async def get_elections(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
) -> List[Election]:
    """Get all elections, most recently created first."""
    result = await db.execute(
        select(Election)
        .order_by(Election.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def update_election_engine(
    db: AsyncSession,
    election_id: UUID,
    election_data: ElectionUpdate,
) -> Optional[Election]:
    """
    Update an election.
    If is_active is being set to True, deactivate all other elections first
    to ensure only one active election at a time.
    """
    result = await db.execute(
        select(Election).where(Election.id == election_id)
    )
    election = result.scalar_one_or_none()

    if not election:
        return None

    update_data = election_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(election, field, value)

    election.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(election)
    return election


async def delete_election_engine(db: AsyncSession, election_id: UUID) -> bool:
    """Delete an election by ID."""
    result = await db.execute(
        select(Election).where(Election.id == election_id)
    )
    election = result.scalar_one_or_none()

    if not election:
        return False

    await db.delete(election)
    await db.commit()
    return True
