"""
Shared election resolution utility for routers.

Usage — call it as a regular async function, passing db and election_id directly:

    from app.utils.election_deps import resolve_election

    @router.get("/something")
    async def my_endpoint(
        election_id: Optional[UUID] = None,
        db: AsyncSession = Depends(get_db),
        current_user=Depends(get_current_user),
    ):
        eid = await resolve_election(db, election_id)
        ...

Do NOT wrap it in Depends() — it is a helper function, not a FastAPI dependency.
"""

from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.election import get_active_election, get_election


async def resolve_election(db: AsyncSession, election_id: Optional[UUID]) -> UUID:
    """
    Return the provided election_id, or fall back to the currently active
    election.  Raises 404 if neither can be found.

    This is the single source of truth — imported by admin_router, results_router,
    and any other router that needs election resolution.
    """
    if election_id:
        election = await get_election(db, election_id)
        if not election:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Election not found"
            )
        return election_id

    active = await get_active_election(db)
    if not active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active election found. Supply election_id explicitly.",
        )
    return active.id