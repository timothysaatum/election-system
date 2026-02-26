from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.crud_votes import get_all_election_results
from app.schemas.electorates import ElectionResults
from app.middleware.auth_middleware import get_current_user

router = APIRouter(prefix="/results", tags=["Results"])


@router.get("/results", response_model=List[ElectionResults])
async def get_election_results(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),  # requires any valid authenticated role
):
    """
    Get election results for all portfolios.
    Requires authentication — results must not be publicly readable during voting.
    """
    try:
        return await get_all_election_results(db)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve election results: {exc}",
        )