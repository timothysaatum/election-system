import os
import uuid
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.crud.crud_election import (
    create_election_engine,
    delete_election_engine,
    get_active_election,
    get_election_engine,
    get_elections,
    update_election_engine,
)
from app.schemas.electorates import ElectionCreate, ElectionOut, ElectionUpdate

# Logo upload configuration
UPLOAD_DIR = "uploads/elections"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

router = APIRouter(prefix="/elections", tags=["Election Management"])


@router.post("", response_model=ElectionOut, status_code=status.HTTP_201_CREATED)
async def create_election(
    election_data: ElectionCreate,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Create a new election.
    If is_active=True, all other elections are automatically deactivated.
    """
    try:
        election = await create_election_engine(db, election_data)
        return election
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create election: {str(e)}",
        )


@router.post("/upload-logo")
async def upload_election_logo(
    file: UploadFile = File(...),
    current_admin=Depends(get_current_user),
):
    """
    Upload an election logo independently.
    Returns the logo URL and filename to use when creating or updating an election.
    """
    try:
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.",
            )

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 5MB.",
            )

        os.makedirs(UPLOAD_DIR, exist_ok=True)

        file_extension = file.filename.split(".")[-1] if "." in file.filename else "png"
        unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as buffer:
            buffer.write(content)

        logo_url = f"/uploads/elections/{unique_filename}"

        return {
            "success": True,
            "message": "Logo uploaded successfully",
            "filename": unique_filename,
            "logo_url": logo_url,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload logo: {str(e)}",
        )


@router.delete("/delete-logo/{filename}")
async def delete_election_logo(
    filename: str,
    current_admin=Depends(get_current_user),
):
    """Delete an election logo file from disk."""
    try:
        file_path = os.path.join(UPLOAD_DIR, filename)

        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Logo file not found",
            )

        os.remove(file_path)
        return {"success": True, "message": "Logo deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete logo: {str(e)}",
        )


@router.get("/active", response_model=ElectionOut)
async def get_current_active_election(
    db: AsyncSession = Depends(get_db),
):
    """Get the currently active election. Public — no auth required.
    Used by the voting frontend to display election name/logo/watermark."""
    election = await get_active_election(db)
    if not election:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active election found",
        )
    return election


@router.get("", response_model=List[ElectionOut])
async def list_elections(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """List all elections, most recently created first. Public — no auth required.
    Used by the voting frontend to load election branding (logo, name, watermark)."""
    try:
        elections = await get_elections(db, skip=skip, limit=limit)
        return elections
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve elections: {str(e)}",
        )


@router.get("/{election_id}", response_model=ElectionOut)
async def get_election(
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """Get a specific election by ID."""
    try:
        election = await get_election_engine(db, election_id)
        if not election:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Election not found",
            )
        return election
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve election: {str(e)}",
        )


@router.patch("/{election_id}", response_model=ElectionOut)
async def update_election(
    election_id: UUID,
    election_data: ElectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """
    Update an election.
    Setting is_active=True will automatically deactivate all other elections.
    """
    try:
        election = await update_election_engine(db, election_id, election_data)
        if not election:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Election not found",
            )
        return election
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update election: {str(e)}",
        )


@router.post("/{election_id}/upload-logo")
async def upload_logo_for_election(
    election_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """Upload and immediately attach a logo to an existing election."""
    try:
        election = await get_election_engine(db, election_id)
        if not election:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Election not found",
            )

        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.",
            )

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 5MB.",
            )

        os.makedirs(UPLOAD_DIR, exist_ok=True)

        file_extension = file.filename.split(".")[-1] if "." in file.filename else "png"
        unique_filename = f"{election_id}_{uuid.uuid4().hex}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as buffer:
            buffer.write(content)

        election.logo_filename = unique_filename
        election.logo_url = f"/uploads/elections/{unique_filename}"
        await db.commit()

        return {
            "success": True,
            "message": "Logo uploaded and attached to election",
            "filename": unique_filename,
            "logo_url": election.logo_url,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload logo: {str(e)}",
        )


@router.delete("/{election_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_election(
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_user),
):
    """Delete an election by ID."""
    try:
        success = await delete_election_engine(db, election_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Election not found",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete election: {str(e)}",
        )