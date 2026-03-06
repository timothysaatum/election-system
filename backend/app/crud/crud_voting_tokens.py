"""
CRUD for VotingToken.

Includes:
  - Failure tracking and auto-revoke (via model helpers)
  - In-process plaintext token cache for admin display window
  - All queries are election-scoped

PLAINTEXT TOKEN CACHE
─────────────────────
The DB only ever stores the SHA-256 hash of a token.  During a generation
run the plaintext is written to _token_display_cache keyed by electorate_id.
Entries expire after TOKEN_DISPLAY_TTL_SECONDS (1 hour).  This window gives
EC officials enough time to read out tokens to voters before the cache clears.

Multi-worker note: each worker process has an independent cache.  This is
acceptable because the generation response itself always contains the tokens.
The cache is only needed if the admin re-fetches the display list after the
fact on a different worker.
"""

import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.electorates import VotingToken
from app.schemas.electorates import VotingTokenCreate


# ---------------------------------------------------------------------------
# Plaintext token cache
# ---------------------------------------------------------------------------

_token_display_cache: Dict[str, Tuple[str, float]] = {}
TOKEN_DISPLAY_TTL_SECONDS = 3600  # 1 hour


def _cache_plaintext_token(electorate_id: str, plaintext: str) -> None:
    """Store a plaintext token in the display cache with a TTL timestamp."""
    _token_display_cache[electorate_id] = (plaintext, time.time())


def _get_plaintext_token(electorate_id: str) -> Optional[str]:
    """
    Retrieve a cached plaintext token.
    Returns None if the entry is missing or has expired.
    """
    entry = _token_display_cache.get(electorate_id)
    if not entry:
        return None
    plaintext, stored_at = entry
    if time.time() - stored_at > TOKEN_DISPLAY_TTL_SECONDS:
        del _token_display_cache[electorate_id]
        return None
    return plaintext


def _evict_plaintext_token(electorate_id: str) -> None:
    """Remove one entry — call after a voter successfully authenticates."""
    _token_display_cache.pop(electorate_id, None)


def _evict_all_plaintext_tokens() -> None:
    """Clear the entire cache — call when the election closes."""
    _token_display_cache.clear()


# ---------------------------------------------------------------------------
# Hash helper (kept here so callers don't depend on the service layer)
# ---------------------------------------------------------------------------

