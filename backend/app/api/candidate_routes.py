"""
Candidate Management Router

All endpoints require admin authentication.
election_id is required on list/search endpoints — candidates are scoped
through their portfolio to a specific election.
"""

import os
import uuid
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.crud_candidates import (
    create_candidate_engine,
    delete_candidate_engine,
    get_candidate_engine,
    get_candidates,
    get_candidates_by_portfolio,
    search_candidates,
    update_candidate_engine,
)
from app.crud.crud_portfolios import get_portfolio_engine
from app.middleware.auth_middleware import get_current_admin
from app.schemas.electorates import CandidateCreate, CandidateOut, CandidateUpdate

UPLOAD_DIR = "uploads/candidates"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

router = APIRouter(prefix="/candidates", tags=["Candidate Management"])


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

@router.post("", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    candidate_data: CandidateCreate,
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Create a new candidate within a portfolio."""
    try:
        # Verify the parent portfolio exists and belongs to this election
        portfolio = await get_portfolio_engine(
            db, candidate_data.portfolio_id, election_id=election_id
        )
        if not portfolio:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio not found in this election",
            )
        return await create_candidate_engine(db, candidate_data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create candidate: {exc}",
        )


# ---------------------------------------------------------------------------
# Image uploads
# ---------------------------------------------------------------------------

@router.post("/upload-image")
async def upload_candidate_image(
    file: UploadFile = File(...),
    current_admin=Depends(get_current_admin),
):
    """Upload a candidate image independently before or during candidate creation."""
    try:
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
            )
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 5MB",
            )
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
        filename = f"{uuid.uuid4().hex}.{ext}"
        with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
            f.write(content)
        return {
            "success": True,
            "message": "Image uploaded successfully",
            "filename": filename,
            "file_url": f"/uploads/candidates/{filename}",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {exc}",
        )


@router.delete("/delete-image/{filename}")
async def delete_candidate_image(
    filename: str,
    current_admin=Depends(get_current_admin),
):
    """Delete a candidate image file."""
    try:
        path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.exists(path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Image file not found"
            )
        os.remove(path)
        return {"success": True, "message": "Image deleted successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete image: {exc}",
        )


@router.post("/{candidate_id}/upload-picture")
async def upload_candidate_picture(
    candidate_id: UUID,
    election_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Upload a profile picture for a specific candidate."""
    try:
        # Uses get_candidate_engine (not undefined get_candidate) with election_id
        candidate = await get_candidate_engine(db, candidate_id, election_id=election_id)
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
            )
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed",
            )
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 5MB",
            )
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
        filename = f"{candidate_id}_{uuid.uuid4().hex}.{ext}"
        path = os.path.join(UPLOAD_DIR, filename)
        with open(path, "wb") as f:
            f.write(content)
        candidate.picture_url = f"/uploads/candidates/{filename}"
        await db.commit()
        return {
            "message": "Picture uploaded successfully",
            "filename": filename,
            "url": candidate.picture_url,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload picture: {exc}",
        )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get("", response_model=List[CandidateOut])
async def list_candidates(
    election_id: UUID,
    skip: int = 0,
    limit: int = 100,
    portfolio_id: Optional[UUID] = None,
    active_only: bool = False,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """List candidates within an election, with optional filtering."""
    try:
        if search:
            candidates = await search_candidates(
                db,
                search_term=search,
                election_id=election_id,    # was missing — search had no election scope
                portfolio_id=portfolio_id,
                limit=limit,
            )
        elif portfolio_id:
            candidates = await get_candidates_by_portfolio(
                db, portfolio_id=portfolio_id, active_only=active_only
            )
        else:
            candidates = await get_candidates(
                db,
                election_id=election_id,    # was missing — returned across all elections
                skip=skip,
                limit=limit,
                active_only=active_only,
            )

        for candidate in candidates:
            if candidate.picture_url and not candidate.picture_url.startswith(("http", "/")):
                candidate.picture_url = f"/{candidate.picture_url}"

        return candidates
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve candidates: {exc}",
        )


@router.get("/{candidate_id}", response_model=CandidateOut)
async def get_candidate(
    candidate_id: UUID,
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Get a specific candidate scoped to an election."""
    try:
        # get_candidate_engine (not get_candidate — that function doesn't exist)
        candidate = await get_candidate_engine(db, candidate_id, election_id=election_id)
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
            )
        return candidate
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve candidate: {exc}",
        )


# ---------------------------------------------------------------------------
# Update / Delete
# ---------------------------------------------------------------------------

@router.patch("/{candidate_id}", response_model=CandidateOut)
async def update_candidate(
    candidate_id: UUID,
    election_id: UUID,
    candidate_data: CandidateUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Update a candidate (scoped to its election)."""
    try:
        candidate = await update_candidate_engine(
            db, candidate_id, candidate_data, election_id=election_id
        )
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
            )
        return candidate
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update candidate: {exc}",
        )


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: UUID,
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Delete a candidate (only when election is in DRAFT status)."""
    try:
        success = await delete_candidate_engine(
            db, candidate_id, election_id=election_id
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete candidate: {exc}",
        )