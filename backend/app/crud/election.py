"""
CRUD — Election lifecycle management.

Responsibilities:
  - Create / read / update elections
  - State machine enforcement (DRAFT → READY → OPEN → CLOSED → PUBLISHED)
  - Lock / unlock election config
  - Voter roll management (ElectionVoterRoll junction table)
  - All mutating operations write to AuditLog
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import func, select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.electorates import (
    AuditLog,
    Election,
    ElectionVoterRoll,
    Portfolio,
)
from app.schemas.electorates import (
    ElectionCreate,
    ElectionStatus,
    ElectionUpdate,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Allowed state transitions
# ---------------------------------------------------------------------------

_VALID_TRANSITIONS: Dict[str, List[str]] = {
    ElectionStatus.DRAFT.value:     [ElectionStatus.READY.value],
    ElectionStatus.READY.value:     [ElectionStatus.OPEN.value, ElectionStatus.DRAFT.value],
    ElectionStatus.OPEN.value:      [ElectionStatus.CLOSED.value],
    ElectionStatus.CLOSED.value:    [ElectionStatus.PUBLISHED.value],
    ElectionStatus.PUBLISHED.value: [],  # terminal state
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_election_hash(election: Election) -> str:
    """
    SHA-256 over the election's immutable config fields.
    Stored at lock time — any later tampering with portfolios/candidates will
    produce a different hash detectable during audit.
    """
    payload = {
        "id": str(election.id),
        "name": election.name,
        "opens_at": election.opens_at.isoformat() if election.opens_at else None,
        "closes_at": election.closes_at.isoformat() if election.closes_at else None,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()
    ).hexdigest()


async def _audit(
    db: AsyncSession,
    event_type: str,
    actor_id: Optional[str],
    actor_role: Optional[str],
    election_id: Optional[UUID] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    severity: str = "INFO",
    success: bool = True,
) -> None:
    """Append an audit row — never raises, never blocks the caller."""
    try:
        db.add(AuditLog(
            election_id=election_id,
            event_type=event_type,
            actor_id=actor_id,
            actor_role=actor_role,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            details=details or {},
            severity=severity,
            success=success,
        ))
    except Exception:
        logger.exception("Failed to write audit log for event: %s", event_type)


# ---------------------------------------------------------------------------
# Election CRUD
# ---------------------------------------------------------------------------

async def create_election(
    db: AsyncSession,
    data: ElectionCreate,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> Election:
    election = Election(
        name=data.name,
        description=data.description,
        opens_at=data.opens_at,
        closes_at=data.closes_at,
        status=ElectionStatus.DRAFT.value,
        is_locked=False,
    )
    db.add(election)
    await db.flush()

    await _audit(
        db, "election_created", actor_id, actor_role,
        election_id=election.id,
        resource_type="election", resource_id=str(election.id),
        ip_address=ip_address,
        details={"name": election.name},
    )
    await db.commit()
    await db.refresh(election)
    return election

async def get_active_election(db: AsyncSession) -> Election | None:
    result = await db.execute(
        select(Election).where(Election.status == ElectionStatus.OPEN.value)
    )
    return result.scalars().first()

async def get_election(
    db: AsyncSession,
    election_id: UUID,
    load_portfolios: bool = False,
) -> Optional[Election]:
    query = select(Election).where(Election.id == election_id)

    if load_portfolios:
        query = query.options(
            selectinload(Election.portfolios).selectinload(Portfolio.candidates),
            selectinload(Election.voter_roll),
        )

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_election_bare(db: AsyncSession, election_id: UUID) -> Optional[Election]:
    """Lightweight fetch — no relationship loading."""
    result = await db.execute(select(Election).where(Election.id == election_id))
    return result.scalar_one_or_none()


async def list_elections(db: AsyncSession) -> List[Election]:
    result = await db.execute(
        select(Election).order_by(Election.created_at.desc())
    )
    return result.scalars().all()


async def update_election(
    db: AsyncSession,
    election_id: UUID,
    data: ElectionUpdate,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> Optional[Election]:
    election = await get_election_bare(db, election_id)
    if not election:
        return None

    if election.is_locked:
        raise ValueError("Election is locked — config cannot be changed. Unlock it first.")

    if election.status not in (ElectionStatus.DRAFT.value, ElectionStatus.READY.value):
        raise ValueError(
            f"Election in '{election.status}' state cannot be edited."
        )

    changed: Dict[str, Any] = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        old = getattr(election, field)
        if old != value:
            changed[field] = {"from": str(old), "to": str(value)}
            setattr(election, field, value)

    if changed:
        await _audit(
            db, "election_updated", actor_id, actor_role,
            election_id=election.id,
            resource_type="election", resource_id=str(election.id),
            ip_address=ip_address,
            details={"changes": changed},
        )

    await db.commit()
    await db.refresh(election)
    return election


# ---------------------------------------------------------------------------
# Election state machine
# ---------------------------------------------------------------------------

async def transition_election_status(
    db: AsyncSession,
    election_id: UUID,
    new_status: str,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> Election:
    """
    Move an election through its lifecycle.
    Enforces:
      - Valid state transitions only
      - OPEN requires at least one portfolio with at least one active candidate
      - OPEN requires at least one voter in the voter roll
      - OPEN requires opens_at and closes_at to be set
      - READY sets is_locked = True (config frozen)
      - DRAFT (from READY) clears is_locked (allows editing again)
    """
    # election = await get_election(db, election_id)
    election = await get_election(db, election_id, load_portfolios=True)
    if not election:
        raise ValueError("Election not found")

    current = election.status
    allowed = _VALID_TRANSITIONS.get(current, [])

    if new_status not in allowed:
        raise ValueError(
            f"Cannot transition from '{current}' to '{new_status}'. "
            f"Allowed: {allowed or 'none (terminal state)'}"
        )

    # ── Pre-condition checks ──────────────────────────────────────────────────

    if new_status == ElectionStatus.READY.value:
        # Must have at least one portfolio with at least one active candidate
        has_candidates = any(
            any(c.is_active for c in p.candidates)
            for p in election.portfolios
            if p.is_active
        )
        if not has_candidates:
            raise ValueError(
                "Cannot mark election as READY: "
                "at least one active portfolio with an active candidate is required."
            )
        # Lock the config
        election.is_locked = True
        election.data_hash = _compute_election_hash(election)

    if new_status == ElectionStatus.DRAFT.value:
        # Rolling back from READY — unlock for editing
        election.is_locked = False
        election.data_hash = None

    if new_status == ElectionStatus.OPEN.value:
        # Verify voter roll is not empty
        voter_count_result = await db.execute(
            select(func.count(ElectionVoterRoll.id)).where(
                ElectionVoterRoll.election_id == election_id
            )
        )
        voter_count = voter_count_result.scalar() or 0
        if voter_count == 0:
            raise ValueError(
                "Cannot open election: voter roll is empty. "
                "Import voters before opening polls."
            )

        if not election.opens_at or not election.closes_at:
            raise ValueError(
                "Cannot open election: opens_at and closes_at must be set."
            )

    # ── Apply transition ──────────────────────────────────────────────────────

    old_status = election.status
    election.status = new_status
    election.updated_at = datetime.now(timezone.utc)

    severity = "INFO"
    if new_status in (ElectionStatus.OPEN.value, ElectionStatus.CLOSED.value):
        severity = "WARNING"  # High-significance events

    await _audit(
        db, f"election_{new_status}", actor_id, actor_role,
        election_id=election.id,
        resource_type="election", resource_id=str(election.id),
        ip_address=ip_address,
        severity=severity,
        details={"from_status": old_status, "to_status": new_status},
    )

    await db.commit()
    await db.refresh(election)
    return election


async def lock_election(
    db: AsyncSession,
    election_id: UUID,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> Election:
    """Manually lock the election config without changing status."""
    election = await get_election_bare(db, election_id)
    if not election:
        raise ValueError("Election not found")
    if election.is_locked:
        raise ValueError("Election is already locked")

    election.is_locked = True
    election.data_hash = _compute_election_hash(election)

    await _audit(
        db, "election_locked", actor_id, actor_role,
        election_id=election.id,
        resource_type="election", resource_id=str(election.id),
        ip_address=ip_address,
        severity="WARNING",
    )
    await db.commit()
    await db.refresh(election)
    return election


async def unlock_election(
    db: AsyncSession,
    election_id: UUID,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> Election:
    """Unlock a DRAFT or READY election to allow config edits."""
    election = await get_election_bare(db, election_id)
    if not election:
        raise ValueError("Election not found")
    if not election.is_locked:
        raise ValueError("Election is not locked")
    if election.status not in (ElectionStatus.DRAFT.value, ElectionStatus.READY.value):
        raise ValueError(
            f"Cannot unlock an election in '{election.status}' state."
        )

    election.is_locked = False
    election.data_hash = None

    await _audit(
        db, "election_unlocked", actor_id, actor_role,
        election_id=election.id,
        resource_type="election", resource_id=str(election.id),
        ip_address=ip_address,
        severity="WARNING",
    )
    await db.commit()
    await db.refresh(election)
    return election


# ---------------------------------------------------------------------------
# Voter Roll management
# ---------------------------------------------------------------------------

async def add_voter_to_roll(
    db: AsyncSession,
    election_id: UUID,
    electorate_id: UUID,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> ElectionVoterRoll:
    """Add a single voter to an election's voter roll."""
    election = await get_election_bare(db, election_id)
    if not election:
        raise ValueError("Election not found")

    if election.status not in (ElectionStatus.DRAFT.value, ElectionStatus.READY.value):
        raise ValueError(
            f"Cannot modify voter roll for an election in '{election.status}' state."
        )
    if election.is_locked and election.status != ElectionStatus.READY.value:
        raise ValueError("Election is locked. Unlock it before modifying the voter roll.")

    entry = ElectionVoterRoll(
        election_id=election_id,
        electorate_id=electorate_id,
        added_by=actor_id,
    )
    db.add(entry)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ValueError("Voter is already on the roll for this election.")

    await _audit(
        db, "voter_added_to_roll", actor_id, actor_role,
        election_id=election_id,
        resource_type="election_voter_roll",
        resource_id=str(electorate_id),
        ip_address=ip_address,
    )
    await db.commit()
    await db.refresh(entry)
    return entry


