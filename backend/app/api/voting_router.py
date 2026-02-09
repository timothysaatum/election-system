"""
Offline Voting Router
Simplified voting for offline operations
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from datetime import datetime, timezone

from app.core.database import get_db
from app.middleware.auth_middleware import rate_limit_voting, get_current_voter
from app.models.electorates import Electorate
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
    """
    Get voting ballot with all active portfolios and candidates
    
    Args:
        db: Database session
        electorate: Current authenticated electorate
        
    Returns:
        List of active portfolios with their candidates
    """
    return await get_active_portfolios_for_voting(db)


@router.post("/vote", response_model=VotingSessionResponse)
@rate_limit_voting
async def cast_vote(
    vote_data: VotingCreation,
    request: Request,
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """
    Cast votes for multiple portfolios - OFFLINE MODE
    
    Args:
        vote_data: Voting data containing list of votes
        request: HTTP request
        db: Database session
        electorate: Current authenticated electorate
        
    Returns:
        VotingSessionResponse with voting results
        
    Raises:
        HTTPException: If validation fails or voter has already voted
    """
    
    # Get session ID from token if available
    session_id = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = TokenManager.decode_token(token)
            sid = payload.get("session_id")
            if sid:
                session_id = UUID(sid)
        except:
            pass
    
    votes = []
    failed_votes = []
    
    # Process each vote
    for vote_request in vote_data.votes:
        try:
            # Check if already voted for this portfolio
            if await check_electorate_voted_for_portfolio(
                db, electorate.id, vote_request.portfolio_id
            ):
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Already voted for this portfolio"
                })
                continue
            
            # Verify candidate exists and belongs to portfolio
            candidate = await get_candidate_engine(db, vote_request.candidate_id)
            if not candidate:
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Candidate not found"
                })
                continue
            
            if candidate.portfolio_id != vote_request.portfolio_id:
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Candidate does not belong to this portfolio"
                })
                continue
            
            if not candidate.is_active:
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Candidate is not active"
                })
                continue
            
            # Create vote
            vote = await create_vote(
                db=db,
                vote_data=vote_request,
                electorate_id=electorate.id,
                voting_session_id=session_id,
                ip_address="127.0.0.1",
                device_fingerprint="offline",
                user_agent="Offline",
            )
            votes.append(vote)
            
        except Exception as e:
            failed_votes.append({
                "portfolio_id": str(vote_request.portfolio_id),
                "candidate_id": str(vote_request.candidate_id),
                "error": str(e)
            })
    
    # Mark electorate as voted if at least one vote succeeded
    if votes:
        electorate.has_voted = True
        electorate.voted_at = datetime.now(timezone.utc)
        await db.commit()
    
    # Determine success status
    success = len(votes) > 0
    
    # Build response message
    if success and not failed_votes:
        message = f"Successfully cast {len(votes)} vote(s)"
    elif success and failed_votes:
        message = f"Cast {len(votes)} vote(s), {len(failed_votes)} failed"
    else:
        message = "All votes failed"
    
    return VotingSessionResponse(
        success=success,
        message=message,
        votes_cast=len(votes),
        failed_votes=failed_votes,
    )


@router.get("/my-votes", response_model=List[VoteOut])
async def get_my_votes(
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """
    Get all votes cast by current electorate
    
    Args:
        db: Database session
        electorate: Current authenticated electorate
        
    Returns:
        List of votes cast by the electorate
    """
    return await get_votes_by_electorate(db, electorate.id)


@router.get("/status")
async def get_voting_status(
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """
    Get current voting status for the electorate
    
    Args:
        db: Database session
        electorate: Current authenticated electorate
        
    Returns:
        Voting status information
    """
    
    # Get votes cast
    votes = await get_votes_by_electorate(db, electorate.id)
    
    return {
        "has_voted": electorate.has_voted,
        "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
        "votes_cast": len(votes),
        "student_id": electorate.student_id,
        "can_vote": not electorate.has_voted,
    }


__all__ = ["router"]