"""
CRUD for VotingToken — includes failure tracking and a plaintext token cache
for admin display after bulk generation.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from app.models.electorates import VotingToken
from app.schemas.electorates import VotingTokenCreate
from typing import List, Optional
import uuid
import hashlib
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# In-process plaintext token cache
# ---------------------------------------------------------------------------
# During a token generation run, the plaintext token is stored here keyed by
# electorate_id (as str).  Entries expire after TOKEN_DISPLAY_TTL_SECONDS.
# This allows the admin UI to display the token immediately after generation.
# The cache is cleared when tokens are regenerated or the process restarts —
# intentional, since there is no purpose in displaying old tokens.
#
# With multiple workers each worker has an independent cache.  This is
# acceptable: the admin calls the generation endpoint once (on one worker)
# then immediately fetches the display list (on the same or another worker).
# The response from the generation endpoint itself always returns the tokens,
# so the cache is only needed if the admin re-fetches the list after the fact.
# ---------------------------------------------------------------------------

import time
from typing import Dict, Tuple

_token_display_cache: Dict[str, Tuple[str, float]] = {}
TOKEN_DISPLAY_TTL_SECONDS = 3600  # 1 hour — matches typical distribution window


def _cache_plaintext_token(electorate_id: str, plaintext: str):
    """Store a plaintext token in the display cache with a TTL."""
    _token_display_cache[electorate_id] = (plaintext, time.time())


def _get_plaintext_token(electorate_id: str) -> Optional[str]:
    """
    Retrieve a cached plaintext token.
    Returns None if not found or TTL has expired.
    """
    entry = _token_display_cache.get(electorate_id)
    if not entry:
        return None
    plaintext, stored_at = entry
    if time.time() - stored_at > TOKEN_DISPLAY_TTL_SECONDS:
        del _token_display_cache[electorate_id]
        return None
    return plaintext


def _evict_plaintext_token(electorate_id: str):
    """Remove a cached token (e.g. after the voter has authenticated)."""
    _token_display_cache.pop(electorate_id, None)


def _evict_all_plaintext_tokens():
    """Clear the entire display cache (e.g. after all tokens are distributed)."""
    _token_display_cache.clear()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_voting_token(
    db: AsyncSession, token_data: VotingTokenCreate, token: str, expires_at: datetime
) -> VotingToken:
    """Create a new voting token record."""
    clean_token = token.replace("-", "").replace(" ", "").upper()
    token_hash = hashlib.sha256(clean_token.encode()).hexdigest()

    db_token = VotingToken(
        electorate_id=token_data.electorate_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_token)
    await db.commit()
    await db.refresh(db_token)
    return db_token


async def get_voting_token_by_hash(
    db: AsyncSession, token_hash: str
) -> Optional[VotingToken]:
    """Get voting token by SHA-256 hash, eagerly loading the electorate."""
    result = await db.execute(
        select(VotingToken)
        .options(selectinload(VotingToken.electorate))
        .where(VotingToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def get_voting_token_by_id(
    db: AsyncSession, token_id: uuid.UUID
) -> Optional[VotingToken]:
    """Get voting token by ID."""
    result = await db.execute(
        select(VotingToken)
        .options(selectinload(VotingToken.electorate))
        .where(VotingToken.id == token_id)
    )
    return result.scalar_one_or_none()


async def get_active_voting_tokens_by_electorate(
    db: AsyncSession, electorate_id: uuid.UUID
) -> List[VotingToken]:
    """Get all active voting tokens for an electorate."""
    result = await db.execute(
        select(VotingToken).where(
            VotingToken.electorate_id == electorate_id,
            VotingToken.is_active == True,
            VotingToken.revoked == False,
            VotingToken.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalars().all()


async def update_token_usage(
    db: AsyncSession, token_id: uuid.UUID
) -> Optional[VotingToken]:
    """Update token usage count and last-used timestamp (legacy helper)."""
    result = await db.execute(select(VotingToken).where(VotingToken.id == token_id))
    token = result.scalar_one_or_none()
    if token:
        token.record_successful_use()
        await db.commit()
        await db.refresh(token)
    return token


async def revoke_voting_token(
    db: AsyncSession, token_id: uuid.UUID, reason: str = "Manual revocation"
) -> bool:
    """Manually revoke a voting token."""
    result = await db.execute(select(VotingToken).where(VotingToken.id == token_id))
    token = result.scalar_one_or_none()
    if token:
        token.revoked = True
        token.revoked_at = datetime.now(timezone.utc)
        token.revoked_reason = reason
        token.is_active = False
        await db.commit()
        _evict_plaintext_token(str(token.electorate_id))
        return True
    return False


async def revoke_all_tokens_for_electorate(
    db: AsyncSession, electorate_id: uuid.UUID, reason: str = "Electorate revocation"
) -> int:
    """Revoke all active tokens for an electorate."""
    result = await db.execute(
        update(VotingToken)
        .where(VotingToken.electorate_id == electorate_id, VotingToken.revoked == False)
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


async def cleanup_expired_tokens(db: AsyncSession) -> int:
    """Delete expired tokens and clean their display cache entries."""
    result = await db.execute(
        delete(VotingToken).where(VotingToken.expires_at < datetime.now(timezone.utc))
    )
    await db.commit()
    return result.rowcount


async def get_token_statistics(db: AsyncSession) -> dict:
    """Token usage statistics."""
    from sqlalchemy import func

    total = (await db.execute(select(func.count(VotingToken.id)))).scalar() or 0
    active = (await db.execute(
        select(func.count(VotingToken.id)).where(
            VotingToken.is_active == True,
            VotingToken.revoked == False,
            VotingToken.expires_at > datetime.now(timezone.utc),
        )
    )).scalar() or 0
    revoked = (await db.execute(
        select(func.count(VotingToken.id)).where(VotingToken.revoked == True)
    )).scalar() or 0
    expired = (await db.execute(
        select(func.count(VotingToken.id)).where(
            VotingToken.expires_at < datetime.now(timezone.utc)
        )
    )).scalar() or 0

    return {
        "total_tokens": total,
        "active_tokens": active,
        "revoked_tokens": revoked,
        "expired_tokens": expired,
    }


async def get_electorates_with_tokens(db: AsyncSession) -> list:
    """
    Return electorates that have an active token, including the plaintext
    token from the in-process display cache where available.

    If the cache entry has expired (process restarted or >1 hour since
    generation), the token field will be None — the admin must regenerate.
    """
    from app.models.electorates import Electorate
    from app.schemas.electorates import StudentIDConverter

    result = await db.execute(
        select(Electorate)
        .options(selectinload(Electorate.voting_tokens))
        .where(Electorate.is_deleted == False)
    )
    electorates = result.scalars().all()

    now = datetime.now(timezone.utc)
    response = []

    for electorate in electorates:
        active_token = None
        for token in (electorate.voting_tokens or []):
            if token.revoked or not token.is_active:
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
                "token": plaintext,          # None if cache expired
                "token_available": plaintext is not None,
                "expires_at": active_token.expires_at.isoformat(),
            })

    return response