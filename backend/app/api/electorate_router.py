# electorate_router.py
from io import BytesIO
from typing import Any, List
from uuid import UUID

import logging
import uuid
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_session_factory
from app.crud.crud_electorates import (
    bulk_create_electorates,
    create_electorate,
    delete_electorate,
    get_electorates,
    update_electorate,
)
from app.middleware.auth_middleware import get_current_admin
from app.schemas.electorates import ElectorateCreate, ElectorateOut, ElectorateUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/electorates", tags=["Electorates"])


@router.get("/", response_model=List[Any])
# response_model=List[Any] because get_electorates() returns List[dict],
# not List[ElectorateOut] ORM objects.  ElectorateOut is still the shape —
# FastAPI will validate the dicts against it at serialisation time.
async def list_electorates(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return await get_electorates(db, skip=skip, limit=limit)


@router.post("/", response_model=ElectorateOut, status_code=status.HTTP_201_CREATED)
async def create_electorate_route(
    electorate: ElectorateCreate,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    logger.debug("Creating electorate: student_id=%s", electorate.student_id)
    return await create_electorate(db, electorate)


@router.patch("/{electorate_id}", response_model=ElectorateOut)
async def update_electorate_route(
    electorate_id: UUID,
    updates: ElectorateUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    updated = await update_electorate(db, electorate_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Electorate not found")
    return updated


@router.delete("/{electorate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_electorate_route(
    electorate_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Soft-deletes the electorate (sets is_deleted=True).  Audit trail preserved."""
    deleted = await delete_electorate(db, electorate_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Electorate not found")
    return None


@router.post("/bulk", response_model=List[ElectorateOut], status_code=status.HTTP_201_CREATED)
async def bulk_create_electorates_route(
    electorates: List[ElectorateCreate],
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return await bulk_create_electorates(db, electorates)


@router.post(
    "/bulk-upload",
    status_code=status.HTTP_202_ACCEPTED,   # 202 — processing continues in background
)
async def bulk_upload_electorates(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    election_id: uuid.UUID = Form(...),
    db: AsyncSession = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Upload a voter list (CSV / XLSX) and enrol them into an election.

    Returns immediately with a summary of how many rows were inserted into the
    master Electorate table. Voter roll sync runs in the background — check
    audit_logs (event_type='voter_roll_sync') for the final outcome.
    """
    ext = file.filename.lower().rsplit(".", 1)[-1]
    if ext not in ("xlsx", "xls", "csv"):
        raise HTTPException(
            status_code=400,
            detail="Only Excel and CSV files are supported."
        )

    try:
        contents = await file.read()
        df = (
            pd.read_csv(BytesIO(contents))
            if ext == "csv"
            else pd.read_excel(
                BytesIO(contents),
                engine="openpyxl" if ext == "xlsx" else "xlrd"
            )
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(e)}")

    if "student_id" not in df.columns:
        raise HTTPException(
            status_code=400,
            detail="File must have a 'student_id' column."
        )

    electorate_list = []
    for row in df.to_dict(orient="records"):
        sid = str(row.get("student_id", "")).strip()
        if not sid or sid.lower() == "nan":
            continue
        try:
            electorate_list.append(
                ElectorateCreate(
                    student_id=sid,
                    name=str(row["name"]) if pd.notna(row.get("name")) else None,
                    program=str(row["program"]) if pd.notna(row.get("program")) else None,
                    year_level=int(row["year_level"]) if pd.notna(row.get("year_level")) else None,
                    phone_number=str(row["phone_number"]) if pd.notna(row.get("phone_number")) else None,
                    email=str(row["email"]) if pd.notna(row.get("email")) else None,
                )
            )
        except Exception:
            continue

    if not electorate_list:
        return {"inserted": 0, "total": 0, "voter_roll_sync": "skipped"}

    return await bulk_create_electorates(
        db=db,
        electorate_list=electorate_list,
        election_id=election_id,
        added_by=current_admin["username"],
        background_tasks=background_tasks,
        db_factory=get_session_factory(),
    )