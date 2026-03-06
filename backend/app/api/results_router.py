"""
Results Router

Returns election results per portfolio with candidate vote counts.
Requires authentication — results are not publicly readable during voting.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.election import get_active_election, get_election
from app.crud.crud_votes import get_all_election_results, get_single_portfolio_results
from app.middleware.auth_middleware import get_current_user
from app.schemas.electorates import ElectionResults


async def _resolve_election(db: AsyncSession, election_id: Optional[UUID]) -> UUID:
    """Return the supplied election_id or fall back to the active election."""
    if election_id:
        election = await get_election(db, election_id)
        if not election:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Election not found"
            )
        return election_id
    active = await get_active_election(db)
    if not active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active election found. Supply election_id explicitly.",
        )
    return active.id

router = APIRouter(prefix="/results", tags=["Results"])




@router.get("", response_model=List[ElectionResults])
async def get_election_results(
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Return results for all portfolios in an election.

    If election_id is omitted, falls back to the currently active election.
    Requires authentication — results must not be publicly readable during voting.
    """
    try:
        eid = await _resolve_election(db, election_id)
        return await get_all_election_results(db, eid)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve election results: {exc}",
        )


@router.get("/{portfolio_id}")
async def get_portfolio_results(
    portfolio_id: UUID,
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return results for a single portfolio."""
    try:
        eid = await _resolve_election(db, election_id)
        result = await get_single_portfolio_results(db, eid, portfolio_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found or has no results",
            )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve portfolio results: {exc}",
        )