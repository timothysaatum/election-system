"""
CRUD operations for Vote management.

ANONYMIZATION NOTE
──────────────────
Vote has no electorate_id column.  Voter identity is one hop away via
VotingToken.  Any query that needs to find "did this electorate vote?"
must JOIN through VotingToken — see check_token_used_for_portfolio() and
get_votes_by_electorate().

DOUBLE-VOTE PREVENTION (two independent layers)
────────────────────────────────────────────────
Layer 1 — Application:  VotingToken.is_used is checked before accepting
          any ballot submission.  Callers must verify this BEFORE calling
          create_vote().
Layer 2 — Database:     UniqueConstraint(voting_token_id, portfolio_id)
          on the votes table.  Even a concurrent duplicate request will be
          caught here.  Callers must handle IntegrityError.

ELECTION SCOPING
────────────────
Every public function that queries votes or results accepts election_id so
that data from different elections is never mixed.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, and_, desc, case
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from app.models.electorates import Vote, Candidate, Portfolio, VotingToken
from app.schemas.electorates import VoteCreate


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_vote(
    db: AsyncSession,
    vote_data: VoteCreate,
    voting_token_id: UUID,   # replaces electorate_id — Vote is anonymized
    election_id: UUID,
    voting_session_id: Optional[UUID],
    ip_address: str,
    user_agent: str,
) -> Vote:
    """
    Insert one Vote row.

    Does NOT commit — the caller (vote submission endpoint) is responsible
    for committing the full transaction that also marks the token as used
    and the electorate as voted.

    Raises:
        IntegrityError: if UniqueConstraint(voting_token_id, portfolio_id)
                        fires — i.e. this token already has a vote for
                        this portfolio.  Caller must handle this explicitly.
    """
    vote = Vote(
        election_id=election_id,
        portfolio_id=vote_data.portfolio_id,
        candidate_id=vote_data.candidate_id,
        voting_token_id=voting_token_id,
        voting_session_id=voting_session_id,
        vote_type=vote_data.vote_type,
        ip_address=ip_address,
        user_agent=user_agent,
        voted_at=datetime.now(timezone.utc),
    )
    db.add(vote)
    await db.flush()  # Let the DB constraint fire before the caller commits
    return vote


# ---------------------------------------------------------------------------
# Read — single vote
# ---------------------------------------------------------------------------

async def get_vote(db: AsyncSession, vote_id: UUID) -> Optional[Vote]:
    """Fetch one vote by primary key, loading portfolio and candidate."""
    result = await db.execute(
        select(Vote)
        .options(
            selectinload(Vote.portfolio),
            selectinload(Vote.candidate),
            selectinload(Vote.voting_token),
        )
        .where(Vote.id == vote_id)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Read — by electorate (via VotingToken join — anonymized)
# ---------------------------------------------------------------------------

async def get_votes_by_electorate(
    db: AsyncSession,
    electorate_id: UUID,
    election_id: UUID,
    valid_only: bool = True,
) -> List[Vote]:
    """
    Return all votes cast by a specific electorate in a given election.

    Because Vote has no direct electorate_id, we JOIN through VotingToken.
    This is the correct and only safe way to retrieve a voter's ballot.
    """
    query = (
        select(Vote)
        .join(VotingToken, Vote.voting_token_id == VotingToken.id)
        .options(
            selectinload(Vote.portfolio),
            selectinload(Vote.candidate),
        )
        .where(
            and_(
                VotingToken.electorate_id == electorate_id,
                Vote.election_id == election_id,
            )
        )
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    query = query.order_by(desc(Vote.voted_at))
    return (await db.execute(query)).scalars().all()


# ---------------------------------------------------------------------------
# Read — by portfolio
# ---------------------------------------------------------------------------

async def get_votes_by_portfolio(
    db: AsyncSession,
    portfolio_id: UUID,
    election_id: UUID,
    valid_only: bool = True,
) -> List[Vote]:
    """
    Return all valid votes for a portfolio.
    Note: Vote rows returned here have no electorate identity attached.
    """
    query = (
        select(Vote)
        .options(selectinload(Vote.candidate))
        .where(
            and_(
                Vote.portfolio_id == portfolio_id,
                Vote.election_id == election_id,
            )
        )
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    return (await db.execute(query)).scalars().all()


# ---------------------------------------------------------------------------
# Double-vote checks (anonymized — via VotingToken)
# ---------------------------------------------------------------------------

async def check_token_used_for_portfolio(
    db: AsyncSession,
    voting_token_id: UUID,
    portfolio_id: UUID,
) -> bool:
    """
    Check whether a specific voting token already has a valid vote for a
    portfolio.  This is the DB-level double-vote check used inside the
    vote submission flow alongside the application-level VotingToken.is_used
    check.
    """
    result = await db.execute(
        select(Vote.id)
        .where(
            and_(
                Vote.voting_token_id == voting_token_id,
                Vote.portfolio_id == portfolio_id,
                Vote.is_valid == True,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def check_electorate_voted_for_portfolio(
    db: AsyncSession,
    electorate_id: UUID,
    portfolio_id: UUID,
    election_id: UUID,
) -> bool:
    """
    Check whether an electorate has already voted for a portfolio in a given
    election.  Joins through VotingToken because Vote has no electorate_id.

    Used by VotingSecurityValidator in voting_middleware.py.
    Note: the primary guard is VotingToken.is_used — this is a secondary check.
    """
    result = await db.execute(
        select(Vote.id)
        .join(VotingToken, Vote.voting_token_id == VotingToken.id)
        .where(
            and_(
                VotingToken.electorate_id == electorate_id,
                Vote.portfolio_id == portfolio_id,
                Vote.election_id == election_id,
                Vote.is_valid == True,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# Vote counts
# ---------------------------------------------------------------------------

async def get_vote_count_by_candidate(
    db: AsyncSession,
    candidate_id: UUID,
    election_id: UUID,
    valid_only: bool = True,
) -> int:
    query = select(func.count(Vote.id)).where(
        and_(Vote.candidate_id == candidate_id, Vote.election_id == election_id)
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    return (await db.execute(query)).scalar() or 0


async def get_vote_count_by_portfolio(
    db: AsyncSession,
    portfolio_id: UUID,
    election_id: UUID,
    valid_only: bool = True,
) -> int:
    query = select(func.count(Vote.id)).where(
        and_(Vote.portfolio_id == portfolio_id, Vote.election_id == election_id)
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    return (await db.execute(query)).scalar() or 0


# ---------------------------------------------------------------------------
# Election results — single aggregated query, no N+1
# ---------------------------------------------------------------------------

async def get_all_election_results(
    db: AsyncSession,
    election_id: UUID,
) -> List[Dict[str, Any]]:
    """
    Return results for ALL active portfolios in a given election in one query.

    Uses a single LEFT OUTER JOIN + GROUP BY so the database does all
    aggregation.  No Python-side N+1.

    Result shape per portfolio:
        {
            portfolio_id, portfolio_name, total_votes, total_rejected,
            candidates: [{ id, name, picture_url, vote_count,
                           rejected_count, total_votes }],
            winner: { same shape as a candidate entry }
        }
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
                    case((Vote.vote_type == "abstain", 1), else_=0)
                ).label("abstained"),
            )
            .select_from(Portfolio)
            .join(Candidate, Candidate.portfolio_id == Portfolio.id)
            .outerjoin(
                Vote,
                and_(
                    Vote.candidate_id == Candidate.id,
                    Vote.election_id == election_id,
                    Vote.is_valid == True,
                ),
            )
            .where(
                Portfolio.election_id == election_id,
                Portfolio.is_active == True,
                Candidate.is_active == True,
            )
            .group_by(
                Portfolio.id,
                Portfolio.name,
                Portfolio.voting_order,
                Candidate.id,
                Candidate.name,
                Candidate.picture_url,
            )
            .order_by(Portfolio.voting_order, Portfolio.name, desc("endorsed"))
        )
    ).all()

    portfolio_map: Dict[str, Dict] = {}
    for row in rows:
        pid = str(row.portfolio_id)
        endorsed = int(row.endorsed or 0)
        abstained = int(row.abstained or 0)

        if pid not in portfolio_map:
            portfolio_map[pid] = {
                "portfolio_id": pid,
                "portfolio_name": row.portfolio_name,
                "total_votes": 0,
                "total_rejected": 0,
                "candidates": [],
                "winner": None,
            }

        candidate_data = {
            "id": str(row.candidate_id),
            "name": row.candidate_name,
            "picture_url": row.picture_url,
            "vote_count": endorsed,
            "rejected_count": abstained,
            "total_votes": endorsed + abstained,
        }
        portfolio_map[pid]["candidates"].append(candidate_data)
        portfolio_map[pid]["total_votes"] += endorsed
        portfolio_map[pid]["total_rejected"] += abstained

        # Rows are already ordered DESC by endorsed — first candidate is the leader
        if portfolio_map[pid]["winner"] is None:
            portfolio_map[pid]["winner"] = candidate_data

    return list(portfolio_map.values())


