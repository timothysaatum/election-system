"""
Admin Router - Offline Version
Brand new implementation for offline token management.
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
from app.middleware.auth_middleware import get_current_admin, get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])
token_generator = BulkTokenGenerator()


@router.post("/generate-tokens/all", response_model=TokenGenerationResponse)
async def generate_tokens_for_all(
    request: TokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Generate tokens for all voters"""
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
    """Generate tokens for selected voters"""
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
    """Regenerate token for one voter"""
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
    """Generate tokens for portfolio voters"""
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
    """List voters"""
    voters = await get_electorates(db, skip=skip, limit=limit)
    if has_voted is not None:
        voters = [v for v in voters if v.has_voted == has_voted]
    return voters


@router.get("/voters/{voter_id}", response_model=ElectorateOut)
async def get_voter(
    voter_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Get voter details"""
    voter = await get_electorate(db, voter_id)
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return voter


@router.get("/statistics")
async def get_election_statistics(
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """Get stats"""
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
    """Get results"""
    return await get_all_election_results(db)


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Get recent votes"""
    recent_votes = await get_recent_votes_engine(db, limit=limit)
    return {
        "recent_votes": recent_votes,
        "total_recent_votes": len(recent_votes),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }