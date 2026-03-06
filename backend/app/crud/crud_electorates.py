"""
CRUD operations for Electorate (voter registry) management.

Key decisions:
  - delete_electorate() is a SOFT DELETE (sets is_deleted=True).
    Hard-deleting a voter during or after an election destroys the audit trail.
    Use hard-delete only for test/seed data teardown via direct SQL.

  - bulk_create_electorates() uses INSERT ... ON CONFLICT DO NOTHING via
    SQLAlchemy's dialect-agnostic approach to avoid the TOCTOU race that
    existed in the previous check-then-insert implementation.

  - has_voted / voted_at / voting_pin_hash are now real columns on the
    Electorate model, so direct attribute access is safe.

  - mark_electorate_voted() is the single function that should be called
    inside the vote-submission transaction to update both Electorate and
    ElectionVoterRoll atomically.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
from fastapi import BackgroundTasks
from app.services.enroll_voters import update_voter_roll_background
from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, sessionmaker

from app.models.electorates import Electorate, ElectionVoterRoll
from app.schemas.electorates import ElectorateCreate, ElectorateUpdate, StudentIDConverter

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _hash_voting_pin(voting_pin: str) -> str:
    """Hash a voting PIN with Argon2id via the shared hash_password utility."""
    if not voting_pin:
        return ""
    from app.utils.security import hash_password
    return hash_password(voting_pin)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_electorate(
    db: AsyncSession,
    voter_id: UUID,
) -> Optional[Electorate]:
    """Fetch one electorate by primary key."""
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.id == voter_id)
    )
    return result.scalar_one_or_none()


async def get_electorate_by_student_id(
    db: AsyncSession,
    student_id: str,
) -> Optional[Electorate]:
    """
    Fetch by student_id.  Normalise to storage format before querying
    so both MLS/0201/19 and MLS-0201-19 resolve to the same row.
    """
    normalised = StudentIDConverter.normalize(student_id)
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.student_id == normalised)
    )
    return result.scalar_one_or_none()


async def get_electorates(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    election_id: Optional[UUID] = None,
) -> List[dict]:
    """
    Return a page of voter records as plain dicts (ready for JSON response).

    If election_id is provided, only voters enrolled in that election are
    returned.  student_id is converted to display format (slashes).
    """
    query = (
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.is_deleted == False)
    )

    if election_id is not None:
        query = query.join(
            ElectionVoterRoll,
            and_(
                ElectionVoterRoll.electorate_id == Electorate.id,
                ElectionVoterRoll.election_id == election_id,
            ),
        )

    query = query.order_by(Electorate.name).offset(skip).limit(limit)
    electorates = (await db.execute(query)).scalars().all()

    now = datetime.now(timezone.utc)
    response = []

    for e in electorates:
        has_active_token = False
        for token in (e.voting_tokens or []):
            if token.revoked or not token.is_active or token.is_used:
                continue
            if election_id and token.election_id != election_id:
                continue
            expires_at = token.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > now:
                has_active_token = True
                break

        response.append({
            "id": str(e.id),
            "student_id": StudentIDConverter.to_display(e.student_id),
            "name": e.name,
            "program": e.program,
            "year_level": e.year_level,
            "phone_number": e.phone_number,
            "email": e.email,
            "has_voted": e.has_voted,                          # real column
            "voted_at": e.voted_at.isoformat() if e.voted_at else None,  # real column
            "created_at": e.created_at.isoformat(),
            "updated_at": e.updated_at.isoformat(),
            "voting_token": "GENERATED" if has_active_token else None,
        })

    return response


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_electorate(
    db: AsyncSession,
    electorate: ElectorateCreate,
) -> Electorate:
    """Create a single voter record."""
    data = electorate.model_dump()
    voting_pin = data.pop("voting_pin", None)

    db_electorate = Electorate(
        voting_pin_hash=_hash_voting_pin(voting_pin) if voting_pin else None,
        **data,
    )
    db.add(db_electorate)
    await db.commit()
    await db.refresh(db_electorate)

    # Re-fetch with relationships loaded
    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.id == db_electorate.id)
    )
    return result.scalar_one()

async def bulk_create_electorates(
    db: AsyncSession,
    electorate_list: List[ElectorateCreate],
    election_id: uuid.UUID,
    added_by: str,
    background_tasks: BackgroundTasks,
    db_factory: sessionmaker,            # pass get_session_factory() from app.core.database
    batch_size: int = 1_000,
) -> dict:
    """
    Bulk-insert up to 10 000 voters into the Electorate master list, then
    schedule a background sync to the ElectionVoterRoll.

    Returns a lightweight summary dict instead of loading all inserted ORM
    objects back into memory — fetching 10k records with selectinload would
    produce a response payload nobody needs from a bulk upload.

    Parameters
    ----------
    db               : Request-scoped async session.
    electorate_list  : Parsed voter rows from the uploaded file.
    election_id      : The election to enrol voters into.
    added_by         : Admin username who triggered the upload.
    background_tasks : FastAPI BackgroundTasks instance.
    db_factory       : get_session_factory() — used by the background task.
    batch_size       : Rows per INSERT statement (default 1 000).
    """
    # ── 1. Deduplicate by student_id — last row wins within the same upload ─
    unique_map = {e.student_id: e for e in electorate_list}

    rows = []
    for e in unique_map.values():
        data = e.model_dump()
        voting_pin = data.pop("voting_pin", None)
        rows.append({
            "id": uuid.uuid4(),
            "voting_pin_hash": _hash_voting_pin(voting_pin) if voting_pin else None,
            **data,
        })

    if not rows:
        return {"inserted": 0, "total": 0, "voter_roll_sync": "skipped"}

    # ── 2. Chunked bulk-insert into the master Electorate table ─────────────
    #       ON CONFLICT DO NOTHING — students already in the registry are
    #       silently skipped; they'll still be enrolled via the voter roll sync.
    inserted_count = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        stmt = (
            pg_insert(Electorate)
            .values(batch)
            .on_conflict_do_nothing(index_elements=["student_id"])
            .returning(Electorate.id)
        )
        result = await db.execute(stmt)
        inserted_count += len(result.fetchall())
        await db.commit()

    # ── 3. Schedule voter roll sync in the background ────────────────────────
    #       Pass ALL student_ids from the upload — not just newly inserted ones.
    #       Students already in the master list were skipped above but still
    #       need to be enrolled in this election's voter roll.
    background_tasks.add_task(
        update_voter_roll_background,
        election_id=election_id,
        student_ids=list(unique_map.keys()),
        added_by=added_by,
        db_factory=db_factory,
    )

    return {
        "inserted": inserted_count,
        "existing_skipped": len(rows) - inserted_count,
        "total": len(rows),
        "voter_roll_sync": "queued",
    }
# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_electorate(
    db: AsyncSession,
    electorate_id: UUID,
    updates: ElectorateUpdate,
) -> Optional[Electorate]:
    """Partial update of a voter record (PATCH semantics)."""
    result = await db.execute(
        select(Electorate).where(Electorate.id == electorate_id)
    )
    db_electorate = result.scalar_one_or_none()
    if not db_electorate:
        return None

    update_data = updates.model_dump(exclude_unset=True)

    if "voting_pin" in update_data:
        voting_pin = update_data.pop("voting_pin")
        db_electorate.voting_pin_hash = (
            _hash_voting_pin(voting_pin) if voting_pin else None
        )

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


# ---------------------------------------------------------------------------
# Delete — SOFT ONLY
# ---------------------------------------------------------------------------

async def delete_electorate(
    db: AsyncSession,
    electorate_id: UUID,
) -> bool:
    """
    Soft-delete a voter by setting is_deleted=True.

    Hard-delete is intentionally NOT supported here.  Deleting a voter record
    during or after an election would:
      - Break the VotingToken → Electorate foreign key (cascades are destructive)
      - Destroy the audit trail for that voter
      - Make turnout statistics inaccurate

    For test data teardown, run DELETE FROM students directly via SQL.
    """
    result = await db.execute(
        select(Electorate).where(Electorate.id == electorate_id)
    )
    electorate = result.scalar_one_or_none()
    if not electorate:
        return False

    electorate.is_deleted = True
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Vote submission helper — call inside the vote transaction
# ---------------------------------------------------------------------------

async def mark_electorate_voted(
    db: AsyncSession,
    electorate_id: UUID,
    election_id: UUID,
) -> None:
    """
    Mark both the global Electorate record and the per-election
    ElectionVoterRoll entry as voted.

    This MUST be called in the same transaction as:
      - VotingToken.mark_voted()
      - create_vote() calls for each portfolio

    Do NOT commit here — the calling route handler owns the transaction.
    """
    # Update global flag
    result = await db.execute(
        select(Electorate).where(Electorate.id == electorate_id)
    )
    electorate = result.scalar_one_or_none()
    if electorate:
        electorate.mark_voted()

    # Update per-election roll
    roll_result = await db.execute(
        select(ElectionVoterRoll).where(
            and_(
                ElectionVoterRoll.electorate_id == electorate_id,
                ElectionVoterRoll.election_id == election_id,
            )
        )
    )
    enrollment = roll_result.scalar_one_or_none()
    if enrollment:
        enrollment.mark_voted()


# ---------------------------------------------------------------------------
# Voter roll management
# ---------------------------------------------------------------------------

async def enroll_electorate_in_election(
    db: AsyncSession,
    electorate_id: UUID,
    election_id: UUID,
    added_by: Optional[str] = None,
) -> ElectionVoterRoll:
    """Add a voter to an election's voter roll."""
    entry = ElectionVoterRoll(
        election_id=election_id,
        electorate_id=electorate_id,
        added_by=added_by,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def bulk_enroll_electorates(
    db: AsyncSession,
    electorate_ids: List[UUID],
    election_id: UUID,
    added_by: Optional[str] = None,
) -> int:
    """
    Enroll multiple voters in an election.
    Skips voters already on the roll (ON CONFLICT DO NOTHING).
    Returns the number of new enrollments added.
    """
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    rows = [
        {
            "id": uuid.uuid4(),
            "election_id": election_id,
            "electorate_id": eid,
            "added_by": added_by,
        }
        for eid in electorate_ids
    ]
    if not rows:
        return 0

    stmt = (
        pg_insert(ElectionVoterRoll)
        .values(rows)
        .on_conflict_do_nothing(constraint="uq_voter_roll_entry")
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount


async def is_electorate_enrolled(
    db: AsyncSession,
    electorate_id: UUID,
    election_id: UUID,
) -> bool:
    """Check whether a voter is on the roll for a specific election."""
    result = await db.execute(
        select(ElectionVoterRoll.id).where(
            and_(
                ElectionVoterRoll.electorate_id == electorate_id,
                ElectionVoterRoll.election_id == election_id,
            )
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None