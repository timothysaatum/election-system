"""
Election System — Pydantic Schemas (FastAPI request/response models)

Naming conventions:
  *Create  — payload for POST (creation)
  *Update  — payload for PATCH (partial update, all fields Optional)
  *Out     — response shape returned to the client

Key design notes:
  - VotingTokenCreate requires election_id (fixes previous crash)
  - PortfolioCreate requires election_id (fixes previous crash)
  - VoteOut has NO electorate_id (Vote model is anonymized — see models.py §1)
  - ElectorateOut.has_voted reads the stored column added in models.py
  - All legacy device/biometric schemas have been removed
  - StudentIDConverter is the single source of truth (no duplicate in service layer)
  - ElectionVoterRollOut.flatten_electorate model_validator populates flattened
    electorate fields from the SQLAlchemy relationship (fixes null student_id/name/program)
  - ElectionCreate/Update/Out carry logo_url and logo_filename (mirrors the
    Candidate picture_url/picture_filename pattern)
"""

from __future__ import annotations

from enum import Enum
import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer, model_validator


# ---------------------------------------------------------------------------
# Student ID helpers
# ---------------------------------------------------------------------------

class StudentIDConverter:
    """
    Handle student ID conversion between storage and display formats.

    Storage format : MLS-0201-19  (hyphens  — written to DB)
    Display format : MLS/0201/19  (slashes  — shown in UI / returned to client)

    This class is the single source of truth.  Import it everywhere; do not
    redefine it in service or token-generation modules.
    """

    @staticmethod
    def to_storage(student_id: str) -> str:
        """MLS/0201/19  →  MLS-0201-19"""
        if not student_id:
            return student_id
        return student_id.strip().upper().replace("/", "-")

    @staticmethod
    def to_display(student_id: str) -> str:
        """MLS-0201-19  →  MLS/0201/19"""
        if not student_id:
            return student_id
        return student_id.strip().replace("-", "/")

    @staticmethod
    def normalize(student_id: str) -> str:
        """Normalise to storage format regardless of input (slash or hyphen)."""
        if not student_id:
            return student_id
        return student_id.strip().upper().replace("/", "-")

    @staticmethod
    def validate(student_id: str) -> bool:
        """
        Validate student ID format.
        Accepted patterns: XXX/XXXX/XX  or  XXX-XXXX-XX
        Example valid IDs: MLS/0201/19, CSC-1234-22
        """
        if not student_id:
            return False

        student_id = student_id.strip()
        has_slashes = "/" in student_id
        has_hyphens = "-" in student_id

        if has_slashes and has_hyphens:
            return False
        if not (has_slashes or has_hyphens):
            return False

        sep = "/" if has_slashes else "-"
        parts = student_id.split(sep)

        if len(parts) != 3:
            return False
        if not (parts[0].isalpha() and len(parts[0]) == 3):
            return False
        if not (parts[1].isdigit() and len(parts[1]) == 4):
            return False
        if not (parts[2].isdigit() and len(parts[2]) == 2):
            return False

        return True


# ---------------------------------------------------------------------------
# Electorate schemas
# ---------------------------------------------------------------------------

