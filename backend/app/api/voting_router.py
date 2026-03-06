"""
Voting Router

All endpoints require a valid voting-session JWT issued by POST /auth/verify-id.
The JWT embeds election_id, voting_token_id, and session_id — these are extracted
here so no query params are needed and clients cannot spoof a different election.

VOTE SUBMISSION TRANSACTION (cast_vote)
───────────────────────────────────────
One atomic commit that:
  1. Validates every vote (VotingSecurityValidator)
  2. Inserts all Vote rows (db.flush → UniqueConstraint fires per vote)
  3. Marks VotingToken as used (token.mark_voted())
  4. Updates Electorate.has_voted + ElectionVoterRoll.has_voted atomically
  5. Terminates the VotingSession
  6. Commits once — full rollback on failure

An IntegrityError on a single vote rolls back only that vote;
remaining votes in the ballot are still attempted.
A SQLAlchemyError on the final commit aborts everything.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.election import get_election
from app.crud.crud_electorates import mark_electorate_voted
from app.crud.crud_portfolios import get_active_portfolios_for_voting
from app.crud.crud_votes import create_vote, get_votes_by_electorate
from app.crud.crud_voting_tokens import get_voting_token_by_id
from app.middleware.auth_middleware import get_current_voter, rate_limit_voting
from app.middleware.voting_middleware import VotingSecurityValidator
from app.models.electorates import Electorate, VotingSession
from app.schemas.electorates import (
    CandidateOut,
    VoteOut,
    VotingCreation,
    VotingSessionResponse,
    StudentIDConverter,
)
from app.utils.security import TokenManager
from app.utils.security_audit import SecurityAuditLogger

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voting", tags=["Voting"])


# ---------------------------------------------------------------------------
# JWT payload helpers
# ---------------------------------------------------------------------------

def _jwt_payload(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return {}
    try:
        return TokenManager.decode_token(auth.split(" ", 1)[1])
    except Exception:
        return {}


def _election_id(payload: dict) -> Optional[UUID]:
    v = payload.get("election_id")
    return UUID(v) if v else None


def _voting_token_id(payload: dict) -> Optional[UUID]:
    v = payload.get("voting_token_id")
    return UUID(v) if v else None


def _session_id(payload: dict) -> Optional[UUID]:
    v = payload.get("session_id")
    return UUID(v) if v else None


def _require_election_id(payload: dict) -> UUID:
    eid = _election_id(payload)
    if not eid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session missing election context. Please re-authenticate.",
        )
    return eid


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return getattr(request.client, "host", "127.0.0.1") if request.client else "127.0.0.1"


# ---------------------------------------------------------------------------
# GET /ballot
# ---------------------------------------------------------------------------

@router.get("/ballot", response_model=List[CandidateOut])
async def get_voting_ballot(
    request: Request,
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Return the full ballot for the active election."""
    if electorate.has_voted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "already_voted",
                "message": "You have already cast your vote",
                "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
                "student_id": StudentIDConverter.to_display(electorate.student_id),
            },
        )

    payload = _jwt_payload(request)
    election_id = _require_election_id(payload)
    return await get_active_portfolios_for_voting(db, election_id)


# ---------------------------------------------------------------------------
# POST /vote
# ---------------------------------------------------------------------------

