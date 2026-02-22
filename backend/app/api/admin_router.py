"""
Offline Admin Router
Admin operations for offline voting system
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

from app.core.database import get_db
from app.schemas.electorates import (
    BulkTokenGenerationRequest,
    ElectorateOut,
    ElectionResults,
    SingleTokenRegenerationRequest,
    SingleTokenRegenerationResponse,
    TokenGenerationRequest,
    TokenGenerationResponse
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
from app.middleware.auth_middleware import get_current_admin, get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])
token_generator = BulkTokenGenerator()


# ---------------------------------------------------------------------------
# SSE Streaming Endpoints
# ---------------------------------------------------------------------------

async def _verify_token_from_request(request: Request, db: AsyncSession):
    """
    Extract and verify Bearer token from request headers.
    EventSource cannot set custom headers, so we accept the token
    via the ?token= query param as a fallback.
    """
    from app.middleware.auth_middleware import get_current_user
    from fastapi.security import HTTPAuthorizationCredentials
    
    auth_header = request.headers.get("Authorization", "")
    token = None

    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    else:
        # Fallback: read from query param (EventSource workaround)
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Reuse existing auth logic by injecting a fake credentials object
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    # Call the underlying verifier directly
    from backend.app.api.auth_router import verify_admin_token

    return await verify_admin_token(creds, db)


async def _results_event_generator(request: Request, db: AsyncSession, interval: int = 3):
    """
    Async generator that yields SSE-formatted election results every `interval` seconds.
    Stops when the client disconnects.
    """
    while True:
        if await request.is_disconnected():
            break

        try:
            results = await get_all_election_results(db)

            # Pydantic-safe serialisation: convert UUID/datetime → str
            payload = []
            for r in results:
                payload.append({
                    "portfolio_id": str(r["portfolio_id"]) if isinstance(r.get("portfolio_id"), UUID) else r.get("portfolio_id"),
                    "portfolio_name": r.get("portfolio_name"),
                    "total_votes": r.get("total_votes", 0),
                    "total_rejected": r.get("total_rejected", 0),
                    "candidates": r.get("candidates", []),
                    "winner": r.get("winner"),
                })

            data = json.dumps(payload)
            yield f"data: {data}\n\n"

        except Exception as e:
            error_payload = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_payload}\n\n"

        await asyncio.sleep(interval)


async def _statistics_event_generator(request: Request, db: AsyncSession, interval: int = 3):
    """
    Async generator that yields SSE-formatted election statistics every `interval` seconds.
    Stops when the client disconnects.
    """
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

            data = json.dumps(stats)
            yield f"data: {data}\n\n"

        except Exception as e:
            error_payload = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_payload}\n\n"

        await asyncio.sleep(interval)


@router.get("/stream/results")
async def stream_election_results(
    request: Request,
    interval: int = 3,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    SSE endpoint — streams live election results every `interval` seconds.
    Connect with EventSource on the frontend.
    Pass the JWT via ?token=<jwt> query param since EventSource
    does not support custom headers.
    """
    return StreamingResponse(
        _results_event_generator(request, db, interval),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disables Nginx buffering
            "Connection": "keep-alive",
        },
    )


@router.get("/stream/statistics")
async def stream_election_statistics(
    request: Request,
    interval: int = 3,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    SSE endpoint — streams live election statistics every `interval` seconds.
    Connect with EventSource on the frontend.
    Pass the JWT via ?token=<jwt> query param since EventSource
    does not support custom headers.
    """
    return StreamingResponse(
        _statistics_event_generator(request, db, interval),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Existing Endpoints (unchanged)
# ---------------------------------------------------------------------------

@router.post("/generate-tokens/all", response_model=TokenGenerationResponse)
async def generate_tokens_for_all(
    request: TokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    result = await token_generator.generate_tokens_for_all_electorates(
        db=db,
        exclude_voted=request.exclude_voted,
    )
    return result


@router.post("/generate-tokens/bulk", response_model=TokenGenerationResponse)
async def generate_tokens_for_selected(
    request: BulkTokenGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    result = await token_generator.generate_tokens_for_electorates(
        db=db,
        electorate_ids=request.electorate_ids,
    )
    return result


@router.post("/regenerate-token/{electorate_id}", response_model=SingleTokenRegenerationResponse)
async def regenerate_token(
    electorate_id: uuid.UUID,
    request: SingleTokenRegenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    result = await token_generator.regenerate_token_for_electorate(
        db=db,
        electorate_id=electorate_id,
    )
    return result


@router.post("/generate-tokens/portfolio/{portfolio_id}")
async def generate_tokens_for_portfolio(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    result = await token_generator.generate_tokens_for_portfolio(
        db=db,
        portfolio_id=portfolio_id,
    )
    return result


@router.get("/voters", response_model=List[ElectorateOut])
async def list_voters(
    skip: int = 0,
    limit: int = 100,
    has_voted: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    voters = await get_electorates(db, skip=skip, limit=limit)
    if has_voted is not None:
        voters = [v for v in voters if v.has_voted == has_voted]
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
    current_admin=Depends(get_current_user),
):
    return await get_electorates_with_tokens(db)


@router.get("/statistics")
async def get_election_statistics(
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
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
    current_admin=Depends(get_current_user),
):
    return await get_all_election_results(db)


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
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
    current_admin=Depends(get_current_user),
):
    return await token_generator.get_token_statistics(db)


__all__ = ["router"]