class ElectorateBase(BaseModel):
    """Shared fields for Electorate create / update.  student_id auto-normalised."""

    student_id: str
    name: Optional[str] = None
    program: Optional[str] = None
    year_level: Optional[int] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

    @field_validator("student_id", mode="before")
    @classmethod
    def normalise_student_id(cls, v: str) -> str:
        if not v:
            raise ValueError("student_id is required")
        normalised = StudentIDConverter.normalize(v)
        if len(normalised) < 5:
            raise ValueError("student_id is too short")
        return normalised

    @field_validator("year_level")
    @classmethod
    def validate_year_level(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in {100, 200, 300, 400, 500, 600}:
            raise ValueError("year_level must be one of: 100, 200, 300, 400, 500, 600")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 14:
            raise ValueError("phone_number must be at most 14 characters")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if len(v) > 255:
                raise ValueError("email must be at most 255 characters")
            if "@" not in v:
                raise ValueError("email must be a valid email address")
        return v


class ElectorateCreate(ElectorateBase):
    pass


class ElectorateUpdate(BaseModel):
    """All fields optional — use for PATCH operations."""

    student_id: Optional[str] = None
    name: Optional[str] = None
    program: Optional[str] = None
    year_level: Optional[int] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

    @field_validator("student_id", mode="before")
    @classmethod
    def normalise_student_id(cls, v: Optional[str]) -> Optional[str]:
        return StudentIDConverter.normalize(v) if v else v

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 14:
            raise ValueError("phone_number must be at most 14 characters")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if len(v) > 255:
                raise ValueError("email must be at most 255 characters")
            if "@" not in v:
                raise ValueError("email must be a valid email address")
        return v


class ElectorateOut(BaseModel):
    """
    Response schema for a voter.

    has_voted / voted_at are now real columns on the Electorate model.
    voting_token is a transient field populated by CRUD helpers — it will
    be None if the voter has no active token, or "GENERATED" / the plaintext
    token depending on the calling context.
    """
    id: uuid.UUID
    student_id: str        # Returned in display format (slashes) — see serialiser
    name: Optional[str] = None
    program: Optional[str] = None
    year_level: Optional[int] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    has_voted: bool
    voted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    voting_token: Optional[str] = None   # Transient — not a DB column

    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="wrap")
    def _serialise(self, handler):
        data = handler(self)
        # Convert storage format (hyphens) → display format (slashes)
        if data.get("student_id"):
            data["student_id"] = StudentIDConverter.to_display(data["student_id"])
        return data


# ---------------------------------------------------------------------------
# Election schemas
# ---------------------------------------------------------------------------
class ElectionStatus(str, Enum):
    """
    Election lifecycle states.

    Enforced transitions (see crud/election.py):
        DRAFT → READY → OPEN → CLOSED → PUBLISHED

    DRAFT     — created, config still editable
    READY     — locked and ready to open; config frozen
    OPEN      — voting is live; ballots can be cast
    CLOSED    — voting period has ended
    PUBLISHED — results are finalised and public (terminal state)
    """
    DRAFT     = "draft"
    READY     = "ready"
    OPEN      = "open"
    CLOSED    = "closed"
    PUBLISHED = "published"

class ElectionCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    opens_at: Optional[datetime] = None
    closes_at: Optional[datetime] = None
    # Election logo — optional at creation time; can be set via PATCH later.
    # logo_url      : resolved public URL (CDN path, signed URL, or /static/… path).
    # logo_filename : raw filename on disk / object-store (used for deletion/replacement).
    logo_url: Optional[str] = Field(None, max_length=500)
    logo_filename: Optional[str] = Field(None, max_length=255)


class ElectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = None
    opens_at: Optional[datetime] = None
    closes_at: Optional[datetime] = None
    logo_url: Optional[str] = Field(None, max_length=500)
    logo_filename: Optional[str] = Field(None, max_length=255)


class ElectionOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    status: str
    is_locked: bool
    opens_at: Optional[datetime] = None
    closes_at: Optional[datetime] = None
    data_hash: Optional[str] = None
    logo_url: Optional[str] = None
    logo_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# ElectionVoterRoll schemas
# ---------------------------------------------------------------------------

class VoterRollEntryOut(BaseModel):
    id: uuid.UUID
    election_id: uuid.UUID
    electorate_id: uuid.UUID
    has_voted: bool
    voted_at: Optional[datetime] = None
    added_at: datetime
    added_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ElectionStatusUpdate(BaseModel):
    """Body for POST /elections/{id}/status"""
    status: ElectionStatus


# ---------------------------------------------------------------------------
# Voter roll management
# ---------------------------------------------------------------------------

class ElectionVoterRollAdd(BaseModel):
    """Body for POST /elections/{id}/voter-roll — add one voter."""
    electorate_id: uuid.UUID


