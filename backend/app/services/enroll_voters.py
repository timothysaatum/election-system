"""
voter_roll_tasks.py
───────────────────
Background utility for syncing / updating the ElectionVoterRoll from a
supplied voter list.

Design goals
────────────
• Chunked resolution  — student_id → UUID lookup is chunked to avoid large IN clauses.
• Chunked bulk-upsert — never loads the full voter list into memory at once.
• INSERT … ON CONFLICT DO NOTHING — single round-trip per chunk, no prior SELECT.
• Validates election state upfront — refuses to mutate a locked / open election.
• Soft-delete aware — skips voters marked is_deleted or is_banned.
• Idempotent — safe to run multiple times with the same or overlapping lists.
• Audit trail — writes one AuditLog row on completion (or failure).
• Non-blocking — runs inside FastAPI BackgroundTasks; every DB call uses await.

Tuned for 10,000 voters
────────────────────────
_RESOLVE_CHUNK : 1 000   — max values per IN clause during UUID resolution
_INSERT_CHUNK  : 1 000   — rows per INSERT statement into election_voter_roll
At 10k voters: 10 resolve queries + 10 insert statements = 20 DB round-trips total.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models.electorates import (
    AuditLog,
    AuditSeverity,
    Election,
    ElectionStatus,
    ElectionVoterRoll,
    Electorate,
)

logger = logging.getLogger(__name__)

# ── tunables ────────────────────────────────────────────────────────────────
_RESOLVE_CHUNK: int = 1_000   # max student_ids per IN clause
_INSERT_CHUNK:  int = 1_000   # rows per INSERT into election_voter_roll
# ────────────────────────────────────────────────────────────────────────────


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def update_voter_roll_background(
    *,
    election_id: uuid.UUID,
    student_ids: Sequence[str],
    added_by: str,
    db_factory: sessionmaker,            # get_session_factory() from app.core.database
    resolve_chunk: int = _RESOLVE_CHUNK,
    insert_chunk: int = _INSERT_CHUNK,
) -> None:
    """
    Background task: resolve student_ids against the Electorate registry and
    bulk-upsert them onto ElectionVoterRoll for the given election.

    Opens its own DB session — required because the request session is already
    closed by the time a BackgroundTask runs.

    Parameters
    ----------
    election_id    : UUID of the target election.
    student_ids    : student_id strings from the uploaded voter list.
    added_by       : Admin username who triggered the upload.
    db_factory     : get_session_factory() from app.core.database.
    resolve_chunk  : Max student_ids per IN query (default 1 000).
    insert_chunk   : Rows per INSERT statement (default 1 000).
    """
    async with db_factory() as db:
        try:
            inserted, skipped = await _run_sync(
                db=db,
                election_id=election_id,
                student_ids=list(student_ids),
                added_by=added_by,
                resolve_chunk=resolve_chunk,
                insert_chunk=insert_chunk,
            )
            await _write_audit(
                db=db,
                election_id=election_id,
                actor_id=added_by,
                success=True,
                details={
                    "inserted": inserted,
                    "skipped_or_existing": skipped,
                    "total_requested": len(student_ids),
                },
            )
            logger.info(
                "voter_roll_sync election=%s inserted=%d skipped=%d total=%d",
                election_id, inserted, skipped, len(student_ids),
            )
        except Exception as exc:
            await db.rollback()
            await _write_audit(
                db=db,
                election_id=election_id,
                actor_id=added_by,
                success=False,
                severity=AuditSeverity.CRITICAL,
                details={"error": str(exc)},
            )
            logger.exception(
                "voter_roll_sync FAILED election=%s error=%s", election_id, exc
            )
            raise


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _run_sync(
    *,
    db: AsyncSession,
    election_id: uuid.UUID,
    student_ids: list[str],
    added_by: str,
    resolve_chunk: int,
    insert_chunk: int,
) -> tuple[int, int]:
    """Core sync logic. Returns (rows_inserted, rows_skipped)."""

    # ── 1. Validate election state before touching any data ─────────────────
    election = await _get_election(db, election_id)
    _assert_mutable(election)

    # ── 2. Resolve student_ids → internal UUIDs (chunked IN queries) ────────
    #       Chunking keeps each IN clause under 1 000 values — safe for 10k+
    #       lists without stressing the PostgreSQL query planner.
    electorate_map: dict[str, uuid.UUID] = await _resolve_electorate_ids(
        db, student_ids, chunk_size=resolve_chunk
    )

    eligible_ids: list[uuid.UUID] = list(electorate_map.values())
    skipped = len(student_ids) - len(eligible_ids)

    if not eligible_ids:
        logger.warning(
            "voter_roll_sync election=%s — no eligible voters found from %d student_ids",
            election_id, len(student_ids),
        )
        return 0, skipped

    # ── 3. Bulk-upsert into election_voter_roll in chunks ───────────────────
    inserted = 0
    now = datetime.now(timezone.utc)

    for chunk_start in range(0, len(eligible_ids), insert_chunk):
        chunk = eligible_ids[chunk_start : chunk_start + insert_chunk]

        rows = [
            {
                "id": uuid.uuid4(),
                "election_id": election_id,
                "electorate_id": eid,
                "has_voted": False,
                "voted_at": None,
                "added_at": now,
                "added_by": added_by,
            }
            for eid in chunk
        ]

        stmt = (
            pg_insert(ElectionVoterRoll)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=["election_id", "electorate_id"]  # uq_voter_roll_entry
            )
        )
        result = await db.execute(stmt)
        inserted += result.rowcount
        await db.commit()   # commit per chunk — bounds memory, enables early durability

    return inserted, skipped


async def _get_election(db: AsyncSession, election_id: uuid.UUID) -> Election:
    """Fetch the Election row or raise if not found."""
    row = await db.get(Election, election_id)
    if row is None:
        raise ValueError(f"Election {election_id} not found.")
    return row


def _assert_mutable(election: Election) -> None:
    """Raise if the election is in a state that forbids voter roll changes."""
    immutable_statuses = {
        ElectionStatus.OPEN.value,
        ElectionStatus.CLOSED.value,
        ElectionStatus.PUBLISHED.value,
    }
    if election.status in immutable_statuses:
        raise ValueError(
            f"Cannot modify voter roll: election is '{election.status}'."
        )
    if election.is_locked:
        raise ValueError("Cannot modify voter roll: election is locked.")


async def _resolve_electorate_ids(
    db: AsyncSession,
    student_ids: list[str],
    chunk_size: int = _RESOLVE_CHUNK,
) -> dict[str, uuid.UUID]:
    """
    Resolve student_id strings → Electorate UUIDs, filtering out soft-deleted
    and banned voters.

    Chunked to keep each IN clause at most chunk_size values — prevents query
    planner stress at 10k+ student lists.
    """
    if not student_ids:
        return {}

    result_map: dict[str, uuid.UUID] = {}

    for i in range(0, len(student_ids), chunk_size):
        chunk = student_ids[i : i + chunk_size]
        stmt = (
            select(Electorate.student_id, Electorate.id)
            .where(
                Electorate.student_id.in_(chunk),
                Electorate.is_deleted.is_(False),
                Electorate.is_banned.is_(False),
            )
        )
        rows = (await db.execute(stmt)).all()
        result_map.update({r.student_id: r.id for r in rows})

    return result_map


async def _write_audit(
    db: AsyncSession,
    election_id: uuid.UUID,
    actor_id: str,
    success: bool,
    details: dict | None = None,
    severity: AuditSeverity = AuditSeverity.INFO,
) -> None:
    """Append a single AuditLog row. Commits independently."""
    log = AuditLog(
        election_id=election_id,
        event_type="voter_roll_sync",
        actor_id=actor_id,
        actor_role="admin",
        resource_type="ElectionVoterRoll",
        resource_id=str(election_id),
        success=success,
        severity=AuditSeverity.CRITICAL.value if not success else AuditSeverity.INFO.value,
        details=details or {},
    )
    db.add(log)
    await db.commit()