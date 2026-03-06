"""
Portfolio Management Router

All endpoints require admin authentication.
election_id is required on every endpoint — portfolios belong to a specific
election and must always be queried in that context.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.crud_portfolios import (
    create_portfolio_engine,
    delete_portfolio_engine,
    get_portfolio_by_name,
    get_portfolio_engine,
    get_portfolios,
    update_portfolio_engine,
)
from app.middleware.auth_middleware import get_current_admin
from app.schemas.electorates import PortfolioCreate, PortfolioOut, PortfolioUpdate

router = APIRouter(prefix="/portfolios", tags=["Portfolio Management"])


@router.post("", response_model=PortfolioOut, status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    portfolio_data: PortfolioCreate,   # carries election_id — was missing before
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Create a new portfolio.  PortfolioCreate must include election_id."""
    try:
        # Check for name collision within this election
        existing = await get_portfolio_by_name(
            db, portfolio_data.name, portfolio_data.election_id
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A portfolio with this name already exists in this election",
            )
        return await create_portfolio_engine(db, portfolio_data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create portfolio: {exc}",
        )


@router.get("", response_model=List[PortfolioOut])
async def list_portfolios(
    election_id: UUID,
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """List all portfolios for a specific election."""
    try:
        return await get_portfolios(
            db, election_id=election_id, skip=skip, limit=limit, active_only=active_only
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve portfolios: {exc}",
        )


@router.get("/{portfolio_id}", response_model=PortfolioOut)
async def get_portfolio(
    portfolio_id: UUID,
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Get a specific portfolio scoped to an election."""
    try:
        portfolio = await get_portfolio_engine(db, portfolio_id, election_id)
        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found"
            )
        return portfolio
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve portfolio: {exc}",
        )


@router.patch("/{portfolio_id}", response_model=PortfolioOut)
async def update_portfolio(
    portfolio_id: UUID,
    election_id: UUID,
    portfolio_data: PortfolioUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Update a portfolio (scoped to its election)."""
    try:
        portfolio = await update_portfolio_engine(
            db, portfolio_id, portfolio_data, election_id=election_id
        )
        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found"
            )
        return portfolio
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update portfolio: {exc}",
        )


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio(
    portfolio_id: UUID,
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Delete a portfolio and all its candidates.
    Only permitted when the election is in DRAFT status — enforce this in
    the admin UI before calling this endpoint.
    """
    try:
        success = await delete_portfolio_engine(db, portfolio_id, election_id=election_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete portfolio: {exc}",
        )