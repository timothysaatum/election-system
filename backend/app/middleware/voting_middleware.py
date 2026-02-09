"""
Offline Voting Middleware
Simplified validation for offline voting
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
import logging

from app.crud.crud_candidates import get_candidate_engine
from app.crud.crud_portfolios import get_portfolio_engine
from app.crud.crud_votes import check_electorate_voted_for_portfolio

logger = logging.getLogger(__name__)


class VotingSecurityValidator:
    """Offline voting validation"""

    @staticmethod
    async def validate_vote_request(
        db: AsyncSession,
        electorate_id: str,
        portfolio_id: str,
        candidate_id: str,
    ) -> Dict[str, Any]:
        """
        Validate vote request
        
        Args:
            db: Database session
            electorate_id: Electorate ID
            portfolio_id: Portfolio ID
            candidate_id: Candidate ID
            
        Returns:
            Dictionary with validation results
            
        Raises:
            HTTPException: If validation fails
        """
        
        # Check if already voted for this portfolio
        if await check_electorate_voted_for_portfolio(db, electorate_id, portfolio_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Already voted for this portfolio"
            )
        
        # Check portfolio exists and is active
        portfolio = await get_portfolio_engine(db, portfolio_id)
        if not portfolio or not portfolio.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found or inactive"
            )
        
        # Check candidate exists and is active
        candidate = await get_candidate_engine(db, candidate_id)
        if not candidate or not candidate.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or inactive"
            )
        
        # Verify candidate belongs to portfolio
        if candidate.portfolio_id != portfolio_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate does not belong to this portfolio"
            )
        
        return {
            "valid": True,
            "portfolio": portfolio,
            "candidate": candidate,
        }


__all__ = ["VotingSecurityValidator"]