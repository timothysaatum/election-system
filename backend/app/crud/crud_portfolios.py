"""
CRUD operations for Portfolio management.

All queries are election-scoped via election_id.  Passing the wrong
election_id will simply return empty results rather than mixing data
from different elections.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models.electorates import Candidate, Portfolio, Vote
from app.schemas.electorates import PortfolioCreate, PortfolioUpdate


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_portfolio_engine(
    db: AsyncSession,
    portfolio_data: PortfolioCreate,   # now carries election_id — was missing before
) -> Portfolio:
    """Create a new portfolio for a specific election."""
    portfolio = Portfolio(**portfolio_data.model_dump())
    db.add(portfolio)
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_portfolio_engine(
    db: AsyncSession,
    portfolio_id: UUID,
    election_id: Optional[UUID] = None,
) -> Optional[Portfolio]:
    """
    Fetch a portfolio by ID.

    If election_id is supplied the query also filters on it, preventing
    a portfolio from one election being accessed via another election's routes.
    """
    query = (
        select(Portfolio)
        .options(selectinload(Portfolio.candidates))
        .where(Portfolio.id == portfolio_id)
    )
    if election_id is not None:
        query = query.where(Portfolio.election_id == election_id)

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_portfolio_by_name(
    db: AsyncSession,
    name: str,
    election_id: UUID,
) -> Optional[Portfolio]:
    """Fetch a portfolio by name within a specific election."""
    result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.name == name,
                Portfolio.election_id == election_id,
            )
        )
    )
    return result.scalar_one_or_none()


async def get_portfolios(
    db: AsyncSession,
    election_id: UUID,
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
) -> List[Portfolio]:
    """Return all portfolios for a given election."""
    query = (
        select(Portfolio)
        .options(selectinload(Portfolio.candidates))
        .where(Portfolio.election_id == election_id)
    )
    if active_only:
        query = query.where(Portfolio.is_active == True)

    query = query.order_by(Portfolio.voting_order, Portfolio.name).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def get_portfolio_with_stats(
    db: AsyncSession,
    portfolio_id: UUID,
    election_id: UUID,
) -> Optional[Dict[str, Any]]:
    """Portfolio with per-candidate vote counts for the admin dashboard."""
    portfolio_result = await db.execute(
        select(Portfolio)
        .options(selectinload(Portfolio.candidates))
        .where(
            and_(
                Portfolio.id == portfolio_id,
                Portfolio.election_id == election_id,
            )
        )
    )
    portfolio = portfolio_result.scalar_one_or_none()
    if not portfolio:
        return None

    # Per-candidate vote counts in one query
    vote_counts_result = await db.execute(
        select(
            Candidate.id,
            func.count(Vote.id).label("vote_count"),
        )
        .outerjoin(Vote, and_(Vote.candidate_id == Candidate.id, Vote.is_valid == True))
        .where(Candidate.portfolio_id == portfolio_id)
        .group_by(Candidate.id)
    )
    vote_map = {row.id: row.vote_count for row in vote_counts_result}

    total_votes = sum(vote_map.values())

    # Attach vote_count to each candidate (transient attribute)
    for candidate in portfolio.candidates:
        candidate.vote_count = vote_map.get(candidate.id, 0)

    return {
        "portfolio": portfolio,
        "total_votes": total_votes,
        "candidate_count": len(portfolio.candidates),
    }


async def get_active_portfolios_for_voting(
    db: AsyncSession,
    election_id: UUID,
) -> List[Candidate]:
    """
    Return all active candidates for an election, ordered for the ballot UI.

    Returns Candidate objects (with Portfolio eagerly loaded) rather than
    Portfolio objects, because the voting interface iterates candidates and
    needs portfolio details attached to each.
    """
    result = await db.execute(
        select(Candidate)
        .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
        .options(selectinload(Candidate.portfolio))
        .where(
            and_(
                Portfolio.election_id == election_id,
                Portfolio.is_active == True,
                Candidate.is_active == True,
            )
        )
        .order_by(
            Portfolio.voting_order,
            Portfolio.name,
            Candidate.display_order,
            Candidate.name,
        )
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_portfolio_engine(
    db: AsyncSession,
    portfolio_id: UUID,
    portfolio_data: PortfolioUpdate,
    election_id: Optional[UUID] = None,
) -> Optional[Portfolio]:
    """Update a portfolio.  Optionally scope by election_id for safety."""
    query = select(Portfolio).where(Portfolio.id == portfolio_id)
    if election_id is not None:
        query = query.where(Portfolio.election_id == election_id)

    result = await db.execute(query)
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        return None

    for field, value in portfolio_data.model_dump(exclude_unset=True).items():
        setattr(portfolio, field, value)

    portfolio.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def delete_portfolio_engine(
    db: AsyncSession,
    portfolio_id: UUID,
    election_id: Optional[UUID] = None,
) -> bool:
    """
    Delete a portfolio (and cascade-delete its candidates).

    Only permitted when the election is in DRAFT status — enforced by the
    route handler, not here.  Scoped by election_id when provided.
    """
    query = select(Portfolio).where(Portfolio.id == portfolio_id)
    if election_id is not None:
        query = query.where(Portfolio.election_id == election_id)

    result = await db.execute(query)
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        return False

    await db.delete(portfolio)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

async def get_portfolio_statistics(
    db: AsyncSession,
    election_id: UUID,
) -> Dict[str, Any]:
    """Aggregate portfolio stats for a specific election."""
    total = (
        await db.execute(
            select(func.count(Portfolio.id)).where(
                Portfolio.election_id == election_id
            )
        )
    ).scalar() or 0

    active = (
        await db.execute(
            select(func.count(Portfolio.id)).where(
                and_(
                    Portfolio.election_id == election_id,
                    Portfolio.is_active == True,
                )
            )
        )
    ).scalar() or 0

    with_candidates = (
        await db.execute(
            select(func.count(func.distinct(Portfolio.id)))
            .join(Candidate, Portfolio.id == Candidate.portfolio_id)
            .where(
                and_(
                    Portfolio.election_id == election_id,
                    Candidate.is_active == True,
                )
            )
        )
    ).scalar() or 0

    return {
        "total_portfolios": total,
        "active_portfolios": active,
        "inactive_portfolios": total - active,
        "portfolios_with_candidates": with_candidates,
    }