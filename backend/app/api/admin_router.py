"""
Admin Router
All data-mutating and sensitive read endpoints require 'admin' role.
Statistics / results can be accessed by any authenticated role.
"""

import uuid
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db, check_db_health
from app.core.config import settings
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
from app.crud.crud_electorates import get_electorates, get_electorate
from app.crud.crud_portfolios import get_portfolio_statistics
from app.crud.crud_candidates import get_candidate_statistics
from app.crud.crud_votes import (
    get_voting_statistics_engine,
    get_all_election_results,
    get_recent_votes_engine,
)
from app.crud.crud_voting_tokens import get_electorates_with_tokens
from app.middleware.auth_middleware import (
    get_current_admin,
    get_current_user,
    require_permission,
)
from app.utils.security_audit import SecurityAuditLogger

router = APIRouter(prefix="/admin", tags=["Admin"])
token_generator = BulkTokenGenerator()


# ============================================================================
# SSE Streaming
# ============================================================================

async def _results_event_generator(request: Request, db: AsyncSession, interval: int):
    while True:
        if await request.is_disconnected():
            break
        try:
            results = await get_all_election_results(db)
            payload = []
            for r in results:
                payload.append({
                    "portfolio_id": str(r.get("portfolio_id", "")),
                    "portfolio_name": r.get("portfolio_name"),
                    "total_votes": r.get("total_votes", 0),
                    "total_rejected": r.get("total_rejected", 0),
                    "candidates": r.get("candidates", []),
                    "winner": r.get("winner"),
                })
            yield f"data: {json.dumps(payload)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        await asyncio.sleep(interval)


async def _statistics_event_generator(request: Request, db: AsyncSession, interval: int):
    while True:
        if await request.is_disconnected():
            break
        try:
            stats = {
                "voting": await get_voting_statistics_engine(db),
                "tokens": await token_generator.get_token_statistics(db),
                "portfolios": await get_portfolio_statistics(db),
                "candidates": await get_candidate_statistics(db),
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
    interval: int = settings.SSE_DEFAULT_INTERVAL,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),   # any authenticated role
):
    """
    SSE — streams live election results every `interval` seconds.
    Interval is clamped to [{SSE_MIN_INTERVAL}, {SSE_MAX_INTERVAL}] seconds.
    Pass JWT via ?token= query param (EventSource cannot set headers).
    """
    safe_interval = settings.clamp_sse_interval(interval)
    return StreamingResponse(
        _results_event_generator(request, db, safe_interval),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/stream/statistics")
async def stream_election_statistics(
    request: Request,
    interval: int = settings.SSE_DEFAULT_INTERVAL,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),   # any authenticated role
):
    """SSE — streams live election statistics every `interval` seconds."""
    safe_interval = settings.clamp_sse_interval(interval)
    return StreamingResponse(
        _statistics_event_generator(request, db, safe_interval),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ============================================================================
# Token Management — requires admin or ec_official (generate_tokens permission)
# ============================================================================

@router.post("/generate-tokens/all", response_model=TokenGenerationResponse)
async def generate_tokens_for_all(
    request: TokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    result = await token_generator.generate_tokens_for_all_electorates(
        db=db,
        exclude_voted=request.exclude_voted,
    )
    await SecurityAuditLogger.log_token_generation(
        db,
        current_admin["username"],
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
    result = await token_generator.generate_tokens_for_electorates(
        db=db,
        electorate_ids=request.electorate_ids,
    )
    await SecurityAuditLogger.log_token_generation(
        db,
        current_admin["username"],
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
    result = await token_generator.regenerate_token_for_electorate(
        db=db,
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


@router.post("/generate-tokens/portfolio/{portfolio_id}")
async def generate_tokens_for_portfolio(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    result = await token_generator.generate_tokens_for_portfolio(
        db=db,
        portfolio_id=portfolio_id,
    )
    await SecurityAuditLogger.log_token_generation(
        db,
        current_admin["username"],
        result.get("generated_tokens", 0),
        role=current_admin["role"],
    )
    await db.commit()
    return result


# ============================================================================
# Voter / Electorate views — requires view_voters permission
# ============================================================================

@router.get("/voters", response_model=List[ElectorateOut])
async def list_voters(
    skip: int = 0,
    limit: int = 100,
    has_voted: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("view_voters")),
):
    voters = await get_electorates(db, skip=skip, limit=limit)
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
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(require_permission("generate_tokens")),
):
    """
    Return electorates with their active tokens.
    Tokens are served from the in-process plaintext cache populated at
    generation time.  If the process restarted since generation, the
    token field will be None — regenerate tokens in that case.
    """
    return await get_electorates_with_tokens(db)


# ============================================================================
# Statistics & Results — any authenticated role
# ============================================================================

@router.get("/statistics")
async def get_election_statistics(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return {
        "voting": await get_voting_statistics_engine(db),
        "tokens": await token_generator.get_token_statistics(db),
        "portfolios": await get_portfolio_statistics(db),
        "candidates": await get_candidate_statistics(db),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/results", response_model=List[ElectionResults])
async def get_election_results(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_all_election_results(db)


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),  # admin only
):
    recent_votes = await get_recent_votes_engine(db, limit=limit)
    return {
        "recent_votes": recent_votes,
        "total_recent_votes": len(recent_votes),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/token-statistics")
async def get_token_statistics(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await token_generator.get_token_statistics(db)


# ============================================================================
# Health check — no auth required (used by Docker healthcheck)
# ============================================================================

@router.get("/health", include_in_schema=False)
async def health_check():
    """
    Docker / load-balancer health check.
    Returns 200 OK when the application and database are reachable.
    """
    db_ok = await check_db_health()
    if not db_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


__all__ = ["router"]