async def get_single_portfolio_results(
    db: AsyncSession,
    election_id: UUID,
    portfolio_id: UUID,
) -> Optional[Dict[str, Any]]:
    """
    Results for a single portfolio.

    Uses a direct WHERE clause — does NOT fetch all results then filter
    in Python (that was the original inefficiency).
    """
    rows = (
        await db.execute(
            select(
                Portfolio.id.label("portfolio_id"),
                Portfolio.name.label("portfolio_name"),
                Candidate.id.label("candidate_id"),
                Candidate.name.label("candidate_name"),
                Candidate.picture_url,
                func.sum(
                    case((Vote.vote_type == "endorsed", 1), else_=0)
                ).label("endorsed"),
                func.sum(
                    case((Vote.vote_type == "abstain", 1), else_=0)
                ).label("abstained"),
            )
            .select_from(Portfolio)
            .join(Candidate, Candidate.portfolio_id == Portfolio.id)
            .outerjoin(
                Vote,
                and_(
                    Vote.candidate_id == Candidate.id,
                    Vote.election_id == election_id,
                    Vote.is_valid == True,
                ),
            )
            .where(
                Portfolio.id == portfolio_id,
                Portfolio.election_id == election_id,
                Candidate.is_active == True,
            )
            .group_by(
                Portfolio.id,
                Portfolio.name,
                Candidate.id,
                Candidate.name,
                Candidate.picture_url,
            )
            .order_by(desc("endorsed"))
        )
    ).all()

    if not rows:
        return None

    result: Dict[str, Any] = {
        "portfolio_id": str(rows[0].portfolio_id),
        "portfolio_name": rows[0].portfolio_name,
        "total_votes": 0,
        "total_rejected": 0,
        "candidates": [],
        "winner": None,
    }
    for row in rows:
        endorsed = int(row.endorsed or 0)
        abstained = int(row.abstained or 0)
        candidate_data = {
            "id": str(row.candidate_id),
            "name": row.candidate_name,
            "picture_url": row.picture_url,
            "vote_count": endorsed,
            "rejected_count": abstained,
            "total_votes": endorsed + abstained,
        }
        result["candidates"].append(candidate_data)
        result["total_votes"] += endorsed
        result["total_rejected"] += abstained
        if result["winner"] is None:
            result["winner"] = candidate_data

    return result


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

