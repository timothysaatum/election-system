"""
Voting Security Middleware

Validates every individual vote request before it is written to the database.
Called once per portfolio in a ballot submission, AFTER the session JWT has
already been verified by get_current_voter() in auth_middleware.py.

Validation order (fail-fast):
  1. Election is currently OPEN
  2. Portfolio belongs to this election and is active
  3. Candidate belongs to this election, this portfolio, and is active
  4. Voting token is still valid (not used, not revoked, not expired)
  5. Voter is enrolled in this election's voter roll
  6. Voter has not already voted for this portfolio (via token join)
"""

import logging
from typing import Any, Dict
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.crud_candidates import get_candidate_engine
from app.crud.crud_portfolios import get_portfolio_engine
from app.crud.crud_votes import check_electorate_voted_for_portfolio
from app.crud.crud_electorates import is_electorate_enrolled
from app.models.electorates import ElectionStatus, VotingToken

logger = logging.getLogger(__name__)


class VotingSecurityValidator:
    """
    Per-vote validation for the offline voting flow.

    All methods are static — instantiate once and reuse, or call directly
    as VotingSecurityValidator.validate_vote_request(...).
    """

    @staticmethod
    async def validate_election_open(election) -> None:
        """
        Raise 403 if the election is not currently OPEN.

        This is the first check so no DB round-trips are wasted on a
        vote submitted against a draft, closed, or published election.
        """
        if not election or election.status != ElectionStatus.OPEN.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Election is not currently open for voting",
            )

    @staticmethod
    async def validate_token_still_valid(token: VotingToken) -> None:
        """
        Raise 401 if the voting token has already been used, revoked, or expired.

        This is the application-level double-vote guard.  The DB-level guard is
        the UniqueConstraint(voting_token_id, portfolio_id) on the votes table.
        """
        if not token.is_valid:
            if token.is_used:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This token has already been used to vote",
                )
            if token.revoked:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This token has been revoked",
                )
            # Expired
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This token has expired. Please request a new one.",
            )

    @staticmethod
    async def validate_vote_request(
        db: AsyncSession,
        voting_token: VotingToken,
        election_id: UUID,
        electorate_id: UUID,
        portfolio_id: UUID,
        candidate_id: UUID,
        election,               # Election ORM object — already loaded by the route
    ) -> Dict[str, Any]:
        """
        Validate a single vote within a ballot submission.

        Args:
            db:             Database session
            voting_token:   The voter's VotingToken ORM object
            election_id:    The active election's UUID
            electorate_id:  The voter's UUID (from the session JWT)
            portfolio_id:   The portfolio being voted on
            candidate_id:   The chosen candidate
            election:       The Election ORM object (loaded by the route)

        Returns:
            {"valid": True, "portfolio": <Portfolio>, "candidate": <Candidate>}

        Raises:
            HTTPException on any validation failure.
        """

        # ── 1. Election must be OPEN ──────────────────────────────────────
        await VotingSecurityValidator.validate_election_open(election)

        # ── 2. Token must still be valid ──────────────────────────────────
        await VotingSecurityValidator.validate_token_still_valid(voting_token)

        # ── 3. Voter must be on this election's roll ──────────────────────
        enrolled = await is_electorate_enrolled(db, electorate_id, election_id)
        if not enrolled:
            logger.warning(
                "Voter %s attempted to vote but is not on the roll for election %s",
                electorate_id,
                election_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not registered to vote in this election",
            )

        # ── 4. Portfolio must exist, belong to this election, and be active
        portfolio = await get_portfolio_engine(db, portfolio_id, election_id)
        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found",
            )
        if not portfolio.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This portfolio is not currently accepting votes",
            )
        if str(portfolio.election_id) != str(election_id):
            # Belt-and-suspenders: get_portfolio_engine already filters by
            # election_id, but an explicit check makes tampering attempts obvious.
            logger.warning(
                "Portfolio %s does not belong to election %s",
                portfolio_id,
                election_id,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Portfolio does not belong to this election",
            )

        # ── 5. Candidate must exist, belong to this election & portfolio ──
        candidate = await get_candidate_engine(db, candidate_id, election_id)
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found",
            )
        if not candidate.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This candidate is not active",
            )
        if str(candidate.portfolio_id) != str(portfolio_id):
            logger.warning(
                "Candidate %s does not belong to portfolio %s",
                candidate_id,
                portfolio_id,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate does not belong to this portfolio",
            )

        # ── 6. Voter must not have already voted for this portfolio ───────
        already_voted = await check_electorate_voted_for_portfolio(
            db, electorate_id, portfolio_id, election_id
        )
        if already_voted:
            logger.warning(
                "Double-vote attempt: voter %s already voted for portfolio %s in election %s",
                electorate_id,
                portfolio_id,
                election_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have already voted for this portfolio",
            )

        return {
            "valid": True,
            "portfolio": portfolio,
            "candidate": candidate,
        }


__all__ = ["VotingSecurityValidator"]