def _hash_token(plaintext: str) -> str:
    """Normalise and SHA-256 hash a plaintext token for storage."""
    clean = plaintext.replace("-", "").replace(" ", "").upper()
    return hashlib.sha256(clean.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_voting_token(
    db: AsyncSession,
    token_data: VotingTokenCreate,   # now carries election_id + electorate_id
    plaintext_token: str,
    expires_at: datetime,
) -> VotingToken:
    """
    Persist a new VotingToken row.

    The plaintext is hashed before storage — it is never saved in the DB.
    Raises IntegrityError if UniqueConstraint(election_id, electorate_id)
    fires (voter already has a token for this election).
    """
    db_token = VotingToken(
        election_id=token_data.election_id,        # was missing — caused DB crash
        electorate_id=token_data.electorate_id,
        token_hash=_hash_token(plaintext_token),
        expires_at=expires_at,
        is_active=True,
        revoked=False,
        failure_count=0,
        usage_count=0,
    )
    db.add(db_token)
    await db.commit()
    await db.refresh(db_token)
    return db_token


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_voting_token_by_hash(
    db: AsyncSession,
    token_hash: str,
    election_id: uuid.UUID,
) -> Optional[VotingToken]:
    """
    Fetch a token by its SHA-256 hash, scoped to a specific election.
    Eagerly loads the electorate so callers can read student_id immediately.
    """
    result = await db.execute(
        select(VotingToken)
        .options(selectinload(VotingToken.electorate))
        .where(
            and_(
                VotingToken.token_hash == token_hash,
                VotingToken.election_id == election_id,
            )
        )
    )
    return result.scalar_one_or_none()


async def get_voting_token_by_plaintext(
    db: AsyncSession,
    plaintext_token: str,
    election_id: uuid.UUID,
) -> Optional[VotingToken]:
    """
    Convenience wrapper: hash the plaintext then call get_voting_token_by_hash.
    Use this at the verify endpoint so the route handler never touches raw hashes.
    """
    return await get_voting_token_by_hash(db, _hash_token(plaintext_token), election_id)


async def get_voting_token_by_id(
    db: AsyncSession,
    token_id: uuid.UUID,
) -> Optional[VotingToken]:
    """Fetch a token by primary key."""
    result = await db.execute(
        select(VotingToken)
        .options(selectinload(VotingToken.electorate))
        .where(VotingToken.id == token_id)
    )
    return result.scalar_one_or_none()


async def get_active_token_for_electorate(
    db: AsyncSession,
    electorate_id: uuid.UUID,
    election_id: uuid.UUID,
) -> Optional[VotingToken]:
    """
    Return the single active, unexpired, non-revoked token for a voter in
    a given election, or None.

    There should only ever be one (UniqueConstraint on election+electorate),
    but scalar_one_or_none() guards against any data anomaly.
    """
    result = await db.execute(
        select(VotingToken).where(
            and_(
                VotingToken.electorate_id == electorate_id,
                VotingToken.election_id == election_id,
                VotingToken.is_active == True,
                VotingToken.revoked == False,
                VotingToken.is_used == False,
                VotingToken.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    return result.scalar_one_or_none()


async def get_active_voting_tokens_by_electorate(
    db: AsyncSession,
    electorate_id: uuid.UUID,
    election_id: uuid.UUID,
) -> List[VotingToken]:
    """Return all active tokens for a voter in an election (normally at most 1)."""
    result = await db.execute(
        select(VotingToken).where(
            and_(
                VotingToken.electorate_id == electorate_id,
                VotingToken.election_id == election_id,
                VotingToken.is_active == True,
                VotingToken.revoked == False,
                VotingToken.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Update — usage tracking
# ---------------------------------------------------------------------------

async def record_token_use(
    db: AsyncSession,
    token_id: uuid.UUID,
) -> Optional[VotingToken]:
    """
    Record a successful authentication (token presented at a station).
    Resets failure_count and increments usage_count.

    NOTE: Previously called record_successful_use() — renamed to match
    the model helper record_use().
    """
    result = await db.execute(select(VotingToken).where(VotingToken.id == token_id))
    token = result.scalar_one_or_none()
    if token:
        token.record_use()          # model helper — was called record_successful_use() (wrong)
        await db.commit()
        await db.refresh(token)
    return token


async def increment_token_failure(
    db: AsyncSession,
    token_id: uuid.UUID,
    max_failures: int = 5,
) -> Tuple[Optional[VotingToken], bool]:
    """
    Increment the failure counter for a token.

    Returns (token, was_auto_revoked).
    If max_failures is reached the token is auto-revoked and the caller
    should log a WARNING audit event.
    """
    result = await db.execute(select(VotingToken).where(VotingToken.id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        return None, False
    auto_revoked = token.increment_failure(max_failures)
    await db.commit()
    if auto_revoked:
        _evict_plaintext_token(str(token.electorate_id))
    return token, auto_revoked


# ---------------------------------------------------------------------------
# Revoke
# ---------------------------------------------------------------------------

async def revoke_voting_token(
    db: AsyncSession,
    token_id: uuid.UUID,
    reason: str = "Manual revocation",
) -> bool:
    """Manually revoke a single token by ID."""
    result = await db.execute(select(VotingToken).where(VotingToken.id == token_id))
    token = result.scalar_one_or_none()
    if not token:
        return False
    token.revoked = True
    token.revoked_at = datetime.now(timezone.utc)
    token.revoked_reason = reason
    token.is_active = False
    await db.commit()
    _evict_plaintext_token(str(token.electorate_id))
    return True


async def revoke_all_tokens_for_electorate(
    db: AsyncSession,
    electorate_id: uuid.UUID,
    election_id: uuid.UUID,
    reason: str = "Superseded by new token",
) -> int:
    """
    Revoke all un-revoked tokens for a voter in a specific election.
    Called before issuing a replacement token.
    Returns the number of tokens revoked.
    """
    result = await db.execute(
        update(VotingToken)
        .where(
            and_(
                VotingToken.electorate_id == electorate_id,
                VotingToken.election_id == election_id,
                VotingToken.revoked == False,
            )
        )
        .values(
            revoked=True,
            revoked_at=datetime.now(timezone.utc),
            revoked_reason=reason,
            is_active=False,
        )
    )
    await db.commit()
    _evict_plaintext_token(str(electorate_id))
    return result.rowcount


# ---------------------------------------------------------------------------
# Cleanup — SOFT only (tokens are part of the audit trail)
# ---------------------------------------------------------------------------

async def mark_expired_tokens(db: AsyncSession, election_id: uuid.UUID) -> int:
    """
    Soft-expire tokens whose expiry time has passed: set is_active=False,
    revoked=True, revoked_reason='Expired'.

    Does NOT hard-delete.  Tokens are part of the audit trail and must be
    retained after the election closes.  Hard-delete was a bug in the
    previous implementation.

    Returns the number of tokens updated.
    """
    result = await db.execute(
        update(VotingToken)
        .where(
            and_(
                VotingToken.election_id == election_id,
                VotingToken.expires_at < datetime.now(timezone.utc),
                VotingToken.revoked == False,
                VotingToken.is_used == False,
            )
        )
        .values(
            is_active=False,
            revoked=True,
            revoked_at=datetime.now(timezone.utc),
            revoked_reason="Expired",
        )
    )
    await db.commit()
    return result.rowcount


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

async def get_token_statistics(
    db: AsyncSession,
    election_id: uuid.UUID,
) -> dict:
    """Token usage statistics for a specific election."""
    from sqlalchemy import func

    base = and_(VotingToken.election_id == election_id)

    total = (
        await db.execute(select(func.count(VotingToken.id)).where(base))
    ).scalar() or 0

    active = (
        await db.execute(
            select(func.count(VotingToken.id)).where(
                and_(
                    base,
                    VotingToken.is_active == True,
                    VotingToken.revoked == False,
                    VotingToken.is_used == False,
                    VotingToken.expires_at > datetime.now(timezone.utc),
                )
            )
        )
    ).scalar() or 0

    used = (
        await db.execute(
            select(func.count(VotingToken.id)).where(
                and_(base, VotingToken.is_used == True)
            )
        )
    ).scalar() or 0

    revoked = (
        await db.execute(
            select(func.count(VotingToken.id)).where(
                and_(base, VotingToken.revoked == True, VotingToken.is_used == False)
            )
        )
    ).scalar() or 0

    expired = (
        await db.execute(
            select(func.count(VotingToken.id)).where(
                and_(
                    base,
                    VotingToken.expires_at < datetime.now(timezone.utc),
                    VotingToken.is_used == False,
                )
            )
        )
    ).scalar() or 0

    return {
        "total_tokens": total,
        "active_tokens": active,
        "used_tokens": used,
        "revoked_tokens": revoked,
        "expired_tokens": expired,
    }


# ---------------------------------------------------------------------------
# Admin display — electorates with their current token status
# ---------------------------------------------------------------------------

async def get_electorates_with_tokens(
    db: AsyncSession,
    election_id: uuid.UUID,
) -> list:
    """
    Return all voters enrolled in this election who currently have an
    active token, including the plaintext from the in-process cache.

    token field will be None if:
      - The cache has expired (>1 hour since generation, or process restarted)
      - The token has been evicted (voter authenticated)
    In either case token_available=False and the EC must regenerate.
    """
    from app.models.electorates import Electorate, ElectionVoterRoll
    from app.schemas.electorates import StudentIDConverter

    # Fetch all enrolled voters with their tokens for this election
    result = await db.execute(
        select(Electorate)
        .join(
            ElectionVoterRoll,
            and_(
                ElectionVoterRoll.electorate_id == Electorate.id,
                ElectionVoterRoll.election_id == election_id,
            ),
        )
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.is_deleted == False)
    )
    electorates = result.scalars().all()

    now = datetime.now(timezone.utc)
    response = []

    for electorate in electorates:
        active_token = None
        for token in (electorate.voting_tokens or []):
            if token.election_id != election_id:
                continue
            if token.revoked or not token.is_active or token.is_used:
                continue
            expires_at = token.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > now:
                active_token = token
                break

        if active_token:
            plaintext = _get_plaintext_token(str(electorate.id))
            response.append({
                "id": str(electorate.id),
                "student_id": StudentIDConverter.to_display(electorate.student_id),
                "name": electorate.name,
                "program": electorate.program,
                "phone_number": electorate.phone_number,
                "email": electorate.email,
                "has_voted": electorate.has_voted,
                "token": plaintext,
                "token_available": plaintext is not None,
                "expires_at": active_token.expires_at.isoformat(),
            })

    return response