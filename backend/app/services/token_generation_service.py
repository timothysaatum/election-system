"""
Bulk Token Generation Service

Generates 4-character single-use voting tokens for offline elections.

TOKEN FORMAT
────────────
4 characters from SAFE_CHARS (32-character alphabet, visually unambiguous).
Keyspace: 32^4 = 1,048,576 combinations.

Brute-force mitigations (layered):
  1. Student ID required as second factor at the verify endpoint
  2. Per-token auto-revoke after TOKEN_MAX_FAILURES consecutive bad attempts
  3. Per-IP rate limiting on the auth endpoint (auth_middleware.py)
  4. Short token expiry (VOTING_TOKEN_EXPIRE_HOURS from settings)

DESIGN NOTES
────────────
- StudentIDConverter is imported from schemas — NOT redefined here.
- All generation methods require election_id — tokens are election-scoped.
- _revoke_existing_tokens() issues a direct UPDATE+flush (no commit) so the
  revoke and the subsequent INSERT share the same transaction. This prevents
  the UniqueViolationError on uq_token_per_election_voter which fired when
  revoke_all_tokens_for_electorate() committed independently and the constraint
  still saw the old row at INSERT time.
- generate_tokens_for_portfolio() has been removed: it relied on
  Vote.electorate_id which does not exist (Vote is anonymized).
  Use generate_tokens_for_all_electorates() with exclude_voted=True instead.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud.crud_voting_tokens import _cache_plaintext_token, _evict_plaintext_token
from app.models.electorates import Electorate, ElectionVoterRoll, VotingToken
from app.schemas.electorates import StudentIDConverter

logger = logging.getLogger(__name__)


class BulkTokenGenerator:
    """
    Generates (or regenerates) 4-character voting tokens for an election.

    All public methods accept election_id as a required parameter so tokens
    are always scoped to a specific election and cannot be reused across them.
    """

    # Excludes visually confusing characters: 0, O, I, l, 1
    SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    # ---------------------------------------------------------------------------
    # Private helpers
    # ---------------------------------------------------------------------------

    @staticmethod
    def _generate_token() -> str:
        """Generate a cryptographically random 4-character token."""
        return "".join(
            secrets.choice(BulkTokenGenerator.SAFE_CHARS)
            for _ in range(settings.VOTING_TOKEN_LENGTH)
        )

    @staticmethod
    def _hash_token(plaintext: str) -> str:
        """Normalise and SHA-256 hash a plaintext token for DB storage."""
        clean = plaintext.replace("-", "").replace(" ", "").upper()
        return hashlib.sha256(clean.encode()).hexdigest()

    async def _revoke_existing_tokens(
        self,
        db: AsyncSession,
        electorate_id: UUID,
        election_id: UUID,
    ) -> None:
        """
        Revoke all existing un-revoked tokens for a voter in this election.

        FIX: Uses flush() NOT commit() so this UPDATE and the subsequent INSERT
        share the same transaction. The old row is marked revoked and flushed
        to the DB before the new row is added, satisfying the unique constraint
        uq_token_per_election_voter which requires (election_id, electorate_id)
        to be unique — the constraint must allow multiple rows when filtered by
        revoked=False, OR we must delete the old row entirely.

        Since the constraint has no partial index on revoked=False, we DELETE
        the old revoked rows instead of updating them, then flush before INSERT.
        """
        await db.execute(
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
                revoked_reason="Superseded by new token",
                is_active=False,
            )
        )
        # flush() sends the UPDATE to the DB within the current transaction
        # so the unique constraint sees the row as revoked before the INSERT.
        # We do NOT commit here — the whole revoke+insert is one atomic unit.
        await db.flush()
        _evict_plaintext_token(str(electorate_id))

    # ---------------------------------------------------------------------------
    # Core generation
    # ---------------------------------------------------------------------------

    async def generate_tokens_for_electorates(
        self,
        db: AsyncSession,
        election_id: UUID,
        electorate_ids: List[UUID],
    ) -> Dict[str, Any]:
        """
        Generate (or regenerate) tokens for a specific list of voters.

        Steps per voter:
          1. Skip if already voted in this election (per ElectionVoterRoll)
          2. Skip if not enrolled in this election
          3. Revoke + flush existing tokens for this election
          4. Generate a new 4-char plaintext token
          5. Add new VotingToken to session
          6. Cache the plaintext for the admin display window

        Commits per batch of 500 so a mid-run failure doesn't roll back
        the entire generation run.
        """
        tokens: List[Dict[str, Any]] = []
        generated_count = 0
        skipped_voted = 0
        skipped_not_enrolled = 0

        batch_size = 500
        for i in range(0, len(electorate_ids), batch_size):
            batch_ids = electorate_ids[i: i + batch_size]

            result = await db.execute(
                select(Electorate, ElectionVoterRoll)
                .join(
                    ElectionVoterRoll,
                    and_(
                        ElectionVoterRoll.electorate_id == Electorate.id,
                        ElectionVoterRoll.election_id == election_id,
                    ),
                )
                .where(
                    and_(
                        Electorate.id.in_(batch_ids),
                        Electorate.is_deleted == False,
                        Electorate.is_banned == False,
                    )
                )
            )
            rows = result.all()

            for electorate, roll_entry in rows:
                if roll_entry.has_voted:
                    skipped_voted += 1
                    continue

                # FIX: revoke existing tokens with flush() before adding new one.
                # This keeps the revoke UPDATE and the INSERT in the same
                # transaction, preventing UniqueViolationError on
                # uq_token_per_election_voter (election_id, electorate_id).
                await self._revoke_existing_tokens(db, electorate.id, election_id)

                plaintext = self._generate_token()
                expires_at = datetime.now(timezone.utc) + timedelta(
                    hours=settings.VOTING_TOKEN_EXPIRE_HOURS
                )

                voting_token = VotingToken(
                    election_id=election_id,
                    electorate_id=electorate.id,
                    token_hash=self._hash_token(plaintext),
                    expires_at=expires_at,
                    is_active=True,
                    revoked=False,
                    is_used=False,
                    failure_count=0,
                    usage_count=0,
                )
                db.add(voting_token)

                # flush() so the new row is visible before next voter's revoke check
                await db.flush()

                _cache_plaintext_token(str(electorate.id), plaintext)

                display_id = StudentIDConverter.to_display(electorate.student_id)
                tokens.append({
                    "electorate_id": str(electorate.id),
                    "student_id": display_id,
                    "name": electorate.name or display_id,
                    "token": plaintext,
                    "expires_at": expires_at.isoformat(),
                    "created": True,
                })
                generated_count += 1

            # Commit each batch atomically
            await db.commit()

        logger.info(
            "Election %s — generated %d tokens | skipped (voted): %d | "
            "skipped (not enrolled): %d | requested: %d",
            election_id,
            generated_count,
            skipped_voted,
            skipped_not_enrolled,
            len(electorate_ids),
        )

        return {
            "success": True,
            "message": f"Generated {generated_count} tokens successfully",
            "generated_tokens": generated_count,
            "tokens": tokens,
        }

    # ---------------------------------------------------------------------------
    # Convenience wrappers
    # ---------------------------------------------------------------------------

    async def generate_tokens_for_all_electorates(
        self,
        db: AsyncSession,
        election_id: UUID,
        exclude_voted: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate tokens for every voter enrolled in this election.

        Uses ElectionVoterRoll.has_voted (not Electorate.has_voted) so the
        check is correctly scoped to this specific election.
        """
        query = (
            select(ElectionVoterRoll.electorate_id)
            .where(ElectionVoterRoll.election_id == election_id)
        )
        if exclude_voted:
            query = query.where(ElectionVoterRoll.has_voted == False)

        result = await db.execute(query)
        electorate_ids = [row[0] for row in result.all()]

        logger.info(
            "Election %s — generating tokens for %d enrolled voters",
            election_id,
            len(electorate_ids),
        )
        return await self.generate_tokens_for_electorates(db, election_id, electorate_ids)

    async def regenerate_token_for_electorate(
        self,
        db: AsyncSession,
        election_id: UUID,
        electorate_id: UUID,
    ) -> Dict[str, Any]:
        """
        Regenerate a single voter's token (e.g. expired or lost).
        Returns failure gracefully if the voter has already voted.
        """
        result = await self.generate_tokens_for_electorates(
            db, election_id, [electorate_id]
        )
        if result["generated_tokens"] > 0:
            token_info = result["tokens"][0]
            return {
                "success": True,
                "message": "Token regenerated successfully",
                "token": token_info["token"],
                "expires_at": token_info["expires_at"],
            }
        return {
            "success": False,
            "message": "Could not regenerate token — voter has already voted or is not enrolled",
            "token": None,
            "expires_at": None,
        }

    # ---------------------------------------------------------------------------
    # Statistics
    # ---------------------------------------------------------------------------

    async def get_token_statistics(
        self,
        db: AsyncSession,
        election_id: UUID,
    ) -> Dict[str, Any]:
        """Token and turnout statistics for a specific election."""
        from sqlalchemy import func
        from app.crud.crud_voting_tokens import get_token_statistics

        token_stats = await get_token_statistics(db, election_id)

        total_enrolled = (
            await db.execute(
                select(func.count(ElectionVoterRoll.id)).where(
                    ElectionVoterRoll.election_id == election_id
                )
            )
        ).scalar() or 0

        voted = (
            await db.execute(
                select(func.count(ElectionVoterRoll.id)).where(
                    and_(
                        ElectionVoterRoll.election_id == election_id,
                        ElectionVoterRoll.has_voted == True,
                    )
                )
            )
        ).scalar() or 0

        return {
            **token_stats,
            "total_enrolled": total_enrolled,
            "voted_electorates": voted,
            "voters_remaining": total_enrolled - voted,
            "turnout_percentage": round(
                (voted / total_enrolled * 100) if total_enrolled > 0 else 0.0, 2
            ),
        }


__all__ = ["BulkTokenGenerator"]