async def get_voting_statistics_engine(
    db: AsyncSession,
    election_id: UUID,
) -> Dict[str, Any]:
    """
    Overall voting statistics for a specific election.

    voted_electorates is derived from Electorate.has_voted (stored column)
    joined with ElectionVoterRoll to scope to this election's voter roll.
    This avoids any reference to the non-existent Vote.electorate_id.
    """
    from app.models.electorates import ElectionVoterRoll

    total_votes = (
        await db.execute(
            select(func.count(Vote.id)).where(Vote.election_id == election_id)
        )
    ).scalar() or 0

    valid_votes = (
        await db.execute(
            select(func.count(Vote.id)).where(
                and_(Vote.election_id == election_id, Vote.is_valid == True)
            )
        )
    ).scalar() or 0

    # Total voters enrolled in this election
    total_electorates = (
        await db.execute(
            select(func.count(ElectionVoterRoll.id)).where(
                ElectionVoterRoll.election_id == election_id
            )
        )
    ).scalar() or 0

    # Voters who completed their ballot in this election (from voter roll)
    voted_electorates = (
        await db.execute(
            select(func.count(ElectionVoterRoll.id)).where(
                and_(
                    ElectionVoterRoll.election_id == election_id,
                    ElectionVoterRoll.has_voted == True,
                )
            )
        )
    ).scalar() or 0

    votes_by_hour = (
        await db.execute(
            select(
                func.extract("hour", Vote.voted_at).label("hour"),
                func.count(Vote.id).label("vote_count"),
            )
            .where(and_(Vote.election_id == election_id, Vote.is_valid == True))
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
        "voters_remaining": total_electorates - voted_electorates,
        "voting_percentage": (
            round(voted_electorates / total_electorates * 100, 2)
            if total_electorates > 0
            else 0.0
        ),
        "votes_by_hour": [
            {"hour": int(r.hour), "vote_count": r.vote_count}
            for r in votes_by_hour
        ],
    }


# ---------------------------------------------------------------------------
# Admin operations
# ---------------------------------------------------------------------------

async def invalidate_vote(
    db: AsyncSession,
    vote_id: UUID,
    reason: str = "Invalidated by admin",
) -> bool:
    """Soft-invalidate a vote (sets is_valid=False).  Never hard-deletes."""
    result = await db.execute(select(Vote).where(Vote.id == vote_id))
    vote = result.scalar_one_or_none()
    if not vote:
        return False
    vote.is_valid = False
    await db.commit()
    return True


async def get_recent_votes_engine(
    db: AsyncSession,
    election_id: UUID,
    limit: int = 50,
    valid_only: bool = True,
) -> List[Vote]:
    """
    Most recent votes for an election — for the admin live feed.
    Returns terminal/station info (ip_address, user_agent) but NOT voter identity.
    """
    query = (
        select(Vote)
        .options(
            selectinload(Vote.portfolio),
            selectinload(Vote.candidate),
        )
        .where(Vote.election_id == election_id)
    )
    if valid_only:
        query = query.where(Vote.is_valid == True)
    query = query.order_by(desc(Vote.voted_at)).limit(limit)
    return (await db.execute(query)).scalars().all()