class ElectionVoterRollOut(BaseModel):
    """
    Response for a single voter roll entry with flattened electorate fields.

    The CRUD loads the electorate relationship via:
        selectinload(ElectionVoterRoll.electorate)

    Without the model_validator below, Pydantic tries to find student_id /
    name / program directly on the ElectionVoterRoll ORM row — they don't
    exist there, so they serialize as null. The validator intercepts the raw
    ORM object before field extraction and promotes the nested electorate
    fields to the top level.
    """
    id: uuid.UUID
    election_id: uuid.UUID
    electorate_id: uuid.UUID
    has_voted: bool
    voted_at: Optional[datetime] = None
    added_at: datetime
    added_by: Optional[str] = None

    # Flattened from the joined electorate relationship
    student_id: Optional[str] = None
    name: Optional[str] = None
    program: Optional[str] = None
    year_level: Optional[int] = None
    email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def flatten_electorate(cls, data: Any) -> Any:
        """
        Flatten electorate fields from the SQLAlchemy relationship.

        Called before Pydantic extracts individual fields, so we can reshape
        the incoming data regardless of whether it arrives as an ORM object
        (from FastAPI endpoints) or a plain dict (from tests / direct calls).
        """
        # ── ORM object path (normal FastAPI request) ──────────────────────────
        # SQLAlchemy ORM objects have __tablename__; use that as a reliable check
        if hasattr(data, "__tablename__"):
            e = getattr(data, "electorate", None)
            result: dict = {
                "id":            data.id,
                "election_id":   data.election_id,
                "electorate_id": data.electorate_id,
                "has_voted":     data.has_voted,
                "voted_at":      data.voted_at,
                "added_at":      data.added_at,
                "added_by":      data.added_by,
                # Default to None; overwritten below if electorate is loaded
                "student_id":    None,
                "name":          None,
                "program":       None,
                "year_level":    None,
                "email":         None,
            }
            if e is not None:
                result["student_id"] = (
                    StudentIDConverter.to_display(e.student_id)
                    if e.student_id else None
                )
                result["name"]       = e.name
                result["program"]    = e.program
                result["year_level"] = e.year_level
                result["email"]      = e.email
            return result

        # ── Dict path (tests / already-serialised data) ───────────────────────
        if isinstance(data, dict):
            e = data.get("electorate")
            if e is not None:
                # electorate may be a nested ORM object or a nested dict
                if hasattr(e, "__tablename__"):
                    get = lambda k: getattr(e, k, None)
                else:
                    get = lambda k: e.get(k) if isinstance(e, dict) else None
                sid = get("student_id")
                data.setdefault("student_id", StudentIDConverter.to_display(sid) if sid else None)
                data.setdefault("name",       get("name"))
                data.setdefault("program",    get("program"))
                data.setdefault("year_level", get("year_level"))
                data.setdefault("email",      get("email"))
        return data


# ---------------------------------------------------------------------------
# Election with portfolios (for GET /elections/{id})
# ---------------------------------------------------------------------------

class ElectionWithPortfoliosOut(BaseModel):
    """Election detail response including portfolios and candidates."""
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    status: str
    is_locked: bool
    opens_at: Optional[datetime] = None
    closes_at: Optional[datetime] = None
    data_hash: Optional[str] = None
    logo_url: Optional[str] = None
    logo_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Nested (only loaded when load_portfolios=True in crud)
    portfolios: List[dict] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Voter roll bulk import response
# ---------------------------------------------------------------------------

class VoterRollImportResponse(BaseModel):
    success: bool
    message: str
    total_rows: int
    added: int
    updated: int
    skipped: int
    errors: List[dict] = []


# ---------------------------------------------------------------------------
# VotingToken schemas
# ---------------------------------------------------------------------------

class VotingTokenCreate(BaseModel):
    """Used internally when creating a token record in the DB."""
    election_id: uuid.UUID    # REQUIRED — previously missing, caused DB crash
    electorate_id: uuid.UUID


class VotingTokenOut(BaseModel):
    id: uuid.UUID
    election_id: uuid.UUID
    electorate_id: uuid.UUID
    is_active: bool
    is_used: bool
    used_at: Optional[datetime] = None
    usage_count: int
    failure_count: int
    last_used_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime
    revoked: bool
    revoked_at: Optional[datetime] = None
    revoked_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class VotingTokenVerification(BaseModel):
    """Payload sent by a voting station to verify a token."""
    token: str
    student_id: str    # Second factor — must match the token's electorate


# ---------------------------------------------------------------------------
# Token generation schemas
# ---------------------------------------------------------------------------

class TokenGenerationRequest(BaseModel):
    """Request to generate tokens for all eligible voters in an election."""
    election_id: uuid.UUID
    exclude_voted: bool = True


class BulkTokenGenerationRequest(BaseModel):
    """Request to generate tokens for a specific list of voters."""
    election_id: uuid.UUID
    electorate_ids: List[uuid.UUID]

    @field_validator("electorate_ids")
    @classmethod
    def must_not_be_empty(cls, v: List[uuid.UUID]) -> List[uuid.UUID]:
        if not v:
            raise ValueError("At least one electorate ID is required")
        return v


