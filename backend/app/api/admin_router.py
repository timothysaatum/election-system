"""
Admin Router

All data-mutating and sensitive read endpoints require 'admin' role.
Statistics / results can be accessed by any authenticated role.

ELECTION SCOPING
────────────────
Every statistics, results, and token endpoint requires election_id as a query
parameter. A helper (_resolve_election) fetches the active election when
election_id is not supplied so the most common case (single running election)
still works without extra client work.
"""

import asyncio
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud.election import get_election, get_active_election
from app.core.database import check_db_health, get_db
from app.crud.crud_candidates import get_candidate_statistics
from app.crud.crud_electorates import get_electorate, get_electorates
from app.crud.crud_portfolios import get_portfolio_statistics
from app.crud.crud_votes import get_all_election_results, get_recent_votes_engine, get_voting_statistics_engine
from app.crud.crud_voting_tokens import get_electorates_with_tokens
from app.middleware.auth_middleware import get_current_admin, get_current_user, require_permission
from app.schemas.electorates import (
    BulkTokenGenerationRequest,
    ElectorateOut,
    ElectionResults,
    SingleTokenRegenerationRequest,
    SingleTokenRegenerationResponse,
    TokenGenerationRequest,
    TokenGenerationResponse,
)
from app.services.token_generation_service import BulkTokenGenerator
from app.utils.security_audit import SecurityAuditLogger

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Admin"])
token_generator = BulkTokenGenerator()


# ---------------------------------------------------------------------------
# Election resolution helper
# ---------------------------------------------------------------------------

async def _resolve_election(db: AsyncSession, election_id: Optional[UUID]) -> UUID:
    """
    Return the provided election_id, or fall back to the currently active
    election.  Raises 404 if neither can be found.
    """
    if election_id:
        election = await get_election(db, election_id)
        if not election:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Election not found")
        return election_id

    active = await get_active_election(db)
    if not active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active election found. Supply election_id explicitly.",
        )
    return active.id


# ---------------------------------------------------------------------------
# SSE Streaming
# ---------------------------------------------------------------------------

async def _results_event_generator(
    request: Request, db: AsyncSession, election_id: UUID, interval: int
):
    while True:
        if await request.is_disconnected():
            break
        try:
            results = await get_all_election_results(db, election_id)
            yield f"data: {json.dumps(results)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        await asyncio.sleep(interval)


