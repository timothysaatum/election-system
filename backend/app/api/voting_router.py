"""
Offline Voting Router
Votes are protected by a DB-level UNIQUE constraint on (electorate_id, portfolio_id).
Application-level checks are a fast-path guard; the constraint is the safety net.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from typing import List
from datetime import datetime, timezone
import logging

from app.core.database import get_db
from app.core.config import settings
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
from app.utils.security_audit import SecurityAuditLogger

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voting", tags=["Voting"])


@router.get("/ballot", response_model=List[CandidateOut])
async def get_voting_ballot(
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Get the voting ballot (all active portfolios and their candidates)."""
    if electorate.has_voted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "already_voted",
                "message": "You have already cast your vote",
                "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
                "student_id": electorate.student_id,
            },
        )
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
    Cast votes for multiple portfolios.

    Error handling is split into three tiers:
      1. Validation errors (candidate not found, wrong portfolio) → logged, skipped
      2. IntegrityError (DB constraint: duplicate vote) → logged, skipped
      3. SQLAlchemyError (connection loss, etc.) → 500, entire request fails

    The DB UNIQUE constraint on (electorate_id, portfolio_id) is the final
    safety net against race conditions regardless of application-level checks.
    """
    if electorate.has_voted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "already_voted",
                "message": "You have already cast your vote. Multiple voting is not allowed.",
                "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
                "student_id": electorate.student_id,
            },
        )

    # Extract session_id from JWT for linkage
    session_id: UUID | None = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = TokenManager.decode_token(auth_header.split(" ", 1)[1])
            sid = payload.get("session_id")
            if sid:
                session_id = UUID(sid)
        except Exception:
            pass

    votes = []
    failed_votes = []

    for vote_request in vote_data.votes:
        try:
            # ── Fast-path validation (application level) ──────────────────
            if await check_electorate_voted_for_portfolio(
                db, electorate.id, vote_request.portfolio_id
            ):
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Already voted for this portfolio",
                })
                continue

            candidate = await get_candidate_engine(db, vote_request.candidate_id)
            if not candidate:
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Candidate not found",
                })
                await SecurityAuditLogger.log_vote_cast(
                    db, str(electorate.id), str(vote_request.portfolio_id),
                    success=False, reason="candidate_not_found",
                )
                continue

            if candidate.portfolio_id != vote_request.portfolio_id:
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Candidate does not belong to this portfolio",
                })
                await SecurityAuditLogger.log_vote_cast(
                    db, str(electorate.id), str(vote_request.portfolio_id),
                    success=False, reason="candidate_portfolio_mismatch",
                )
                continue

            if not candidate.is_active:
                failed_votes.append({
                    "portfolio_id": str(vote_request.portfolio_id),
                    "candidate_id": str(vote_request.candidate_id),
                    "error": "Candidate is not active",
                })
                continue

            # ── Create vote (flush triggers DB constraint) ────────────────
            vote = await create_vote(
                db=db,
                vote_data=vote_request,
                electorate_id=electorate.id,
                voting_session_id=session_id,
                ip_address="127.0.0.1",
                user_agent="Offline",
            )
            votes.append(vote)
            await SecurityAuditLogger.log_vote_cast(
                db, str(electorate.id), str(vote_request.portfolio_id), success=True
            )

        except IntegrityError:
            # DB constraint caught a duplicate — roll back the failed flush
            await db.rollback()
            failed_votes.append({
                "portfolio_id": str(vote_request.portfolio_id),
                "candidate_id": str(vote_request.candidate_id),
                "error": "Already voted for this portfolio (duplicate)",
            })
            await SecurityAuditLogger.log_vote_cast(
                db, str(electorate.id), str(vote_request.portfolio_id),
                success=False, reason="db_constraint_duplicate",
            )

        except SQLAlchemyError as exc:
            # Infrastructure failure — abort the whole request
            await db.rollback()
            logger.error(
                "Database error during vote for electorate %s portfolio %s: %s",
                electorate.id, vote_request.portfolio_id, exc,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database error while recording vote. Please retry.",
            )

    # ── Mark electorate as voted if any vote succeeded ───────────────────────
    if votes:
        electorate.has_voted = True
        electorate.voted_at = datetime.now(timezone.utc)

    try:
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error("Failed to commit votes for electorate %s: %s", electorate.id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save votes. Please retry.",
        )

    # ── Response ──────────────────────────────────────────────────────────────
    success = len(votes) > 0
    if success and not failed_votes:
        message = f"Successfully cast {len(votes)} vote(s)"
    elif success and failed_votes:
        message = f"Cast {len(votes)} vote(s); {len(failed_votes)} failed"
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
    """Get all votes cast by the current electorate."""
    return await get_votes_by_electorate(db, electorate.id)


@router.get("/status")
async def get_voting_status(
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Get current voting status for the authenticated electorate."""
    votes = await get_votes_by_electorate(db, electorate.id)
    return {
        "has_voted": electorate.has_voted,
        "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
        "votes_cast": len(votes),
        "student_id": electorate.student_id,
        "can_vote": not electorate.has_voted,
    }


__all__ = ["router"]