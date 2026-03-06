"""
Election Router — lifecycle management, voter roll, status transitions.

All state-change endpoints require manage_election permission.
Read endpoints require any authenticated role.
"""

from __future__ import annotations

import logging
from io import BytesIO
import os
from typing import List
from uuid import UUID
import uuid

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud.election import (        # was app.crud.election — module doesn't exist
    add_voter_to_roll,
    bulk_add_voters_to_roll,
    create_election,
    get_election,
    get_voter_roll,
    list_elections,
    lock_election,
    remove_voter_from_roll,
    transition_election_status,
    unlock_election,
    update_election,
)
from app.crud.crud_electorates import bulk_create_electorates, get_electorate_by_student_id
from app.middleware.auth_middleware import get_current_user, require_permission
from app.schemas.electorates import (
    ElectionCreate,
    ElectionOut,
    ElectionStatusUpdate,
    ElectionUpdate,
    ElectionVoterRollAdd,
    ElectionVoterRollOut,
    ElectionWithPortfoliosOut,
    ElectorateCreate,
    VoterRollImportResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/elections", tags=["Elections"])


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return getattr(request.client, "host", "unknown") if request.client else "unknown"

LOGO_UPLOAD_DIR = "uploads/elections"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5 MB
# ---------------------------------------------------------------------------
# Election CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=ElectionOut, status_code=status.HTTP_201_CREATED)
async def create_election_route(
    data: ElectionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """Create a new election (starts in DRAFT status)."""
    return await create_election(
        db, data,
        actor_id=current_user["username"],
        actor_role=current_user["role"],
        ip_address=_client_ip(request),
    )


@router.get("", response_model=List[ElectionOut])
async def list_elections_route(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await list_elections(db)


@router.get("/{election_id}", response_model=ElectionWithPortfoliosOut)
async def get_election_route(
    election_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    election = await get_election(db, election_id, load_portfolios=True)
    if not election:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Election not found")
    return election


@router.patch("/{election_id}", response_model=ElectionOut)
async def update_election_route(
    election_id: UUID,
    data: ElectionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """Update election metadata. Only allowed when unlocked and in DRAFT/READY state."""
    try:
        election = await update_election(
            db, election_id, data,
            actor_id=current_user["username"],
            actor_role=current_user["role"],
            ip_address=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if not election:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Election not found")
    return election

@router.post("/{election_id}/logo", response_model=ElectionOut)
async def upload_election_logo(
    election_id: UUID,
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """
    Upload or replace the logo for an existing election.
    Deletes the old logo file from disk if one was previously set.
    Returns the updated ElectionOut so the frontend can read logo_url directly.
    """
    # 1. Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.",
        )

    # 2. Read & validate file size
    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 5 MB.",
        )

    # 3. Fetch the election
    election = await get_election(db, election_id)
    if not election:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Election not found.",
        )

    # 4. Delete old logo file if one exists
    if election.logo_filename:
        old_path = os.path.join(LOGO_UPLOAD_DIR, election.logo_filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass  # Non-fatal — log if you have a logger

    # 5. Save new file
    os.makedirs(LOGO_UPLOAD_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    filename = f"{election_id}_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(LOGO_UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(contents)

    # 6. Persist logo_url + logo_filename on the election row
    logo_url = f"/uploads/elections/{filename}"
    updated = await update_election(
        db,
        election_id,
        ElectionUpdate(logo_url=logo_url, logo_filename=filename),
        actor_id=current_user["username"],
        actor_role=current_user["role"],
        ip_address=_client_ip(request) if request else None,
    )

    return updated
# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

@router.post("/{election_id}/status", response_model=ElectionOut)
async def update_election_status(
    election_id: UUID,
    body: ElectionStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """
    Transition election status:  DRAFT → READY → OPEN → CLOSED → PUBLISHED

    READY: Locks config, validates ≥1 candidate.
    OPEN:  Validates voter roll non-empty and times set.
    CLOSED: Soft-expires all unused tokens.
    """
    try:
        election = await transition_election_status(
            db, election_id,
            new_status=body.status.value,
            actor_id=current_user["username"],
            actor_role=current_user["role"],
            ip_address=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return election


@router.post("/{election_id}/lock", response_model=ElectionOut)
async def lock_election_route(
    election_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """Manually lock election config without changing status."""
    try:
        return await lock_election(
            db, election_id,
            actor_id=current_user["username"],
            actor_role=current_user["role"],
            ip_address=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/{election_id}/unlock", response_model=ElectionOut)
async def unlock_election_route(
    election_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """Unlock election config for editing (DRAFT or READY only)."""
    try:
        return await unlock_election(
            db, election_id,
            actor_id=current_user["username"],
            actor_role=current_user["role"],
            ip_address=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


# ---------------------------------------------------------------------------
# Voter Roll management
# ---------------------------------------------------------------------------

@router.get("/{election_id}/voter-roll", response_model=List[ElectionVoterRollOut])
async def get_voter_roll_route(
    election_id: UUID,
    skip: int = 0,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_voter_roll(db, election_id, skip=skip, limit=limit)


@router.post(
    "/{election_id}/voter-roll",
    response_model=ElectionVoterRollOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_voter_to_roll_route(
    election_id: UUID,
    body: ElectionVoterRollAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    try:
        return await add_voter_to_roll(
            db, election_id,
            electorate_id=body.electorate_id,
            actor_id=current_user["username"],
            actor_role=current_user["role"],
            ip_address=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.delete(
    "/{election_id}/voter-roll/{electorate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_voter_from_roll_route(
    election_id: UUID,
    electorate_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    try:
        removed = await remove_voter_from_roll(
            db, election_id, electorate_id,
            actor_id=current_user["username"],
            actor_role=current_user["role"],
            ip_address=_client_ip(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Voter not on roll"
        )


@router.post(
    "/{election_id}/voter-roll/bulk-upload",
    response_model=VoterRollImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bulk_upload_voter_roll(
    election_id: UUID,
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission("manage_election")),
):
    """
    Upload a CSV/Excel file of voters and enrol them in this election's voter roll.

    Workflow:
      1. Parse file → build ElectorateCreate list
      2. Upsert into global Electorate registry (skip duplicates)
      3. Collect IDs of all rows (imported + already existing)
      4. Enrol all in this election's voter roll (skip existing entries)
    """
    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in ("xlsx", "xls", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV and Excel files are supported.",
        )

    contents = await file.read()
    df = (
        pd.read_csv(BytesIO(contents))
        if ext == "csv"
        else pd.read_excel(BytesIO(contents), engine="openpyxl" if ext == "xlsx" else "xlrd")
    )

    if "student_id" not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a 'student_id' column.",
        )

    electorate_creates = []
    errors = []
    for i, row in enumerate(df.to_dict(orient="records"), start=2):
        sid = str(row.get("student_id", "")).strip()
        if not sid or sid == "nan":
            errors.append({"row": i, "error": "Missing student_id"})
            continue
        try:
            electorate_creates.append(
                ElectorateCreate(
                    student_id=sid,
                    name=str(row["name"]) if row.get("name") and pd.notna(row.get("name")) else None,
                    program=str(row["program"]) if pd.notna(row.get("program")) else None,
                    year_level=int(row["year_level"]) if row.get("year_level") and pd.notna(row.get("year_level")) else None,
                    phone_number=str(row["phone_number"]) if pd.notna(row.get("phone_number")) else None,
                    email=str(row["email"]) if pd.notna(row.get("email")) else None,
                )
            )
        except Exception as exc:
            errors.append({"row": i, "student_id": sid, "error": str(exc)})

    actor_id = current_user["username"]
    actor_role = current_user["role"]
    ip = _client_ip(request) if request else None

    # Step 1: upsert into global registry
    # bulk_create_electorates now takes (db, list) — actor params were removed
    imported = await bulk_create_electorates(db, electorate_creates)

    # Step 2: collect all IDs (imported + already-existing rows)
    all_ids = [e.id for e in imported]
    for ec in electorate_creates:
        existing = await get_electorate_by_student_id(db, ec.student_id)
        if existing and existing.id not in all_ids:
            all_ids.append(existing.id)

    # Step 3: enrol in voter roll
    try:
        roll_result = await bulk_add_voters_to_roll(
            db, election_id, all_ids,
            actor_id=actor_id,
            actor_role=actor_role,
            ip_address=ip,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return VoterRollImportResponse(
        success=True,
        message="Import complete.",
        total_rows=len(df),
        added=roll_result["added"],
        updated=len(imported),
        skipped=roll_result["skipped"],
        errors=errors,
    )