@router.post("/vote", response_model=VotingSessionResponse)
@rate_limit_voting
async def cast_vote(
    vote_data: VotingCreation,
    request: Request,
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """
    Submit the full ballot.

    Validation, insertion, token-marking, and session termination all happen
    in one atomic transaction — committed once at the end.
    """
    # ── Pre-flight: global has_voted guard ────────────────────────────────
    if electorate.has_voted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "already_voted",
                "message": "You have already cast your vote. Multiple voting is not allowed.",
                "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
                "student_id": StudentIDConverter.to_display(electorate.student_id),
            },
        )

    # ── Extract context from JWT ──────────────────────────────────────────
    payload = _jwt_payload(request)
    election_id = _require_election_id(payload)
    tok_id = _voting_token_id(payload)
    sess_id = _session_id(payload)
    client_ip = _client_ip(request)
    user_agent = request.headers.get("user-agent", "offline")

    if not tok_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session missing token context. Please re-authenticate.",
        )

    # ── Load election and voting token ────────────────────────────────────
    election = await get_election(db, election_id)
    if not election:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Election not found")

    voting_token = await get_voting_token_by_id(db, tok_id)
    if not voting_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Voting token not found. Please re-authenticate.",
        )

    # ── Validate and insert each vote ─────────────────────────────────────
    votes = []
    failed_votes = []

    for vote_request in vote_data.votes:
        # Each vote is wrapped in a savepoint so an IntegrityError on one vote
        # rolls back only that vote without invalidating the outer transaction.
        savepoint = await db.begin_nested()
        try:
            # Full validation — election open, token valid, voter enrolled,
            # portfolio/candidate checks, double-vote check
            await VotingSecurityValidator.validate_vote_request(
                db=db,
                voting_token=voting_token,
                election_id=election_id,
                electorate_id=electorate.id,
                portfolio_id=vote_request.portfolio_id,
                candidate_id=vote_request.candidate_id,
                election=election,
            )

            vote = await create_vote(
                db=db,
                vote_data=vote_request,
                voting_token_id=tok_id,
                election_id=election_id,
                voting_session_id=sess_id,
                ip_address=client_ip,
                user_agent=user_agent,
            )
            await savepoint.commit()
            votes.append(vote)

            await SecurityAuditLogger.log_vote_cast(
                db, str(electorate.id), str(vote_request.portfolio_id), success=True
            )

        except HTTPException as exc:
            await savepoint.rollback()
            failed_votes.append({
                "portfolio_id": str(vote_request.portfolio_id),
                "candidate_id": str(vote_request.candidate_id),
                "error": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            })
            await SecurityAuditLogger.log_vote_cast(
                db, str(electorate.id), str(vote_request.portfolio_id),
                success=False,
                reason=exc.detail if isinstance(exc.detail, str) else "validation_failed",
            )

        except IntegrityError:
            await savepoint.rollback()
            failed_votes.append({
                "portfolio_id": str(vote_request.portfolio_id),
                "candidate_id": str(vote_request.candidate_id),
                "error": "Already voted for this portfolio (concurrent duplicate)",
            })
            await SecurityAuditLogger.log_vote_cast(
                db, str(electorate.id), str(vote_request.portfolio_id),
                success=False, reason="db_constraint_duplicate",
            )

        except SQLAlchemyError as exc:
            await savepoint.rollback()
            logger.error(
                "DB error — electorate %s portfolio %s: %s",
                electorate.id, vote_request.portfolio_id, exc,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database error while recording vote. Please retry.",
            )

    # ── Atomically finalize if any votes succeeded ────────────────────────
    if votes:
        # 1. Mark token consumed (is_used=True, is_active=False)
        voting_token.mark_voted()

        # 2. Update Electorate.has_voted + ElectionVoterRoll.has_voted in one call
        await mark_electorate_voted(db, electorate.id, election_id)

        # 3. Terminate the voting session
        if sess_id:
            session_result = await db.execute(
                select(VotingSession).where(VotingSession.id == sess_id)
            )
            session = session_result.scalar_one_or_none()
            if session:
                session.mark_submitted()

    try:
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error("Failed to commit ballot — electorate %s: %s", electorate.id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to save votes. Please retry.",
        )

    # ── Response ──────────────────────────────────────────────────────────
    success = len(votes) > 0
    if success and not failed_votes:
        message = f"Successfully cast {len(votes)} vote(s)"
    elif success:
        message = f"Cast {len(votes)} vote(s); {len(failed_votes)} failed"
    else:
        message = "No votes were cast"

    return VotingSessionResponse(
        success=success,
        message=message,
        votes_cast=len(votes),
        failed_votes=failed_votes,
    )


# ---------------------------------------------------------------------------
# GET /my-votes
# ---------------------------------------------------------------------------

@router.get("/my-votes")
async def get_my_votes(
    request: Request,
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """
    Return a summary of the votes cast by the current voter in this election.

    NOTE: Full VoteOut (which includes voting_token_id) is intentionally NOT
    returned here — exposing voting_token_id to the voter partially undermines
    the anonymization design.  Only the portfolio/candidate choices are shown,
    which is sufficient for a voter to confirm their ballot was recorded.
    """
    payload = _jwt_payload(request)
    election_id = _require_election_id(payload)
    votes = await get_votes_by_electorate(db, electorate.id, election_id)
    return [
        {
            "portfolio_id": str(v.portfolio_id),
            "candidate_id": str(v.candidate_id),
            "vote_type": v.vote_type,
            "voted_at": v.voted_at.isoformat(),
        }
        for v in votes
    ]


# ---------------------------------------------------------------------------
# GET /status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_voting_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    electorate: Electorate = Depends(get_current_voter),
):
    """Return the current voter's voting status for this election."""
    payload = _jwt_payload(request)
    election_id = _election_id(payload)

    votes_cast = 0
    if election_id:
        votes = await get_votes_by_electorate(db, electorate.id, election_id)
        votes_cast = len(votes)

    return {
        "has_voted": electorate.has_voted,
        "voted_at": electorate.voted_at.isoformat() if electorate.voted_at else None,
        "votes_cast": votes_cast,
        "student_id": StudentIDConverter.to_display(electorate.student_id),
        "can_vote": not electorate.has_voted,
    }


__all__ = ["router"]