async def _statistics_event_generator(
    request: Request, db: AsyncSession, election_id: UUID, interval: int
):
    while True:
        if await request.is_disconnected():
            break
        try:
            stats = {
                "voting": await get_voting_statistics_engine(db, election_id),
                "tokens": await token_generator.get_token_statistics(db, election_id),
                "portfolios": await get_portfolio_statistics(db, election_id),
                "candidates": await get_candidate_statistics(db, election_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            yield f"data: {json.dumps(stats)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        await asyncio.sleep(interval)


_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


@router.get("/stream/results")
async def stream_election_results(
    request: Request,
    election_id: Optional[UUID] = None,
    interval: int = settings.SSE_DEFAULT_INTERVAL,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """SSE — streams live election results every `interval` seconds."""
    eid = await _resolve_election(db, election_id)
    safe_interval = settings.clamp_sse_interval(interval)
    return StreamingResponse(
        _results_event_generator(request, db, eid, safe_interval),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/stream/statistics")
async def stream_election_statistics(
    request: Request,
    election_id: Optional[UUID] = None,
    interval: int = settings.SSE_DEFAULT_INTERVAL,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """SSE — streams live election statistics every `interval` seconds."""
    eid = await _resolve_election(db, election_id)
    safe_interval = settings.clamp_sse_interval(interval)
    return StreamingResponse(
        _statistics_event_generator(request, db, eid, safe_interval),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---------------------------------------------------------------------------
# Token Management
# ---------------------------------------------------------------------------

@router.post("/generate-tokens/all", response_model=TokenGenerationResponse)
async def generate_tokens_for_all(
    request: TokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    """Generate tokens for all eligible voters in the specified election."""
    eid = await _resolve_election(db, request.election_id)
    result = await token_generator.generate_tokens_for_all_electorates(
        db=db,
        election_id=eid,
        exclude_voted=request.exclude_voted,
    )
    await SecurityAuditLogger.log_token_generation(
        db, current_admin["username"],
        result.get("generated_tokens", 0),
        role=current_admin["role"],
    )
    await db.commit()
    return result


@router.post("/generate-tokens/bulk", response_model=TokenGenerationResponse)
async def generate_tokens_for_selected(
    request: BulkTokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    """Generate tokens for a specific list of voter IDs."""
    eid = await _resolve_election(db, request.election_id)
    result = await token_generator.generate_tokens_for_electorates(
        db=db,
        election_id=eid,
        electorate_ids=request.electorate_ids,
    )
    await SecurityAuditLogger.log_token_generation(
        db, current_admin["username"],
        result.get("generated_tokens", 0),
        role=current_admin["role"],
    )
    await db.commit()
    return result


@router.post(
    "/regenerate-token/{electorate_id}",
    response_model=SingleTokenRegenerationResponse,
)
async def regenerate_token(
    electorate_id: uuid.UUID,
    request: SingleTokenRegenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    """Regenerate a single voter's token (e.g. expired or lost)."""
    eid = await _resolve_election(db, request.election_id)
    result = await token_generator.regenerate_token_for_electorate(
        db=db,
        election_id=eid,
        electorate_id=electorate_id,
    )
    await SecurityAuditLogger.log_admin_action(
        db,
        current_admin["username"],
        current_admin["role"],
        "regenerate_token",
        "voting_token",
        resource_id=str(electorate_id),
    )
    await db.commit()
    return result


# generate_tokens_for_portfolio was removed — it relied on Vote.electorate_id
# which doesn't exist (Vote is anonymized). Use generate-tokens/all instead.


# ---------------------------------------------------------------------------
# Voter / Electorate views
# ---------------------------------------------------------------------------

@router.get("/voters", response_model=List[ElectorateOut])
async def list_voters(
    skip: int = 0,
    limit: int = 100,
    has_voted: Optional[bool] = None,
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("view_voters")),
):
    """List voters, optionally scoped to an election's voter roll."""
    voters = await get_electorates(db, skip=skip, limit=limit, election_id=election_id)
    if has_voted is not None:
        voters = [v for v in voters if v.get("has_voted") == has_voted]
    return voters


@router.get("/voters/{voter_id}", response_model=ElectorateOut)
async def get_voter(
    voter_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    voter = await get_electorate(db, voter_id)
    if not voter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voter not found")
    return voter


@router.get("/electorate-tokens")
async def get_electorate_tokens_endpoint(
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    """
    Return voters with their active tokens for the admin display window.
    Tokens are served from the in-process plaintext cache populated at
    generation time.  token=None means the cache has expired — regenerate.
    """
    eid = await _resolve_election(db, election_id)
    return await get_electorates_with_tokens(db, eid)


# ---------------------------------------------------------------------------
# Statistics & Results
# ---------------------------------------------------------------------------

@router.get("/statistics")
async def get_election_statistics(
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    eid = await _resolve_election(db, election_id)
    return {
        "voting": await get_voting_statistics_engine(db, eid),
        "tokens": await token_generator.get_token_statistics(db, eid),
        "portfolios": await get_portfolio_statistics(db, eid),
        "candidates": await get_candidate_statistics(db, eid),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/results", response_model=List[ElectionResults])
async def get_election_results(
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    eid = await _resolve_election(db, election_id)
    return await get_all_election_results(db, eid)


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 50,
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    eid = await _resolve_election(db, election_id)
    recent_votes = await get_recent_votes_engine(db, eid, limit=limit)
    return {
        "recent_votes": recent_votes,
        "total_recent_votes": len(recent_votes),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/token-statistics")
async def get_token_statistics(
    election_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    eid = await _resolve_election(db, election_id)
    return await token_generator.get_token_statistics(db, eid)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@router.get("/health", include_in_schema=False)
async def health_check():
    """Docker / load-balancer health check. No auth required."""
    db_ok = await check_db_health()
    if not db_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


__all__ = ["router"]