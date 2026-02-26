from datetime import datetime, timezone
from uuid import UUID
import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.electorates import Electorate
from app.schemas.electorates import ElectorateCreate, ElectorateUpdate, StudentIDConverter
from sqlalchemy.orm import selectinload
from typing import List, Optional

logger = logging.getLogger(__name__)


def hash_voting_pin(voting_pin: str) -> str:
    """
    Hash a voting PIN using Argon2id.
    Unified with the rest of the codebase — SHA-256 path removed.
    """
    if not voting_pin:
        return ""
    from app.utils.security import hash_password
    return hash_password(voting_pin)


async def get_electorate_by_student_id(
    db: AsyncSession, student_id: str
) -> Optional[Electorate]:
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.student_id == student_id)
    )
    return result.scalar_one_or_none()


async def get_electorates(
    db: AsyncSession, skip: int = 0, limit: int = 100
) -> List[dict]:
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.is_deleted == False)
        .offset(skip)
        .limit(limit)
    )
    electorates = result.scalars().all()

    now = datetime.now(timezone.utc)
    response = []

    for electorate in electorates:
        has_active_token = False
        for token in (electorate.voting_tokens or []):
            if token.revoked or not token.is_active:
                continue
            expires_at = token.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > now:
                has_active_token = True
                break

        response.append({
            "id": str(electorate.id),
            "student_id": StudentIDConverter.to_display(electorate.student_id),
            "name": electorate.name,
            "program": electorate.program,
            "year_level": electorate.year_level,
            "phone_number": electorate.phone_number,
            "email": electorate.email,
            "has_voted": electorate.has_voted,
            "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
            "created_at": electorate.created_at.isoformat(),
            "updated_at": electorate.updated_at.isoformat(),
            "voting_token": "GENERATED" if has_active_token else None,
        })

    return response


async def get_electorate(db: AsyncSession, voter_id: UUID) -> Optional[Electorate]:
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.id == voter_id)
    )
    return result.scalar_one_or_none()


async def create_electorate(db: AsyncSession, electorate: ElectorateCreate) -> Electorate:
    electorate_data = electorate.model_dump()
    voting_pin = electorate_data.pop("voting_pin", None)
    voting_pin_hash = hash_voting_pin(voting_pin) if voting_pin else ""

    db_electorate = Electorate(voting_pin_hash=voting_pin_hash, **electorate_data)
    db.add(db_electorate)
    await db.commit()
    await db.refresh(db_electorate)

    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.id == db_electorate.id)
    )
    return result.scalar_one()


async def update_electorate(
    db: AsyncSession, electorate_id: str, updates: ElectorateUpdate
) -> Optional[Electorate]:
    result = await db.execute(
        select(Electorate).where(Electorate.id == electorate_id)
    )
    db_electorate = result.scalar_one_or_none()
    if not db_electorate:
        return None

    update_data = updates.model_dump(exclude_unset=True)

    if "voting_pin" in update_data:
        voting_pin = update_data.pop("voting_pin")
        db_electorate.voting_pin_hash = hash_voting_pin(voting_pin) if voting_pin else ""

    for field, value in update_data.items():
        setattr(db_electorate, field, value)

    await db.commit()
    await db.refresh(db_electorate)

    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.id == db_electorate.id)
    )
    return result.scalar_one()


async def delete_electorate(db: AsyncSession, electorate_id: str) -> bool:
    """
    Delete an electorate.
    Associated Votes, VotingSessions, and VotingTokens are removed automatically
    by ON DELETE CASCADE constraints defined on the FK columns.
    """
    try:
        electorate_uuid = (
            uuid.UUID(electorate_id) if isinstance(electorate_id, str) else electorate_id
        )
        result = await db.execute(
            delete(Electorate).where(Electorate.id == electorate_uuid)
        )
        await db.commit()
        return result.rowcount > 0
    except Exception as exc:
        await db.rollback()
        raise exc


async def bulk_create_electorates(
    db: AsyncSession, electorate_list: List[ElectorateCreate]
) -> List[Electorate]:
    # Deduplicate within upload
    unique_map = {e.student_id: e for e in electorate_list}
    electorate_list = list(unique_map.values())
    student_ids = [e.student_id for e in electorate_list]

    # Fetch already-existing student IDs
    result = await db.execute(
        select(Electorate.student_id).where(Electorate.student_id.in_(student_ids))
    )
    existing_ids = set(result.scalars().all())

    objs = []
    for e in electorate_list:
        if e.student_id in existing_ids:
            logger.debug("Skipping duplicate student_id: %s", e.student_id)
            continue
        data = e.model_dump()
        voting_pin = data.pop("voting_pin", None)
        obj = Electorate(
            voting_pin_hash=hash_voting_pin(voting_pin) if voting_pin else "",
            **data,
        )
        objs.append(obj)

    if not objs:
        return []

    db.add_all(objs)
    await db.commit()
    for obj in objs:
        await db.refresh(obj)

    ids = [obj.id for obj in objs]
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.id.in_(ids))
    )
    return result.scalars().all()