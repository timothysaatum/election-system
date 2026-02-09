"""
Voting Middleware
"""

from fastapi import Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
import logging

from app.crud.crud_candidates import get_candidate_engine
from app.crud.crud_portfolios import get_portfolio_engine
from app.crud.crud_votes import check_electorate_voted_for_portfolio

logger = logging.getLogger(__name__)


class VotingSecurityValidator:
    """validator"""

    @staticmethod
    async def validate_vote_request(
        db: AsyncSession,
        electorate_id: str,
        portfolio_id: str,
        candidate_id: str,
        request: Request
    ) -> Dict[str, Any]:
        """Validate vote"""
        
        # Check already voted
        if await check_electorate_voted_for_portfolio(db, electorate_id, portfolio_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Already voted for this portfolio"
            )
        
        # Check portfolio
        portfolio = await get_portfolio_engine(db, portfolio_id)
        if not portfolio or not portfolio.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found or inactive"
            )
        
        # Check candidate
        candidate = await get_candidate_engine(db, candidate_id)
        if not candidate or not candidate.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found or inactive"
            )
        
        if candidate.portfolio_id != portfolio_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate not in portfolio"
            )
        
        return {
            "valid": True,
            "portfolio": portfolio,
            "candidate": candidate,
            "device_info": {"fingerprint": "offline", "client_ip": "127.0.0.1"}
        }