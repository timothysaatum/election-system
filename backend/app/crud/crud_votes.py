"""
CRUD operations for Vote management
All election result queries use a single aggregated SQL query — no N+1.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, and_, desc, case
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from app.models.electorates import Vote, Candidate, Portfolio, Electorate
from app.schemas.electorates import VoteCreate


async def create_vote(
    db: AsyncSession,
    vote_data: VoteCreate,
    electorate_id: UUID,
    voting_session_id: Optional[UUID],
    ip_address: str,
    user_agent: str,
) -> Vote:
    """
    Create a vote.  Raises IntegrityError if the DB UNIQUE constraint on
    (electorate_id, portfolio_id) is violated — i.e. double-vote attempt.
    The caller must handle IntegrityError separately from other exceptions.
    """
    vote = Vote(
        electorate_id=electorate_id,
        portfolio_id=vote_data.portfolio_id,
        candidate_id=vote_data.candidate_id,
        voting_session_id=voting_session_id,
        vote_type=getattr(vote_data, "vote_type", "endorsed"),
        ip_address=ip_address,
        user_agent=user_agent,
        voted_at=datetime.now(timezone.utc),
    )
    db.add(vote)
    await db.flush()   # Let the constraint fire before commit
    return vote


async def get_vote(db: AsyncSession, vote_id: UUID) -> Optional[Vote]:
    result = await db.execute(
        select(Vote)
        .options(
            selectinload(Vote.electorate),
            selectinload(Vote.portfolio),
            selectinload(Vote.candidate),
        )
        .where(Vote.id == vote_id)
    )
    return result.scalar_one_or_none()


async def get_votes_by_electorate(
    db: AsyncSession,
    electorate_id: UUID,
    valid_only: bool = True,
) -> List[Vote]:
    query = (
        select(Vote)
        .options(selectinload(Vote.portfolio), selectinload(Vote.candidate))
        .where(Vote.electorate_id == electorate_id)
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    query = query.order_by(desc(Vote.voted_at))
    return (await db.execute(query)).scalars().all()


async def get_votes_by_portfolio(
    db: AsyncSession,
    portfolio_id: UUID,
    valid_only: bool = True,
) -> List[Vote]:
    query = (
        select(Vote)
        .options(selectinload(Vote.electorate), selectinload(Vote.candidate))
        .where(Vote.portfolio_id == portfolio_id)
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    return (await db.execute(query)).scalars().all()


async def check_electorate_voted_for_portfolio(
    db: AsyncSession,
    electorate_id: UUID,
    portfolio_id: UUID,
) -> bool:
    result = await db.execute(
        select(Vote.id)
        .where(
            and_(
                Vote.electorate_id == electorate_id,
                Vote.portfolio_id == portfolio_id,
                Vote.is_valid == True,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_vote_count_by_candidate(
    db: AsyncSession, candidate_id: UUID, valid_only: bool = True
) -> int:
    query = select(func.count(Vote.id)).where(Vote.candidate_id == candidate_id)
    if valid_only:
        query = query.where(Vote.is_valid == True)
    return (await db.execute(query)).scalar() or 0


async def get_vote_count_by_portfolio(
    db: AsyncSession, portfolio_id: UUID, valid_only: bool = True
) -> int:
    query = select(func.count(Vote.id)).where(Vote.portfolio_id == portfolio_id)
    if valid_only:
        query = query.where(Vote.is_valid == True)
    return (await db.execute(query)).scalar() or 0


# ---------------------------------------------------------------------------
# Election results — single aggregated query, no N+1
# ---------------------------------------------------------------------------

async def get_all_election_results(db: AsyncSession) -> List[Dict[str, Any]]:
    """
    Return election results for all active portfolios in a SINGLE query.

    Winner determination rules:
      - Multi-candidate: candidate with the most 'endorsed' votes wins.
        If two or more candidates share the highest endorsed count → TIE,
        no winner is declared (winner = None).
      - Single-candidate: endorsed > rejected → passed (handled frontend).
      - Abstain votes count toward total_votes for the portfolio but do NOT
        count for or against any candidate in winner determination.

    Result shape:
        [{
            portfolio_id, portfolio_name,
            total_votes,        # endorsed + rejected + abstained (all valid votes)
            total_rejected,
            total_abstained,
            candidates: [{
                id, name, picture_url,
                vote_count,      # endorsed votes
                rejected_count,  # rejected votes
                abstain_count,   # abstain votes
                total_votes,     # candidate-level: endorsed + rejected + abstained
            }],
            winner: { same shape } | None   (None on tie or no votes)
        }]
    """
    rows = (
        await db.execute(
            select(
                Portfolio.id.label("portfolio_id"),
                Portfolio.name.label("portfolio_name"),
                Portfolio.voting_order,
                Candidate.id.label("candidate_id"),
                Candidate.name.label("candidate_name"),
                Candidate.picture_url,
                func.sum(
                    case((Vote.vote_type == "endorsed", 1), else_=0)
                ).label("endorsed"),
                func.sum(
                    case((Vote.vote_type == "rejected", 1), else_=0)
                ).label("rejected"),
                func.sum(
                    case((Vote.vote_type == "abstained", 1), else_=0)
                ).label("abstained"),
            )
            .select_from(Portfolio)
            .join(Candidate, Candidate.portfolio_id == Portfolio.id)
            .outerjoin(
                Vote,
                and_(Vote.candidate_id == Candidate.id, Vote.is_valid == True),
            )
            .where(Portfolio.is_active == True, Candidate.is_active == True)
            .group_by(
                Portfolio.id,
                Portfolio.name,
                Portfolio.voting_order,
                Candidate.id,
                Candidate.name,
                Candidate.picture_url,
            )
            # Order by endorsed DESC so highest vote-getter comes first per portfolio
            .order_by(Portfolio.voting_order, Portfolio.name, desc("endorsed"))
        )
    ).all()

    # ------------------------------------------------------------------
    # Group rows by portfolio
    # ------------------------------------------------------------------
    portfolio_map: Dict[str, Dict] = {}

    for row in rows:
        pid = str(row.portfolio_id)
        endorsed  = int(row.endorsed  or 0)
        rejected  = int(row.rejected  or 0)
        abstained = int(row.abstained or 0)

        if pid not in portfolio_map:
            portfolio_map[pid] = {
                "portfolio_id":    pid,
                "portfolio_name":  row.portfolio_name,
                "total_votes":     0,   # all valid votes (endorsed + rejected + abstained)
                "total_rejected":  0,
                "total_abstained": 0,
                "candidates":      [],
                "winner":          None,
            }

        candidate_data = {
            "id":            str(row.candidate_id),
            "name":          row.candidate_name,
            "picture_url":   row.picture_url,
            "vote_count":    endorsed,          # endorsed only
            "rejected_count": rejected,
            "abstain_count": abstained,
            "total_votes":   endorsed + rejected + abstained,  # candidate-level total
        }

        portfolio_map[pid]["candidates"].append(candidate_data)

        # Portfolio-level totals include ALL vote types
        portfolio_map[pid]["total_votes"]     += endorsed + rejected + abstained
        portfolio_map[pid]["total_rejected"]  += rejected
        portfolio_map[pid]["total_abstained"] += abstained

    # ------------------------------------------------------------------
    # Determine winner per portfolio AFTER all candidates are collected.
    # Winner = candidate with strictly the highest endorsed count.
    # If two or more candidates share that count → TIE → winner stays None.
    # ------------------------------------------------------------------
    for pid, portfolio in portfolio_map.items():
        candidates = portfolio["candidates"]

        # Only run winner logic when votes have actually been cast
        if portfolio["total_votes"] == 0:
            continue

        # Sort candidates by endorsed votes descending (already done by SQL,
        # but we sort again in Python to be safe after grouping)
        sorted_cands = sorted(candidates, key=lambda c: c["vote_count"], reverse=True)

        if not sorted_cands:
            continue

        top_votes = sorted_cands[0]["vote_count"]

        # No winner if nobody has any endorsed votes
        if top_votes == 0:
            continue

        # Check for a tie: count how many candidates share the top endorsed count
        tied = [c for c in sorted_cands if c["vote_count"] == top_votes]

        if len(tied) == 1:
            # Clear winner
            portfolio["winner"] = sorted_cands[0]
        else:
            # Tie — explicitly set winner to None so the frontend shows "Tied"
            portfolio["winner"] = None

        # Also re-sort the candidates list in the response (highest endorsed first)
        portfolio["candidates"] = sorted_cands

    return list(portfolio_map.values())


async def get_election_results(db: AsyncSession, portfolio_id: UUID) -> Optional[Dict[str, Any]]:
    """Single-portfolio results — delegates to the bulk query then filters."""
    all_results = await get_all_election_results(db)
    pid = str(portfolio_id)
    return next((r for r in all_results if r["portfolio_id"] == pid), None)


async def get_voting_statistics_engine(db: AsyncSession) -> Dict[str, Any]:
    """Overall voting statistics."""
    total_votes = (await db.execute(select(func.count(Vote.id)))).scalar() or 0
    valid_votes = (
        await db.execute(select(func.count(Vote.id)).where(Vote.is_valid == True))
    ).scalar() or 0
    total_electorates = (
        await db.execute(
            select(func.count(Electorate.id)).where(Electorate.is_deleted == False)
        )
    ).scalar() or 0
    voted_electorates = (
        await db.execute(
            select(func.count(func.distinct(Vote.electorate_id))).where(Vote.is_valid == True)
        )
    ).scalar() or 0

    votes_by_hour = (
        await db.execute(
            select(
                func.extract("hour", Vote.voted_at).label("hour"),
                func.count(Vote.id).label("vote_count"),
            )
            .where(Vote.is_valid == True)
            .group_by(func.extract("hour", Vote.voted_at))
            .order_by("hour")
        )
    ).all()

    return {
        "total_votes": total_votes,
        "valid_votes": valid_votes,
        "invalid_votes": total_votes - valid_votes,
        "total_electorates": total_electorates,
        "voted_electorates": voted_electorates,
        "voting_percentage": (
            round(voted_electorates / total_electorates * 100, 2)
            if total_electorates > 0
            else 0
        ),
        "votes_by_hour": [
            {"hour": int(r.hour), "vote_count": r.vote_count} for r in votes_by_hour
        ],
    }


async def invalidate_vote(db: AsyncSession, vote_id: UUID, reason: str = "Invalidated") -> bool:
    result = await db.execute(select(Vote).where(Vote.id == vote_id))
    vote = result.scalar_one_or_none()
    if not vote:
        return False
    vote.is_valid = False
    await db.commit()
    return True


async def get_recent_votes_engine(
    db: AsyncSession, limit: int = 50, valid_only: bool = True
) -> List[Vote]:
    query = select(Vote).options(
        selectinload(Vote.electorate),
        selectinload(Vote.portfolio),
        selectinload(Vote.candidate),
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    query = query.order_by(desc(Vote.voted_at)).limit(limit)
    return (await db.execute(query)).scalars().all()