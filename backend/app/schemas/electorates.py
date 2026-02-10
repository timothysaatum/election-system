"""
Complete Electorate Schemas with Student ID Conversion
Includes ALL schemas from original + student ID conversion
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer
from typing import List, Optional
from datetime import datetime
import uuid


class StudentIDConverter:
    """Handle student ID conversion between formats"""
    
    @staticmethod
    def to_storage(student_id: str) -> str:
        """Convert slash to hyphen for storage: MLS/0201/19 → MLS-0201-19"""
        return student_id.replace("/", "-")
    
    @staticmethod
    def to_display(student_id: str) -> str:
        """Convert hyphen to slash for display: MLS-0201-19 → MLS/0201/19"""
        return student_id.replace("-", "/")


class ElectorateBase(BaseModel):
    student_id: str
    program: Optional[str] = None
    year_level: Optional[int] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

    @field_validator("student_id", mode="before")
    @classmethod
    def convert_student_id_for_storage(cls, v):
        """Convert student ID from slash to hyphen format for storage"""
        if not v:
            raise ValueError("student_id is required")
        # Convert slashes to hyphens
        v_converted = v.replace("/", "-")
        if len(v_converted) < 5:
            raise ValueError("student_id must be at least 5 characters")
        return v_converted

    @field_validator("year_level")
    @classmethod
    def validate_year_level(cls, v):
        if v is not None and (v not in [100, 200, 300, 400, 500, 600]):
            raise ValueError("year_level must be between 100 and 600")
        return v
    
    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v):
        if v is not None and len(v) > 14:
            raise ValueError("phone_number must be at most 14 characters")
        
        if v is not None and isinstance(v, int):
            raise ValueError("phone_number must be a valid string")
        
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if v is not None and len(v) > 255:
            raise ValueError("email must be at most 255 characters")
        
        if v is not None and "@" not in v:
            raise ValueError("email must be a valid email address")
        return v


class ElectorateCreate(ElectorateBase):
    pass


class ElectorateUpdate(BaseModel):
    student_id: Optional[str] = None
    program: Optional[str] = None
    year_level: Optional[int] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

    @field_validator("student_id", mode="before")
    @classmethod
    def convert_student_id_for_storage(cls, v):
        """Convert student ID from slash to hyphen format for storage"""
        if v is not None:
            return v.replace("/", "-")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v):
        if v is not None and len(v) > 14:
            raise ValueError("phone_number must be at most 14 characters")

        if v is not None and isinstance(v, int):
            raise ValueError("phone_number must be a valid string")

        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if v is not None and len(v) > 255:
            raise ValueError("email must be at most 255 characters")

        if v is not None and "@" not in v:
            raise ValueError("email must be a valid email address")
        return v


class ElectorateOut(ElectorateBase):
    """
    Electorate output schema with automatic student ID conversion
    Converts hyphen format (storage) to slash format (display)
    """
    id: uuid.UUID
    has_voted: bool
    voted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    voting_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode='wrap')
    def serialize_model(self, serializer):
        """Custom serializer to convert student_id to display format"""
        data = serializer(self)
        # Convert student_id from hyphen to slash for display
        if 'student_id' in data and data['student_id']:
            data['student_id'] = StudentIDConverter.to_display(data['student_id'])
        return data


# Device Registration Schemas (kept for compatibility)
class LocationData(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None


class DeviceInfo(BaseModel):
    user_agent: str
    browser: str
    os: str
    device_type: str
    fingerprint: str
    security_fingerprint: str
    risk_score: int
    risk_level: str
    risk_factors: list[str]


class DeviceRegistrationRequest(BaseModel):
    full_name: str
    biometric_data: Optional[str] = None
    device_password: Optional[str] = None
    location: Optional[LocationData] = None


class DeviceRegistrationResponse(BaseModel):
    id: uuid.UUID
    device_fingerprint: str
    registration_successful: bool
    voting_token: Optional[str] = None
    message: str


class DeviceRegistrationOut(BaseModel):
    id: uuid.UUID
    device_fingerprint: str
    full_name: str
    ip_address: str
    is_banned: bool
    ban_reason: Optional[str] = None
    created_at: datetime
    last_attempt_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Registration Link Schemas
class RegistrationLinkCreate(BaseModel):
    max_devices: int = 50
    description: Optional[str] = None


class RegistrationLinkOut(BaseModel):
    id: uuid.UUID
    link_token: str
    max_devices: int
    current_device_count: int
    is_active: bool
    expires_at: datetime
    created_by: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Voting Token Schemas
class VotingTokenCreate(BaseModel):
    electorate_id: uuid.UUID
    device_fingerprint: str
    device_info: DeviceInfo
    location_data: Optional[LocationData] = None
    biometric_data: Optional[str] = None
    device_password: Optional[str] = None


class VotingTokenOut(BaseModel):
    id: uuid.UUID
    electorate_id: uuid.UUID
    device_fingerprint: str
    is_active: bool
    usage_count: int
    last_used_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime
    revoked: bool

    model_config = ConfigDict(from_attributes=True)


class VotingTokenVerification(BaseModel):
    token: str
    device_fingerprint: str
    current_location: Optional[LocationData] = None


# Voting Session Schemas
class VotingSessionOut(BaseModel):
    id: uuid.UUID
    electorate_id: uuid.UUID
    session_token: str
    device_fingerprint: str
    ip_address: str
    login_method: str
    is_valid: bool
    last_activity_at: datetime
    expires_at: datetime
    created_at: datetime
    suspicious_activity: bool
    activity_count: int

    model_config = ConfigDict(from_attributes=True)


# Authentication Schemas
class VoterSession(BaseModel):
    id: uuid.UUID
    electorate_id: uuid.UUID
    session_token: str
    device_fingerprint: str
    expires_at: datetime
    is_valid: bool


class VoterToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    electorate: ElectorateOut


class VoterAuthSchema(BaseModel):
    voting_pin: str
    student_id: str


# Link-based Authentication Schemas
class LinkRegistrationRequest(BaseModel):
    link_token: str
    full_name: str
    biometric_data: Optional[str] = None
    device_password: Optional[str] = None
    location: Optional[LocationData] = None


class LinkRegistrationResponse(BaseModel):
    success: bool
    voting_token: Optional[str] = None
    message: str
    device_banned: bool = False
    ban_reason: Optional[str] = None


# Token Verification Schemas
class TokenVerificationRequest(BaseModel):
    token: str  # Now accepts 4-character tokens
    current_location: Optional[LocationData] = None


class TokenVerificationResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    valid: bool
    electorate: Optional[ElectorateOut] = None
    message: str
    device_mismatch: bool = False
    location_mismatch: bool = False


# Token Generation Schemas
class TokenGenerationRequest(BaseModel):
    election_name: str = "Election"
    voting_url: str = "http://localhost:8000"
    send_notifications: bool = False
    notification_methods: List[str] = []
    exclude_voted: bool = True


class BulkTokenGenerationRequest(BaseModel):
    electorate_ids: List[uuid.UUID]
    election_name: str = "Election"
    voting_url: str = "http://localhost:8000"
    send_notifications: bool = False
    notification_methods: List[str] = []

    @field_validator("electorate_ids")
    @classmethod
    def validate_electorate_ids_not_empty(cls, v):
        if not v:
            raise ValueError("At least one electorate ID is required")
        return v


class SingleTokenRegenerationRequest(BaseModel):
    election_name: str = "Election"
    voting_url: str = "http://localhost:8000"
    send_notification: bool = False
    notification_methods: List[str] = []


class GeneratedTokenInfo(BaseModel):
    electorate_id: uuid.UUID
    student_id: str  # Already converted to display format in service
    name: str
    token: str  # Now 4 characters instead of 8
    expires_at: datetime
    created: bool


class TokenGenerationResponse(BaseModel):
    success: bool
    message: str
    generated_tokens: int
    tokens: List[GeneratedTokenInfo]
    notifications_queued: bool = False
    notifications_sent: Optional[int] = None
    failed_notifications: Optional[int] = None


class SingleTokenRegenerationResponse(BaseModel):
    success: bool
    message: str
    token: str  # 4 characters
    expires_at: datetime
    notification_sent: bool = False
    notification_result: Optional[dict] = None


# Portfolio Schemas
class PortfolioBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    max_candidates: int = 1
    voting_order: int = 0


class PortfolioCreate(PortfolioBase):
    pass


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    max_candidates: Optional[int] = None
    voting_order: Optional[int] = None


class PortfolioOut(PortfolioBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    candidate_count: Optional[int] = 0
    vote_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


# Candidate Schemas
class CandidateBase(BaseModel):
    name: str
    party: Optional[str] = None
    picture_url: Optional[str] = None
    picture_filename: Optional[str] = None
    manifesto: Optional[str] = None
    bio: Optional[str] = None
    is_active: bool = True
    display_order: int = 0


class CandidateCreate(CandidateBase):
    portfolio_id: uuid.UUID


class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    party: Optional[str] = None
    picture_url: Optional[str] = None
    picture_filename: Optional[str] = None
    manifesto: Optional[str] = None
    bio: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class CandidateOut(CandidateBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    vote_count: Optional[int] = 0
    portfolio: Optional[PortfolioOut] = None

    model_config = ConfigDict(from_attributes=True)


# Vote Schemas
class VoteCreate(BaseModel):
    portfolio_id: uuid.UUID
    candidate_id: uuid.UUID


class VotingCreation(BaseModel):
    votes: List[VoteCreate]

    @field_validator("votes")
    @classmethod
    def validate_votes_not_empty(cls, v):
        if not v:
            raise ValueError("At least one vote is required")
        return v

    @field_validator("votes")
    @classmethod
    def validate_unique_portfolios(cls, v):
        portfolio_ids = [vote.portfolio_id for vote in v]
        if len(portfolio_ids) != len(set(portfolio_ids)):
            raise ValueError("Cannot vote for the same portfolio multiple times")
        return v


class VoteOut(BaseModel):
    id: uuid.UUID
    electorate_id: uuid.UUID
    voting_session_id: Optional[uuid.UUID] = None
    voted_at: datetime
    is_valid: bool
    created_at: datetime
    electorate: Optional[ElectorateOut] = None
    portfolio: Optional[PortfolioOut] = None
    candidate: Optional[CandidateOut] = None

    model_config = ConfigDict(from_attributes=True)


# Voting Session Response
class VotingSessionResponse(BaseModel):
    success: bool
    message: str
    votes_cast: int
    failed_votes: List[dict] = []
    session_remaining_time: Optional[int] = None


# Election Results Schemas
class ElectionResults(BaseModel):
    portfolio_id: uuid.UUID
    portfolio_name: str
    total_votes: int
    candidates: list[dict]
    winner: Optional[dict] = None


class ElectionSummary(BaseModel):
    total_portfolios: int
    total_candidates: int
    total_votes: int
    total_electorates: int
    voted_electorates: int
    results: list[ElectionResults]


# Admin Authentication Schemas
class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    """Response for admin/staff login"""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration in seconds")
    username: str = Field(..., description="Username of logged in user")
    role: str = Field(..., description="User role: admin, ec_official, or polling_agent")
    permissions: List[str] = Field(default_factory=list, description="User permissions")
    is_admin: bool = Field(default=False, description="Whether user has admin role")

    class Config:
        json_schema_extra = {
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


class AdminVerifyResponse(BaseModel):
    """Response for token verification"""
    valid: bool = Field(..., description="Whether token is valid")
    username: str = Field(..., description="Username from token")
    role: str = Field(..., description="User role from token")
    permissions: List[str] = Field(default_factory=list, description="User permissions")
    is_admin: bool = Field(default=False, description="Whether user has admin role")

    class Config:
        json_schema_extra = {
            "example": {
                "valid": True,
                "username": "admin123",
                "role": "admin",
                "permissions": ["manage_portfolios"],
                "is_admin": True,
            }
        }


class PasswordHashResponse(BaseModel):
    password_hash: str
    message: str


__all__ = [
    "StudentIDConverter",
    "ElectorateBase",
    "ElectorateCreate",
    "ElectorateUpdate",
    "ElectorateOut",
    "LocationData",
    "DeviceInfo",
    "DeviceRegistrationRequest",
    "DeviceRegistrationResponse",
    "DeviceRegistrationOut",
    "RegistrationLinkCreate",
    "RegistrationLinkOut",
    "VotingTokenCreate",
    "VotingTokenOut",
    "VotingTokenVerification",
    "VotingSessionOut",
    "VoterSession",
    "VoterToken",
    "VoterAuthSchema",
    "LinkRegistrationRequest",
    "LinkRegistrationResponse",
    "TokenVerificationRequest",
    "TokenVerificationResponse",
    "TokenGenerationRequest",
    "BulkTokenGenerationRequest",
    "SingleTokenRegenerationRequest",
    "GeneratedTokenInfo",
    "TokenGenerationResponse",
    "SingleTokenRegenerationResponse",
    "PortfolioBase",
    "PortfolioCreate",
    "PortfolioUpdate",
    "PortfolioOut",
    "CandidateBase",
    "CandidateCreate",
    "CandidateUpdate",
    "CandidateOut",
    "VoteCreate",
    "VotingCreation",
    "VoteOut",
    "VotingSessionResponse",
    "ElectionResults",
    "ElectionSummary",
    "AdminLoginRequest",
    "AdminLoginResponse",
    "AdminVerifyResponse",
    "PasswordHashResponse",
]