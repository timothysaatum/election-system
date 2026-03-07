from sqlalchemy import (
    String,
    Integer,
    Boolean,
    TIMESTAMP,
    func,
    Text,
    ForeignKey,
    UniqueConstraint,
    JSON,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from datetime import datetime, timezone
import uuid
from typing import Optional

class Election(Base):
    __tablename__ = "elections"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Electorate(Base):
    __tablename__ = "students"
    __table_args__ = ({"sqlite_autoincrement": True},)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
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
        passive_deletes=True,
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote",
        back_populates="electorate",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    voting_sessions: Mapped[list["VotingSession"]] = relationship(
        "VotingSession",
        back_populates="electorate",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def voting_token(self) -> Optional[str]:
        """Return 'GENERATED' if this electorate has any live active token."""
        tokens = self.__dict__.get("voting_tokens")
        if tokens is None:
            return None
        now = datetime.now(timezone.utc)
        try:
            for token in tokens:
                if token.revoked or not token.is_active:
                    continue
                expires_at = token.expires_at
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if expires_at > now:
                    return "GENERATED"
            return None
        except Exception as e:
            return None

    @property
    def get_token_hash(self) -> Optional[str]:
        """Return the hash of the most recent active token, or None."""
        tokens = self.__dict__.get("voting_tokens")
        if not tokens:
            return None
        now = datetime.now(timezone.utc)
        active = []
        for token in tokens:
            if token.revoked or not token.is_active:
                continue
            expires_at = token.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > now:
                active.append(token)
        return active[-1].token_hash if active else None

    @property
    def has_token(self) -> bool:
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
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(1550), nullable=False, unique=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Counts how many times the token was *used to authenticate* (not how many votes cast)
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Counts consecutive failed verification attempts — used for auto-lockout
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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

    def increment_failure(self, max_failures: int = 5) -> bool:
        """
        Increment the failure counter.
        Returns True if the token should be auto-revoked (limit reached).
        """
        self.failure_count += 1
        if self.failure_count >= max_failures:
            self.revoked = True
            self.revoked_at = datetime.now(timezone.utc)
            self.revoked_reason = f"Auto-revoked after {max_failures} failed attempts"
            self.is_active = False
            return True
        return False

    def record_successful_use(self):
        """Reset failure counter and record usage on successful authentication."""
        self.failure_count = 0
        self.usage_count += 1
        self.last_used_at = datetime.now(timezone.utc)


class VotingSession(Base):
    __tablename__ = "voting_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Always a UUID string — never an f-string; unique is enforced at DB level
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
        self.last_activity_at = datetime.now(timezone.utc)
        self.activity_count += 1
        self.ip_address = current_ip

    def terminate(self, reason: str = "logout"):
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
        index=True,
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
        lazy="selectin",
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", back_populates="candidate", cascade="all, delete-orphan"
    )


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (
        # DB-level guarantee: one vote per electorate per portfolio.
        # This prevents double-voting even under concurrent requests —
        # the database enforces it independently of application logic.
        UniqueConstraint(
            "electorate_id",
            "portfolio_id",
            name="uq_vote_electorate_portfolio",
        ),
        # Composite index for fast per-portfolio result aggregation
        Index("ix_votes_portfolio_valid", "portfolio_id", "is_valid"),
        Index("ix_votes_electorate_valid", "electorate_id", "is_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
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
    vote_type: Mapped[str] = mapped_column(
        String(50), default="endorsed", nullable=False, index=True
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
        "Electorate", back_populates="votes"
    )
    portfolio: Mapped["Portfolio"] = relationship("Portfolio", back_populates="votes")
    candidate: Mapped["Candidate"] = relationship("Candidate", back_populates="votes")
    voting_session: Mapped[Optional["VotingSession"]] = relationship("VotingSession")


class AuditLog(Base):
    """
    Append-only audit trail.  Never update or delete rows from this table.
    Provides a tamper-evident record of all security-sensitive events.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_event_type", "event_type"),
        Index("ix_audit_actor", "actor_id"),
        Index("ix_audit_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resource_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="INFO", nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )