"""
Offline Token Generation Service
4-CHARACTER TOKENS (AB12 format)
Student ID conversion: slash to hyphen for storage
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from uuid import UUID
import logging
import hashlib
import secrets

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_

from app.models.electorates import Electorate, VotingToken, Vote

logger = logging.getLogger(__name__)


class StudentIDConverter:
    """Handle student ID conversion between slash and hyphen formats"""
    
    @staticmethod
    def to_storage(student_id: str) -> str:
        """
        Convert student ID from slash to hyphen format for storage
        Input: MLS/0201/19 → Output: MLS-0201-19
        """
        return student_id.replace("/", "-")
    
    @staticmethod
    def to_display(student_id: str) -> str:
        """
        Convert student ID from hyphen to slash format for display
        Input: MLS-0201-19 → Output: MLS/0201/19
        """
        return student_id.replace("-", "/")


class BulkTokenGenerator:
    """High-performance token generator for offline voting"""

    # Exclude confusing characters: 0, O, I, l, 1
    SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    def __init__(self):
        """Initialize token generator"""
        pass

    @staticmethod
    def _generate_token() -> str:
        """
        Generate voting token in format: AB12 (4 characters)
        
        Returns:
            4-character voting token
        """
        chars = BulkTokenGenerator.SAFE_CHARS
        code = ''.join(secrets.choice(chars) for _ in range(4))
        return code  # Returns 4-character token like "AB12"

    @staticmethod
    def _hash_token(token: str) -> str:
        """
        Hash token for storage
        
        Args:
            token: Token to hash
            
        Returns:
            SHA-256 hash
        """
        clean = token.replace("-", "").replace(" ", "").upper()
        return hashlib.sha256(clean.encode()).hexdigest()

    async def generate_tokens_for_electorates(
        self,
        db: AsyncSession,
        electorate_ids: List[UUID],
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate tokens for specific electorates
        
        Args:
            db: Database session
            electorate_ids: List of electorate IDs
            **kwargs: Additional parameters (ignored for offline compatibility)
            
        Returns:
            Dictionary with success status and generated tokens
        """
        tokens = []
        generated_count = 0
        
        # Process in batches for better performance
        batch_size = 1000
        for i in range(0, len(electorate_ids), batch_size):
            batch_ids = electorate_ids[i:i + batch_size]
            
            # Fetch electorates in batch
            result = await db.execute(
                select(Electorate).where(
                    and_(
                        Electorate.id.in_(batch_ids),
                        Electorate.is_deleted == False
                    )
                )
            )
            electorates = result.scalars().all()
            
            for electorate in electorates:
                # Skip if already voted
                if electorate.has_voted:
                    continue
                
                # Revoke old tokens for this electorate
                old_tokens_result = await db.execute(
                    select(VotingToken).where(
                        and_(
                            VotingToken.electorate_id == electorate.id,
                            VotingToken.revoked == False
                        )
                    )
                )
                old_tokens = old_tokens_result.scalars().all()
                for old_token in old_tokens:
                    old_token.revoked = True
                
                # Generate new token (4 characters)
                token = self._generate_token()
                expires = datetime.now(timezone.utc) + timedelta(hours=24)
                
                voting_token = VotingToken(
                    electorate_id=electorate.id,
                    token_hash=self._hash_token(token),
                    device_fingerprint="offline",
                    device_info={},
                    ip_address="127.0.0.1",
                    user_agent="Offline",
                    expires_at=expires,
                    is_active=True,
                    revoked=False,
                )
                db.add(voting_token)
                
                # Convert student_id for display (hyphen to slash)
                display_student_id = StudentIDConverter.to_display(electorate.student_id)
                
                tokens.append({
                    "electorate_id": str(electorate.id),
                    "student_id": display_student_id,  # Display with slashes
                    "name": display_student_id,
                    "token": token,
                    "expires_at": expires.isoformat(),
                    "created": True,
                })
                generated_count += 1
        
        # Commit all changes
        await db.commit()
        
        logger.info(f"Generated {generated_count} tokens for {len(electorate_ids)} electorates")
        
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
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate tokens for all electorates
        
        Args:
            db: Database session
            exclude_voted: If True, exclude electorates who have already voted
            **kwargs: Additional parameters (ignored for offline compatibility)
            
        Returns:
            Dictionary with success status and generated tokens
        """
        # Build query
        query = select(Electorate).where(Electorate.is_deleted == False)
        if exclude_voted:
            query = query.where(Electorate.has_voted == False)
        
        # Get all eligible electorates
        result = await db.execute(query)
        electorates = result.scalars().all()
        
        electorate_ids = [e.id for e in electorates]
        
        logger.info(f"Generating tokens for {len(electorate_ids)} electorates")
        
        return await self.generate_tokens_for_electorates(db, electorate_ids)

    async def generate_tokens_for_portfolio(
        self,
        db: AsyncSession,
        portfolio_id: UUID,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate tokens for electorates who haven't voted for a specific portfolio
        
        Args:
            db: Database session
            portfolio_id: Portfolio ID
            **kwargs: Additional parameters (ignored for offline compatibility)
            
        Returns:
            Dictionary with success status and generated tokens
        """
        # Get electorates who have voted for this portfolio
        voted_result = await db.execute(
            select(Vote.electorate_id).where(
                and_(
                    Vote.portfolio_id == portfolio_id,
                    Vote.is_valid == True
                )
            )
        )
        voted_ids = [row[0] for row in voted_result.all()]
        
        # Get all electorates except those who voted
        query = select(Electorate).where(Electorate.is_deleted == False)
        if voted_ids:
            query = query.where(Electorate.id.not_in(voted_ids))
        
        result = await db.execute(query)
        electorates = result.scalars().all()
        
        electorate_ids = [e.id for e in electorates]
        
        logger.info(f"Generating tokens for {len(electorate_ids)} electorates for portfolio {portfolio_id}")
        
        return await self.generate_tokens_for_electorates(db, electorate_ids)

    async def regenerate_token_for_electorate(
        self,
        db: AsyncSession,
        electorate_id: UUID,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Regenerate token for a single electorate
        
        Args:
            db: Database session
            electorate_id: Electorate ID
            **kwargs: Additional parameters (ignored for offline compatibility)
            
        Returns:
            Dictionary with success status and token details
        """
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
            "message": "Failed to regenerate token",
            "token": None,
            "expires_at": None,
            "notification_sent": False,
        }

    async def get_token_statistics(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Get token generation statistics
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with statistics
        """
        # Total electorates
        total_result = await db.execute(
            select(func.count(Electorate.id)).where(Electorate.is_deleted == False)
        )
        total = total_result.scalar() or 0
        
        # Voted electorates
        voted_result = await db.execute(
            select(func.count(Electorate.id)).where(
                and_(
                    Electorate.is_deleted == False,
                    Electorate.has_voted == True
                )
            )
        )
        voted = voted_result.scalar() or 0
        
        # Active tokens
        active_tokens_result = await db.execute(
            select(func.count(VotingToken.id)).where(
                and_(
                    VotingToken.revoked == False,
                    VotingToken.is_active == True,
                    VotingToken.expires_at > datetime.now(timezone.utc)
                )
            )
        )
        active_tokens = active_tokens_result.scalar() or 0
        
        return {
            "total_electorates": total,
            "voted_electorates": voted,
            "voters_remaining": total - voted,
            "active_tokens": active_tokens,
            "turnout_percentage": round((voted / total * 100) if total > 0 else 0, 2),
        }


__all__ = ["BulkTokenGenerator", "StudentIDConverter"]