class SingleTokenRegenerationRequest(BaseModel):
    """Request to regenerate a single voter's token (e.g. it expired)."""
    election_id: uuid.UUID


class GeneratedTokenInfo(BaseModel):
    """Info for one generated token — returned to the admin for distribution."""
    electorate_id: uuid.UUID
    student_id: str          # Already in display format (slashes)
    name: str
    token: str               # 4-character plaintext — shown ONCE then discarded
    expires_at: datetime
    created: bool


class TokenGenerationResponse(BaseModel):
    success: bool
    message: str
    generated_tokens: int
    tokens: List[GeneratedTokenInfo]


class SingleTokenRegenerationResponse(BaseModel):
    success: bool
    message: str
    token: Optional[str] = None       # None if voter already voted
    expires_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# VotingSession schemas
# ---------------------------------------------------------------------------

class VotingSessionOut(BaseModel):
    id: uuid.UUID
    electorate_id: uuid.UUID
    election_id: uuid.UUID
    voting_token_id: uuid.UUID
    station_identifier: Optional[str] = None
    ip_address: Optional[str] = None
    login_method: Optional[str] = None
    is_valid: bool
    vote_submitted: bool
    last_activity_at: datetime
    expires_at: datetime
    created_at: datetime
    terminated_at: Optional[datetime] = None
    termination_reason: Optional[str] = None
    suspicious_activity: bool
    activity_count: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Voter authentication schemas
# ---------------------------------------------------------------------------

class TokenVerificationRequest(BaseModel):
    """Sent by a voting station when a voter submits their token + student ID."""
    token: str
    student_id: str


class TokenVerificationResponse(BaseModel):
    """
    Returned after successful token verification.
    Gives the voting station a short-lived JWT to submit the ballot.
    """
    success: bool
    access_token: str
    token_type: str = "bearer"
    expires_in: int                      # Seconds
    electorate: ElectorateOut


class VoterAuthSchema(BaseModel):
    """Used at the EC station to verify a voter's identity (PIN path)."""
    voting_pin: str
    student_id: str


# ---------------------------------------------------------------------------
# Portfolio schemas
# ---------------------------------------------------------------------------

class PortfolioBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    is_active: bool = True
    max_candidates: int = Field(default=10, ge=1)
    voting_order: int = Field(default=0, ge=0)


class PortfolioCreate(PortfolioBase):
    election_id: uuid.UUID   # REQUIRED — previously missing, caused DB crash


class PortfolioUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    max_candidates: Optional[int] = Field(None, ge=1)
    voting_order: Optional[int] = Field(None, ge=0)


class PortfolioOut(PortfolioBase):
    id: uuid.UUID
    election_id: uuid.UUID
    candidate_count: Optional[int] = 0
    vote_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Candidate schemas
# ---------------------------------------------------------------------------

class CandidateBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    picture_url: Optional[str] = None
    picture_filename: Optional[str] = None
    manifesto: Optional[str] = None
    bio: Optional[str] = None
    is_active: bool = True
    display_order: int = Field(default=0, ge=0)


class CandidateCreate(CandidateBase):
    portfolio_id: uuid.UUID


class CandidateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    picture_url: Optional[str] = None
    picture_filename: Optional[str] = None
    manifesto: Optional[str] = None
    bio: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)


class CandidateOut(CandidateBase):
    id: uuid.UUID
    portfolio_id: uuid.UUID
    vote_count: Optional[int] = 0
    portfolio: Optional[PortfolioOut] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Vote schemas
# ---------------------------------------------------------------------------

class VoteCreate(BaseModel):
    portfolio_id: uuid.UUID
    candidate_id: uuid.UUID
    vote_type: str = Field(default="endorsed", pattern="^(endorsed|abstain)$")


