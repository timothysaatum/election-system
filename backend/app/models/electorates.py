from sqlalchemy import (
    String,
    Integer,
    Boolean,
    TIMESTAMP,
    func,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from datetime import datetime, timezone
import uuid
from typing import Optional


class Electorate(Base):
    __tablename__ = "students"
    __table_args__ = ({"sqlite_autoincrement": True},)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    program: Mapped[str] = mapped_column(String(100), nullable=True)
    year_level: Mapped[int] = mapped_column(Integer, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    voting_pin_hash: Mapped[str] = mapped_column(String(1550), nullable=False)
    has_voted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    voted_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    
    # Relationships
    voting_tokens: Mapped[list["VotingToken"]] = relationship(
        "VotingToken", 
        back_populates="electorate",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", 
        back_populates="electorate", 
        cascade="all, delete-orphan",
        passive_deletes=True # vital for high-performance DB-side deletion
    )
    voting_sessions: Mapped[list["VotingSession"]] = relationship(
        "VotingSession",
        back_populates="electorate",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


    @property
    def voting_token(self) -> Optional[str]:
        # Avoid triggering lazy-load / IO when accessed by pydantic outside async context
        tokens = self.__dict__.get("voting_tokens")
        if tokens is None:
            return None

        # Get current time (timezone-aware)
        now = datetime.now(timezone.utc)

        try:
            active_tokens = []
            for token in tokens:
                # Skip revoked or inactive tokens
                if token.revoked or not token.is_active:
                    continue

                # Handle timezone comparison safely
                expires_at = token.expires_at

                # If expires_at is timezone-naive, make it timezone-aware (assume UTC)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)

                # Compare
                if expires_at > now:
                    active_tokens.append(token)

            return "GENERATED" if active_tokens else None

        except Exception as e:
            # Log the error but don't break the API
            print(f"Error checking voting token for {self.student_id}: {e}")
            return None
    
    @property
    def get_token_hash(self):
        """Get the most recent active voting token hash for this electorate"""
        tokens = self.__dict__.get("voting_tokens")
        if not tokens:
            return None

        now = datetime.now(timezone.utc)
        active_tokens = []

        for token in tokens:
            if token.revoked or not token.is_active:
                continue

            expires_at = token.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if expires_at > now:
                active_tokens.append(token)

        if active_tokens:
            return active_tokens[-1].token_hash

        return None

    @property
    def has_token(self) -> bool:
        """Check if the electorate has any active voting tokens"""
        # Avoid calling voting_token which may trigger IO; use __dict__ check
        if self.__dict__.get("voting_tokens") is None:
            return False
        return self.voting_token is not None


class VotingToken(Base):
    __tablename__ = "voting_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    token_hash: Mapped[str] = mapped_column(
        String(1550), nullable=False, unique=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    revoked_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    electorate: Mapped["Electorate"] = relationship(
        "Electorate", back_populates="voting_tokens"
    )
    
    @property
    def update_usage_count(self):
        self.usage_count += 1
        

class VotingSession(Base):
    __tablename__ = "voting_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )

    session_token: Mapped[str] = mapped_column(
        String(1550), nullable=False, unique=True, index=True
    )
    device_fingerprint: Mapped[str] = mapped_column(
        String(1550), nullable=False, index=True
    )
    user_agent: Mapped[str] = mapped_column(Text, nullable=True)
    user_agent_hash: Mapped[str] = mapped_column(String(1550), nullable=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True, index=True)
    login_method: Mapped[str] = mapped_column(String(50), nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    terminated_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    termination_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suspicious_activity: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    activity_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    electorate: Mapped["Electorate"] = relationship(
        "Electorate", back_populates="voting_sessions"
    )

    def update_activity(self, current_ip: str):
        """Update session activity and IP address"""
        self.last_activity_at = datetime.now(timezone.utc)
        self.activity_count += 1
        self.ip_address = current_ip

    def terminate(self, reason: str = "logout"):
        """Terminate the session"""
        self.is_valid = False
        self.terminated_at = datetime.now(timezone.utc)
        self.termination_reason = reason


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_candidates: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    voting_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    candidates: Mapped[list["Candidate"]] = relationship(
        "Candidate", back_populates="portfolio", cascade="all, delete-orphan"
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", back_populates="portfolio", cascade="all, delete-orphan"
    )


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolios.id"), 
        nullable=False, 
        index=True
    )
    picture_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    picture_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manifesto: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    portfolio: Mapped["Portfolio"] = relationship(
        "Portfolio", 
        back_populates="candidates",
        lazy="selectin"
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", back_populates="candidate", cascade="all, delete-orphan"
    )


class Vote(Base):
    __tablename__ = "votes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolios.id"), nullable=False, index=True
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id"), nullable=False, index=True
    )
    voting_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voting_sessions.id"), nullable=True, index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    user_agent: Mapped[str] = mapped_column(Text, nullable=False)
    voted_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    electorate: Mapped["Electorate"] = relationship(
        "Electorate", 
        back_populates="votes"
    )
    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="votes")
    candidate: Mapped["Candidate"] = relationship("Candidate", back_populates="votes")
    voting_session: Mapped[Optional["VotingSession"]] = relationship("VotingSession")