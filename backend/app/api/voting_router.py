"""
Voting Router - Offline Version
Brand new implementation for offline voting.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from datetime import datetime, timezone

from app.core.database import get_db
from app.middleware.auth_middleware import rate_limit_voting, get_current_voter
from app.models.electorates import Electorate, VotingSession
from app.schemas.electorates import (
    CandidateOut,
    VoteOut,
    VotingCreation,
    VotingSessionResponse,
)
from app.crud.crud_portfolios import get_active_portfolios_for_voting
from app.crud.crud_candidates import get_candidate_engine
from app.crud.crud_votes import (
    create_vote,
    get_votes_by_electorate,
    check_electorate_voted_for_portfolio,
)
from app.utils.security import TokenManager

router = APIRouter(prefix="/voting", tags=["Voting"])


@router.get("/ballot", response_model=List[CandidateOut])
async def get_voting_ballot(
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Get ballot"""
    return await get_active_portfolios_for_voting(db)


@router.post("/vote", response_model=VotingSessionResponse)
@rate_limit_voting
async def cast_vote(
    vote_data: VotingCreation,
    request: Request,
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Cast votes - offline mode"""
    
    # Get session
    session_id = None
    token = request.cookies.get("voting_session")
    if token:
        try:
            payload = TokenManager.decode_token(token)
            sid = payload.get("session_id")
            if sid:
                session_id = UUID(sid)
        except:
            pass
    
    votes = []
    
    # Process each vote
    for v in vote_data.votes:
        # Check if already voted
        if await check_electorate_voted_for_portfolio(db, electorate.id, v.portfolio_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Already voted for portfolio {v.portfolio_id}"
            )
        
        # Verify candidate
        c = await get_candidate_engine(db, v.candidate_id)
        if not c or c.portfolio_id != v.portfolio_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid candidate for portfolio {v.portfolio_id}"
            )
        
        # Create vote
        vote = await create_vote(
            db=db,
            vote_data=v,
            electorate_id=electorate.id,
            voting_session_id=session_id,
            ip_address="127.0.0.1",
            device_fingerprint="offline",
            user_agent="Offline",
        )
        votes.append(vote)
    
    # Mark as voted
    electorate.has_voted = True
    await db.commit()
    
    return VotingSessionResponse(
        success=True,
        message=f"{len(votes)} vote(s) cast",
        votes_cast=len(votes),
        failed_votes=[],
    )


@router.get("/my-votes", response_model=List[VoteOut])
async def get_my_votes(
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Get my votes"""
    return await get_votes_by_electorate(db, electorate.id)