class VotingCreation(BaseModel):
    """
    Full ballot submission — a list of one vote per portfolio.
    Validators enforce that the same portfolio cannot appear twice.
    """
    votes: List[VoteCreate]

    @field_validator("votes")
    @classmethod
    def must_not_be_empty(cls, v: List[VoteCreate]) -> List[VoteCreate]:
        if not v:
            raise ValueError("At least one vote is required")
        return v

    @field_validator("votes")
    @classmethod
    def unique_portfolios(cls, v: List[VoteCreate]) -> List[VoteCreate]:
        ids = [vote.portfolio_id for vote in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Cannot vote for the same portfolio more than once")
        return v


class VoteOut(BaseModel):
    """
    Response schema for a single vote.

    NOTE: No electorate_id — Vote is anonymized.
          The voting_token_id is the only voter reference, kept for
          audit purposes (admin can cross-reference if legally required).
    """
    id: uuid.UUID
    election_id: uuid.UUID
    portfolio_id: uuid.UUID
    candidate_id: uuid.UUID
    voting_token_id: uuid.UUID
    voting_session_id: Optional[uuid.UUID] = None
    vote_type: str
    ip_address: str
    voted_at: datetime
    is_valid: bool
    created_at: datetime
    portfolio: Optional[PortfolioOut] = None
    candidate: Optional[CandidateOut] = None

    model_config = ConfigDict(from_attributes=True)


class VotingSessionResponse(BaseModel):
    """Returned after a successful ballot submission."""
    success: bool
    message: str
    votes_cast: int
    failed_votes: List[dict] = []


# ---------------------------------------------------------------------------
# Election results schemas
# ---------------------------------------------------------------------------

class CandidateResult(BaseModel):
    id: str
    name: str
    picture_url: Optional[str] = None
    vote_count: int
    rejected_count: int = 0
    total_votes: int


class ElectionResults(BaseModel):
    portfolio_id: str
    portfolio_name: str
    total_votes: int
    total_rejected: int = 0
    candidates: List[CandidateResult]
    winner: Optional[CandidateResult] = None


class ElectionSummary(BaseModel):
    election_id: uuid.UUID
    election_name: str
    status: str
    total_portfolios: int
    total_candidates: int
    total_votes: int
    total_electorates: int
    voted_electorates: int
    turnout_percentage: float
    results: List[ElectionResults]


# ---------------------------------------------------------------------------
# Admin / staff authentication schemas
# ---------------------------------------------------------------------------

class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer")
    expires_in: int = Field(..., description="Token expiration in seconds")
    username: str
    role: str = Field(..., description="admin | ec_official | polling_agent")
    permissions: List[str] = Field(default_factory=list)
    is_admin: bool = Field(default=False)

    model_config = {
        "json_schema_extra": {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 28800,
                "username": "admin123",
                "role": "admin",
                "permissions": ["manage_portfolios", "manage_candidates"],
                "is_admin": True,
            }
        }
    }


class AdminVerifyResponse(BaseModel):
    valid: bool
    username: str
    role: str
    permissions: List[str] = Field(default_factory=list)
    is_admin: bool = False


class PasswordHashResponse(BaseModel):
    password_hash: str
    message: str


# ---------------------------------------------------------------------------
# __all__
# ---------------------------------------------------------------------------

__all__ = [
    # Helpers
    "StudentIDConverter",
    # Electorate
    "ElectorateBase",
    "ElectorateCreate",
    "ElectorateUpdate",
    "ElectorateOut",
    # Election
    "ElectionCreate",
    "ElectionUpdate",
    "ElectionOut",
    # Voter roll
    "VoterRollEntryOut",
    "ElectionVoterRollAdd",
    "ElectionVoterRollOut",
    "VoterRollImportResponse",
    # Voting tokens
    "VotingTokenCreate",
    "VotingTokenOut",
    "VotingTokenVerification",
    # Token generation
    "TokenGenerationRequest",
    "BulkTokenGenerationRequest",
    "SingleTokenRegenerationRequest",
    "GeneratedTokenInfo",
    "TokenGenerationResponse",
    "SingleTokenRegenerationResponse",
    # Sessions
    "VotingSessionOut",
    # Voter auth
    "TokenVerificationRequest",
    "TokenVerificationResponse",
    "VoterAuthSchema",
    # Portfolio
    "PortfolioBase",
    "PortfolioCreate",
    "PortfolioUpdate",
    "PortfolioOut",
    # Candidate
    "CandidateBase",
    "CandidateCreate",
    "CandidateUpdate",
    "CandidateOut",
    # Vote
    "VoteCreate",
    "VotingCreation",
    "VoteOut",
    "VotingSessionResponse",
    # Results
    "CandidateResult",
    "ElectionResults",
    "ElectionSummary",
    # Admin
    "AdminLoginRequest",
    "AdminLoginResponse",
    "AdminVerifyResponse",
    "PasswordHashResponse",
]