async def bulk_add_voters_to_roll(
    db: AsyncSession,
    election_id: UUID,
    electorate_ids: List[UUID],
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Bulk-enrol voters into an election's voter roll.
    Skips duplicates gracefully.
    """
    election = await get_election_bare(db, election_id)
    if not election:
        raise ValueError("Election not found")

    if election.status not in (ElectionStatus.DRAFT.value, ElectionStatus.READY.value):
        raise ValueError(
            f"Cannot modify voter roll for an election in '{election.status}' state."
        )

    # Find already-enrolled voter IDs
    existing_result = await db.execute(
        select(ElectionVoterRoll.electorate_id).where(
            ElectionVoterRoll.election_id == election_id
        )
    )
    existing_ids = {row[0] for row in existing_result.all()}

    added = 0
    skipped = 0
    for eid in electorate_ids:
        if eid in existing_ids:
            skipped += 1
            continue
        db.add(ElectionVoterRoll(
            election_id=election_id,
            electorate_id=eid,
            added_by=actor_id,
        ))
        existing_ids.add(eid)
        added += 1

    await _audit(
        db, "voter_roll_bulk_import", actor_id, actor_role,
        election_id=election_id,
        resource_type="election_voter_roll",
        ip_address=ip_address,
        details={"added": added, "skipped": skipped, "total": len(electorate_ids)},
    )
    await db.commit()
    return {"added": added, "skipped": skipped, "total": len(electorate_ids)}


async def remove_voter_from_roll(
    db: AsyncSession,
    election_id: UUID,
    electorate_id: UUID,
    actor_id: str,
    actor_role: str,
    ip_address: Optional[str] = None,
) -> bool:
    election = await get_election_bare(db, election_id)
    if not election:
        raise ValueError("Election not found")
    if election.is_locked:
        raise ValueError("Election is locked — voter roll cannot be modified.")

    result = await db.execute(
        delete(ElectionVoterRoll).where(
            ElectionVoterRoll.election_id == election_id,
            ElectionVoterRoll.electorate_id == electorate_id,
        )
    )
    if result.rowcount == 0:
        return False

    await _audit(
        db, "voter_removed_from_roll", actor_id, actor_role,
        election_id=election_id,
        resource_type="election_voter_roll",
        resource_id=str(electorate_id),
        ip_address=ip_address,
        severity="WARNING",
    )
    await db.commit()
    return True


async def get_voter_roll(
    db: AsyncSession,
    election_id: UUID,
    skip: int = 0,
    limit: int = 200,
) -> List[ElectionVoterRoll]:
    result = await db.execute(
        select(ElectionVoterRoll)
        .options(selectinload(ElectionVoterRoll.electorate))
        .where(ElectionVoterRoll.election_id == election_id)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def is_voter_eligible(
    db: AsyncSession,
    election_id: UUID,
    electorate_id: UUID,
) -> bool:
    result = await db.execute(
        select(ElectionVoterRoll.id).where(
            ElectionVoterRoll.election_id == election_id,
            ElectionVoterRoll.electorate_id == electorate_id,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None