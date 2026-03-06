"""
CRUD operations for Candidate management.

Candidates belong to Portfolios, which belong to Elections.
Election scoping is applied by joining through Portfolio.election_id.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.models.electorates import Candidate, Portfolio, Vote
from app.schemas.electorates import CandidateCreate, CandidateUpdate


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_candidate_engine(
    db: AsyncSession,
    candidate_data: CandidateCreate,
) -> Candidate:
    """
    Create a new candidate.

    The route handler must verify the parent portfolio belongs to the
    active election and is still in DRAFT status before calling this.
    """
    candidate = Candidate(**candidate_data.model_dump())
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)

    result = await db.execute(
        select(Candidate)
        .options(selectinload(Candidate.portfolio))
        .where(Candidate.id == candidate.id)
    )
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_candidate_engine(
    db: AsyncSession,
    candidate_id: UUID,
    election_id: Optional[UUID] = None,
) -> Optional[Candidate]:
    """
    Fetch a candidate by ID.

    If election_id is supplied the query joins through Portfolio to verify
    the candidate belongs to the correct election.  This prevents candidates
    from one election being accessed via another election's routes.
    """
    query = (
        select(Candidate)
        .options(selectinload(Candidate.portfolio))
        .where(Candidate.id == candidate_id)
    )
    if election_id is not None:
        query = query.join(Portfolio, Candidate.portfolio_id == Portfolio.id).where(
            Portfolio.election_id == election_id
        )

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_candidates_by_portfolio(
    db: AsyncSession,
    portfolio_id: UUID,
    active_only: bool = True,
) -> List[Candidate]:
    """Return all candidates for a given portfolio."""
    query = (
        select(Candidate)
        .options(selectinload(Candidate.portfolio))
        .where(Candidate.portfolio_id == portfolio_id)
    )
    if active_only:
        query = query.where(Candidate.is_active == True)
    query = query.order_by(Candidate.display_order, Candidate.name)

    return (await db.execute(query)).scalars().all()


async def get_candidates(
    db: AsyncSession,
    election_id: UUID,
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
) -> List[Candidate]:
    """
    Return all candidates for a given election (joined through Portfolio).
    """
    query = (
        select(Candidate)
        .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
        .options(selectinload(Candidate.portfolio))
        .where(Portfolio.election_id == election_id)
    )
    if active_only:
        query = query.where(Candidate.is_active == True)

    query = query.order_by(
        Portfolio.voting_order, Candidate.display_order, Candidate.name
    ).offset(skip).limit(limit)

    return (await db.execute(query)).scalars().all()


async def get_candidates_for_voting(
    db: AsyncSession,
    portfolio_id: UUID,
    election_id: UUID,
) -> List[Candidate]:
    """
    Return active candidates for a portfolio for the voting interface.

    Scoped by both portfolio_id and election_id to prevent cross-election
    data leakage if a stale portfolio_id is submitted.
    """
    result = await db.execute(
        select(Candidate)
        .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
        .options(selectinload(Candidate.portfolio))
        .where(
            and_(
                Candidate.portfolio_id == portfolio_id,
                Portfolio.election_id == election_id,
                Candidate.is_active == True,
                Portfolio.is_active == True,
            )
        )
        .order_by(Candidate.display_order, Candidate.name)
    )
    return result.scalars().all()


async def get_candidate_with_votes(
    db: AsyncSession,
    candidate_id: UUID,
    election_id: UUID,
) -> Optional[Dict[str, Any]]:
    """Candidate detail with vote count, scoped to a specific election."""
    candidate_result = await db.execute(
        select(Candidate)
        .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
        .options(selectinload(Candidate.portfolio))
        .where(
            and_(
                Candidate.id == candidate_id,
                Portfolio.election_id == election_id,
            )
        )
    )
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        return None

    vote_count = (
        await db.execute(
            select(func.count(Vote.id)).where(
                and_(
                    Vote.candidate_id == candidate_id,
                    Vote.election_id == election_id,
                    Vote.is_valid == True,
                )
            )
        )
    ).scalar() or 0

    return {"candidate": candidate, "vote_count": vote_count}


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_candidate_engine(
    db: AsyncSession,
    candidate_id: UUID,
    candidate_data: CandidateUpdate,
    election_id: Optional[UUID] = None,
) -> Optional[Candidate]:
    """Update a candidate.  Optionally scope by election_id for safety."""
    query = select(Candidate).where(Candidate.id == candidate_id)
    if election_id is not None:
        query = query.join(Portfolio, Candidate.portfolio_id == Portfolio.id).where(
            Portfolio.election_id == election_id
        )

    result = await db.execute(query)
    candidate = result.scalar_one_or_none()
    if not candidate:
        return None

    for field, value in candidate_data.model_dump(exclude_unset=True).items():
        setattr(candidate, field, value)

    candidate.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(candidate)
    return candidate


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def delete_candidate_engine(
    db: AsyncSession,
    candidate_id: UUID,
    election_id: Optional[UUID] = None,
) -> bool:
    """
    Delete a candidate.

    Only permitted when the election is in DRAFT status — the route handler
    must enforce this.  Cascade deletes any votes for this candidate.
    """
    query = select(Candidate).where(Candidate.id == candidate_id)
    if election_id is not None:
        query = query.join(Portfolio, Candidate.portfolio_id == Portfolio.id).where(
            Portfolio.election_id == election_id
        )

    result = await db.execute(query)
    candidate = result.scalar_one_or_none()
    if not candidate:
        return False

    await db.delete(candidate)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

async def get_candidate_statistics(
    db: AsyncSession,
    election_id: UUID,
) -> Dict[str, Any]:
    """Aggregate candidate stats for a specific election."""
    total = (
        await db.execute(
            select(func.count(Candidate.id))
            .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
            .where(Portfolio.election_id == election_id)
        )
    ).scalar() or 0

    active = (
        await db.execute(
            select(func.count(Candidate.id))
            .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
            .where(
                and_(
                    Portfolio.election_id == election_id,
                    Candidate.is_active == True,
                )
            )
        )
    ).scalar() or 0

    with_pictures = (
        await db.execute(
            select(func.count(Candidate.id))
            .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
            .where(
                and_(
                    Portfolio.election_id == election_id,
                    Candidate.picture_url.isnot(None),
                )
            )
        )
    ).scalar() or 0

    by_portfolio = (
        await db.execute(
            select(
                Portfolio.name,
                func.count(Candidate.id).label("candidate_count"),
            )
            .join(Candidate, Portfolio.id == Candidate.portfolio_id)
            .where(
                and_(
                    Portfolio.election_id == election_id,
                    Candidate.is_active == True,
                )
            )
            .group_by(Portfolio.id, Portfolio.name)
            .order_by(func.count(Candidate.id).desc())
        )
    ).all()

    return {
        "total_candidates": total,
        "active_candidates": active,
        "inactive_candidates": total - active,
        "candidates_with_pictures": with_pictures,
        "candidates_by_portfolio": [
            {"portfolio_name": row.name, "candidate_count": row.candidate_count}
            for row in by_portfolio
        ],
    }


async def search_candidates(
    db: AsyncSession,
    search_term: str,
    election_id: UUID,
    portfolio_id: Optional[UUID] = None,
    limit: int = 20,
) -> List[Candidate]:
    """Full-text search across candidate name and manifesto within an election."""
    query = (
        select(Candidate)
        .join(Portfolio, Candidate.portfolio_id == Portfolio.id)
        .options(selectinload(Candidate.portfolio))
        .where(
            and_(
                Portfolio.election_id == election_id,
                Candidate.is_active == True,
                or_(
                    Candidate.name.ilike(f"%{search_term}%"),
                    Candidate.manifesto.ilike(f"%{search_term}%"),
                ),
            )
        )
    )
    if portfolio_id:
        query = query.where(Candidate.portfolio_id == portfolio_id)

    query = query.order_by(Candidate.name).limit(limit)
    return (await db.execute(query)).scalars().all()