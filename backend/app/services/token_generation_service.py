"""
Offline Token Generation Service
Brand new implementation for on-site voting.
No online dependencies.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from uuid import UUID
import logging
import hashlib
import secrets

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.models.electorates import Electorate, VotingToken, Vote

logger = logging.getLogger(__name__)


class BulkTokenGenerator:
    """Token generator for offline voting"""

    def __init__(self):
        pass

    @staticmethod
    def _generate_token() -> str:
        """Generate simple token: AB12-CD34"""
        chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        code = ''.join(secrets.choice(chars) for _ in range(8))
        return f"{code[:2]}{code[2:4]}-{code[4:6]}{code[6:8]}"

    @staticmethod
    def _hash_token(token: str) -> str:
        """Hash token"""
        clean = token.replace("-", "").upper()
        return hashlib.sha256(clean.encode()).hexdigest()

    async def generate_tokens_for_electorates(
        self, db: AsyncSession, electorate_ids: List[UUID], **kwargs
    ) -> Dict[str, Any]:
        """Generate tokens"""
        tokens = []
        
        for eid in electorate_ids:
            e = await db.get(Electorate, eid)
            if not e or e.is_deleted or e.has_voted:
                continue
            
            # Revoke old
            old = (await db.execute(
                select(VotingToken).where(
                    VotingToken.electorate_id == eid,
                    VotingToken.revoked == False
                )
            )).scalars()
            for o in old:
                o.revoked = True
            
            # New token
            token = self._generate_token()
            expires = datetime.now(timezone.utc) + timedelta(hours=4)
            
            vt = VotingToken(
                electorate_id=eid,
                token_hash=self._hash_token(token),
                device_fingerprint="offline",
                device_info={},
                ip_address="127.0.0.1",
                user_agent="Offline",
                expires_at=expires,
                is_active=True,
                revoked=False,
            )
            db.add(vt)
            
            tokens.append({
                "electorate_id": str(eid),
                "student_id": e.student_id,
                "token": token,
                "expires_at": expires.isoformat(),
            })
        
        await db.commit()
        return {
            "success": True,
            "generated_tokens": len(tokens),
            "tokens": tokens,
        }

    async def generate_tokens_for_all_electorates(
        self, db: AsyncSession, exclude_voted: bool = True, **kwargs
    ) -> Dict[str, Any]:
        """Generate for all"""
        q = select(Electorate).where(Electorate.is_deleted == False)
        if exclude_voted:
            q = q.where(Electorate.has_voted == False)
        
        es = (await db.execute(q)).scalars().all()
        return await self.generate_tokens_for_electorates(db, [e.id for e in es])

    async def generate_tokens_for_portfolio(
        self, db: AsyncSession, portfolio_id: UUID, **kwargs
    ) -> Dict[str, Any]:
        """Generate for portfolio"""
        voted = (await db.execute(
            select(Vote.electorate_id).where(
                Vote.portfolio_id == portfolio_id,
                Vote.is_valid == True
            )
        )).scalars().all()
        
        q = select(Electorate).where(Electorate.is_deleted == False)
        if voted:
            q = q.where(Electorate.id.not_in(voted))
        
        es = (await db.execute(q)).scalars().all()
        return await self.generate_tokens_for_electorates(db, [e.id for e in es])

    async def regenerate_token_for_electorate(
        self, db: AsyncSession, electorate_id: UUID, **kwargs
    ) -> Dict[str, Any]:
        """Regenerate"""
        r = await self.generate_tokens_for_electorates(db, [electorate_id])
        if r["generated_tokens"] > 0:
            return {
                "success": True,
                "message": "Token regenerated successfully",
                "token": r["tokens"][0]["token"],
                "expires_at": r["tokens"][0]["expires_at"],
            }
        return {"success": False, "token": None}

    async def get_token_statistics(self, db: AsyncSession) -> Dict[str, Any]:
        """Stats"""
        total = await db.scalar(
            select(func.count(Electorate.id)).where(Electorate.is_deleted == False)
        )
        voted = await db.scalar(
            select(func.count(Electorate.id)).where(
                Electorate.is_deleted == False,
                Electorate.has_voted == True
            )
        )
        return {
            "total_electorates": total,
            "voted_electorates": voted,
            "voters_remaining": total - voted,
        }

    async def _get_electorates_with_details(
        self, db: AsyncSession, electorate_ids: List[UUID]
    ) -> List[Electorate]:
        """Get electorates"""
        r = await db.execute(
            select(Electorate).where(
                Electorate.id.in_(electorate_ids),
                Electorate.is_deleted == False
            )
        )
        return r.scalars().all()