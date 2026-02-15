"""
Offline Admin Router
Admin operations for offline voting system
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.schemas.electorates import (
    BulkTokenGenerationRequest,
    ElectorateOut,
    ElectionResults,
    SingleTokenRegenerationRequest,
    SingleTokenRegenerationResponse,
    TokenGenerationRequest,
    TokenGenerationResponse
)
from app.services.token_generation_service import BulkTokenGenerator
from app.crud.crud_electorates import get_electorates, get_electorate
from app.crud.crud_portfolios import get_portfolio_statistics
from app.crud.crud_candidates import get_candidate_statistics
from app.crud.crud_votes import (
    get_voting_statistics_engine,
    get_all_election_results,
    get_recent_votes_engine,
)
from app.crud.crud_voting_tokens import get_electorates_with_tokens
from app.middleware.auth_middleware import get_current_admin, get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])
token_generator = BulkTokenGenerator()


@router.post("/generate-tokens/all", response_model=TokenGenerationResponse)
async def generate_tokens_for_all(
    request: TokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Generate voting tokens for all eligible electorates
    
    Args:
        request: Token generation request
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        TokenGenerationResponse with generated tokens
    """
    result = await token_generator.generate_tokens_for_all_electorates(
        db=db,
        exclude_voted=request.exclude_voted,
    )
    return result


@router.post("/generate-tokens/bulk", response_model=TokenGenerationResponse)
async def generate_tokens_for_selected(
    request: BulkTokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Generate voting tokens for selected electorates
    
    Args:
        request: Bulk token generation request
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        TokenGenerationResponse with generated tokens
    """
    result = await token_generator.generate_tokens_for_electorates(
        db=db,
        electorate_ids=request.electorate_ids,
    )
    return result


@router.post("/regenerate-token/{electorate_id}", response_model=SingleTokenRegenerationResponse)
async def regenerate_token(
    electorate_id: uuid.UUID,
    request: SingleTokenRegenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Regenerate voting token for a single electorate
    
    Args:
        electorate_id: Electorate UUID
        request: Token regeneration request
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        SingleTokenRegenerationResponse with new token
    """
    result = await token_generator.regenerate_token_for_electorate(
        db=db,
        electorate_id=electorate_id,
    )
    return result


@router.post("/generate-tokens/portfolio/{portfolio_id}")
async def generate_tokens_for_portfolio(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Generate voting tokens for electorates who haven't voted for a portfolio
    
    Args:
        portfolio_id: Portfolio UUID
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        TokenGenerationResponse with generated tokens
    """
    result = await token_generator.generate_tokens_for_portfolio(
        db=db,
        portfolio_id=portfolio_id,
    )
    return result


@router.get("/voters")
async def list_voters(
    skip: int = 0,
    limit: int = 100,
    has_voted: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    List electorates with optional filtering
    
    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        has_voted: Optional filter by voting status
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        List of electorates
    """
    voters = await get_electorates(db, skip=skip, limit=limit)
    
    # Apply has_voted filter if provided
    if has_voted is not None:
        voters = [v for v in voters if v.has_voted == has_voted]
    
    return voters


@router.get("/voters/{voter_id}", response_model=ElectorateOut)
async def get_voter(
    voter_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Get detailed information about a specific voter
    
    Args:
        voter_id: Voter UUID
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        ElectorateOut with voter details
        
    Raises:
        HTTPException: If voter not found
    """
    voter = await get_electorate(db, voter_id)
    if not voter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voter not found"
        )
    return voter


@router.get("/electorate-tokens")
async def get_electorate_tokens_endpoint(
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Get all electorates with their active voting tokens
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        List of electorates with their tokens (plain text for admins only)
    """
    return await get_electorates_with_tokens(db)


@router.get("/statistics")
async def get_election_statistics(
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Get comprehensive election statistics
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        Dictionary with various statistics
    """
    return {
        "voting": await get_voting_statistics_engine(db),
        "tokens": await token_generator.get_token_statistics(db),
        "portfolios": await get_portfolio_statistics(db),
        "candidates": await get_candidate_statistics(db),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/results", response_model=List[ElectionResults])
async def get_election_results(
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Get election results for all portfolios
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        List of election results by portfolio
    """
    return await get_all_election_results(db)


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Get recent voting activity
    
    Args:
        limit: Maximum number of recent votes to return
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        Dictionary with recent votes and statistics
    """
    recent_votes = await get_recent_votes_engine(db, limit=limit)
    
    return {
        "recent_votes": recent_votes,
        "total_recent_votes": len(recent_votes),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/token-statistics")
async def get_token_statistics(
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Get detailed token generation statistics
    
    Args:
        db: Database session
        current_admin: Current authenticated admin
        
    Returns:
        Dictionary with token statistics
    """
    return await token_generator.get_token_statistics(db)


__all__ = ["router"]