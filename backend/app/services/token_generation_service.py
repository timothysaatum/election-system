"""
Offline Token Generation Service
4-CHARACTER TOKENS (AB12 format)
Student ID conversion: slash to hyphen for storage
"""

from typing import List, Dict, Any
from datetime import datetime, timezone, timedelta
from uuid import UUID
import logging
import hashlib
import secrets

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_

from app.models.electorates import Electorate, VotingToken, Vote
from app.core.config import settings
from app.crud.crud_voting_tokens import _cache_plaintext_token

logger = logging.getLogger(__name__)


class StudentIDConverter:
    """Handle student ID conversion between slash and hyphen formats."""

    @staticmethod
    def to_storage(student_id: str) -> str:
        """MLS/0201/19 → MLS-0201-19"""
        return student_id.replace("/", "-")

    @staticmethod
    def to_display(student_id: str) -> str:
        """MLS-0201-19 → MLS/0201/19"""
        return student_id.replace("-", "/")

    @staticmethod
    def normalize(student_id: str) -> str:
        """Normalise to storage format for comparison."""
        return student_id.replace("/", "-").strip().upper()


class BulkTokenGenerator:
    """
    High-performance 4-character token generator for offline voting.

    Token format: 4 characters drawn from SAFE_CHARS (32-char alphabet).
    Space: 32^4 = 1,048,576 combinations.

    Brute-force mitigations (layered):
      1. Mandatory student_id second factor at verify-id endpoint
      2. Per-token failure lockout after TOKEN_MAX_FAILURES bad attempts
      3. Per-IP rate limiting at the auth endpoint
    """

    # Excludes visually confusing characters: 0, O, I, l, 1
    SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    def __init__(self):
        pass

    @staticmethod
    def _generate_token() -> str:
        """Generate a 4-character token from SAFE_CHARS using secrets.choice."""
        return "".join(
            secrets.choice(BulkTokenGenerator.SAFE_CHARS)
            for _ in range(settings.VOTING_TOKEN_LENGTH)
        )

    @staticmethod
    def _hash_token(token: str) -> str:
        """SHA-256 hash of the normalised token."""
        clean = token.replace("-", "").replace(" ", "").upper()
        return hashlib.sha256(clean.encode()).hexdigest()

    async def _revoke_existing_tokens(self, db: AsyncSession, electorate_id: UUID):
        """Revoke all un-revoked tokens for an electorate."""
        result = await db.execute(
            select(VotingToken).where(
                and_(
                    VotingToken.electorate_id == electorate_id,
                    VotingToken.revoked == False,
                )
            )
        )
        for old in result.scalars().all():
            old.revoked = True
            old.revoked_at = datetime.now(timezone.utc)
            old.revoked_reason = "Superseded by new token"

    async def generate_tokens_for_electorates(
        self,
        db: AsyncSession,
        electorate_ids: List[UUID],
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Generate (or regenerate) tokens for a list of electorate IDs.

        Steps per electorate:
          1. Skip if already voted
          2. Revoke all existing tokens
          3. Generate a new 4-char token
          4. Store hashed token in DB
          5. Cache plaintext token for admin display
        """
        tokens: List[Dict[str, Any]] = []
        generated_count = 0

        batch_size = 1000
        for i in range(0, len(electorate_ids), batch_size):
            batch_ids = electorate_ids[i: i + batch_size]

            result = await db.execute(
                select(Electorate).where(
                    and_(
                        Electorate.id.in_(batch_ids),
                        Electorate.is_deleted == False,
                    )
                )
            )
            electorates = result.scalars().all()

            for electorate in electorates:
                if electorate.has_voted:
                    continue

                # Revoke existing tokens
                await self._revoke_existing_tokens(db, electorate.id)

                # Generate new token
                token_plaintext = self._generate_token()
                expires = datetime.now(timezone.utc) + timedelta(
                    hours=settings.VOTING_TOKEN_EXPIRE_HOURS
                )

                voting_token = VotingToken(
                    electorate_id=electorate.id,
                    token_hash=self._hash_token(token_plaintext),
                    expires_at=expires,
                    is_active=True,
                    revoked=False,
                    failure_count=0,
                )
                db.add(voting_token)

                # Cache plaintext for admin display
                _cache_plaintext_token(str(electorate.id), token_plaintext)

                display_student_id = StudentIDConverter.to_display(electorate.student_id)
                tokens.append({
                    "electorate_id": str(electorate.id),
                    "student_id": display_student_id,
                    "name": electorate.name or display_student_id,
                    "token": token_plaintext,
                    "expires_at": expires.isoformat(),
                    "created": True,
                })
                generated_count += 1

        await db.commit()
        logger.info(
            "Generated %d tokens for %d requested electorates",
            generated_count,
            len(electorate_ids),
        )

        return {
            "success": True,
            "message": f"Generated {generated_count} tokens successfully",
            "generated_tokens": generated_count,
            "tokens": tokens,
            "notifications_queued": False,
        }

    async def generate_tokens_for_all_electorates(
        self,
        db: AsyncSession,
        exclude_voted: bool = True,
        **kwargs,
    ) -> Dict[str, Any]:
        """Generate tokens for all eligible electorates."""
        query = select(Electorate).where(Electorate.is_deleted == False)
        if exclude_voted:
            query = query.where(Electorate.has_voted == False)

        result = await db.execute(query)
        electorates = result.scalars().all()
        electorate_ids = [e.id for e in electorates]

        logger.info("Generating tokens for %d electorates", len(electorate_ids))
        return await self.generate_tokens_for_electorates(db, electorate_ids)

    async def generate_tokens_for_portfolio(
        self,
        db: AsyncSession,
        portfolio_id: UUID,
        **kwargs,
    ) -> Dict[str, Any]:
        """Generate tokens for electorates who haven't voted for a specific portfolio."""
        voted_result = await db.execute(
            select(Vote.electorate_id).where(
                and_(Vote.portfolio_id == portfolio_id, Vote.is_valid == True)
            )
        )
        voted_ids = [row[0] for row in voted_result.all()]

        query = select(Electorate).where(Electorate.is_deleted == False)
        if voted_ids:
            query = query.where(Electorate.id.not_in(voted_ids))

        result = await db.execute(query)
        electorate_ids = [e.id for e in result.scalars().all()]
        return await self.generate_tokens_for_electorates(db, electorate_ids)

    async def regenerate_token_for_electorate(
        self,
        db: AsyncSession,
        electorate_id: UUID,
        **kwargs,
    ) -> Dict[str, Any]:
        """Regenerate token for a single electorate."""
        result = await self.generate_tokens_for_electorates(db, [electorate_id])
        if result["generated_tokens"] > 0:
            token_info = result["tokens"][0]
            return {
                "success": True,
                "message": "Token regenerated successfully",
                "token": token_info["token"],
                "expires_at": token_info["expires_at"],
                "notification_sent": False,
            }
        return {
            "success": False,
            "message": "Failed to regenerate token (voter may have already voted)",
            "token": None,
            "expires_at": None,
            "notification_sent": False,
        }

    async def get_token_statistics(self, db: AsyncSession) -> Dict[str, Any]:
        """Token statistics summary."""
        total = (
            await db.execute(
                select(func.count(Electorate.id)).where(Electorate.is_deleted == False)
            )
        ).scalar() or 0

        voted = (
            await db.execute(
                select(func.count(Electorate.id)).where(
                    and_(Electorate.is_deleted == False, Electorate.has_voted == True)
                )
            )
        ).scalar() or 0

        active_tokens = (
            await db.execute(
                select(func.count(VotingToken.id)).where(
                    and_(
                        VotingToken.revoked == False,
                        VotingToken.is_active == True,
                        VotingToken.expires_at > datetime.now(timezone.utc),
                    )
                )
            )
        ).scalar() or 0

        return {
            "total_electorates": total,
            "voted_electorates": voted,
            "voters_remaining": total - voted,
            "active_tokens": active_tokens,
            "turnout_percentage": round((voted / total * 100) if total > 0 else 0, 2),
        }


__all__ = ["BulkTokenGenerator", "StudentIDConverter"]