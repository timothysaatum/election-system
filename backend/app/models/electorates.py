"""
Election System Models — SQLAlchemy ORM (PostgreSQL + FastAPI)

Key design decisions:
─────────────────────
1. ANONYMIZATION
   Vote has NO direct electorate_id column.
   A voter is linked to their ballot only through VotingToken.
   Once the election closes, tokens can be logically decoupled from results
   so tallying is possible without revealing who voted for whom.
   Double-vote prevention relies on:
     a) VotingToken.is_used  — token marked consumed on first ballot submission
     b) UniqueConstraint(voting_token_id, portfolio_id) on Vote — DB-level guarantee

2. ELECTION SCOPING
   Portfolios, VotingTokens, and Votes all carry election_id.
   A single student registry (Electorate table) can be reused across
   multiple elections via ElectionVoterRoll without duplicating voter data.

3. STORED vs DERIVED has_voted
   has_voted / voted_at are stored directly on Electorate and ElectionVoterRoll.
   This is a deliberate simplification for a single-server offline system where
   there is always one active election at a time.  Keeping them stored avoids
   lazy-loading pitfalls and keeps CRUD code straightforward.
   They MUST be set atomically alongside VotingToken.mark_voted() in the
   vote-submission transaction.

4. SOFT DELETE
   Electorate uses is_deleted (soft-delete) so audit history is never lost.
   Hard-delete is reserved for test/seed data cleanup only.

5. AUDIT LOG
   AuditLog is append-only — never UPDATE or DELETE rows from this table.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    TIMESTAMP,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ElectionStatus(str, Enum):
    DRAFT     = "draft"
    READY     = "ready"      # Locked & ready — no further edits allowed
    OPEN      = "open"       # Polls are live
    CLOSED    = "closed"     # Voting ended; results not yet published
    PUBLISHED = "published"  # Results are public


class VoteType(str, Enum):
    ENDORSED = "endorsed"   # Standard candidate vote
    ABSTAIN  = "abstain"    # Voter deliberately skipped a portfolio


class AuditSeverity(str, Enum):
    INFO     = "INFO"
    WARNING  = "WARNING"
    CRITICAL = "CRITICAL"


# ---------------------------------------------------------------------------
# Election
# ---------------------------------------------------------------------------

class Election(Base):
    __tablename__ = "elections"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(50),
        default=ElectionStatus.DRAFT.value,
        nullable=False,
        index=True,
    )

    opens_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    closes_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # SHA-256 hash of the full election config snapshot at lock time.
    # Any post-lock tampering with portfolios/candidates will invalidate this.
    data_hash: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )

    # Election logo — stored as a relative path / CDN key; URL resolved at
    # query time.  Mirrors the same two-field pattern used on Candidate
    # (picture_url / picture_filename) so the storage layer can swap a local
    # path for a CDN URL without touching the filename reference.
    logo_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    logo_filename: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )

    # Once locked, no portfolios / candidates / voter-roll changes are allowed.
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    portfolios: Mapped[list["Portfolio"]] = relationship(
        "Portfolio", back_populates="election", cascade="all, delete-orphan"
    )
    voter_roll: Mapped[list["ElectionVoterRoll"]] = relationship(
        "ElectionVoterRoll", back_populates="election", cascade="all, delete-orphan"
    )
    voting_tokens: Mapped[list["VotingToken"]] = relationship(
        "VotingToken", back_populates="election", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="election"
    )

    # ------------------------------------------------------------------
    # Business logic helpers
    # ------------------------------------------------------------------

    @property
    def is_open(self) -> bool:
        return self.status == ElectionStatus.OPEN.value

    @property
    def is_editable(self) -> bool:
        """True only when the election is still a draft and not yet locked."""
        return not self.is_locked and self.status == ElectionStatus.DRAFT.value

    @property
    def is_closed(self) -> bool:
        return self.status in (
            ElectionStatus.CLOSED.value,
            ElectionStatus.PUBLISHED.value,
        )


# ---------------------------------------------------------------------------
# Electorate (Voter registry)
# ---------------------------------------------------------------------------

class Electorate(Base):
    """
    A registered voter (student) in the university's student registry.

    Deliberately decoupled from Vote to preserve ballot anonymity.
    The only link between a voter and their ballot exists through VotingToken.

    has_voted / voted_at are stored columns (see module docstring §3).
    They must be updated atomically with VotingToken.mark_voted() inside
    the same vote-submission transaction.
    """
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    program: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    year_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )

    # Hashed with Argon2id via hash_password() — used for voter identity
    # verification at the EC station before a token is issued.
    # Nullable: not all deployments require a PIN.
    voting_pin_hash: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )

    # Stored voted status — see module docstring §3.
    # MUST be set atomically with VotingToken.mark_voted() in the same
    # vote-submission transaction.  Never update this field on its own.
    has_voted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    voted_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    election_enrollments: Mapped[list["ElectionVoterRoll"]] = relationship(
        "ElectionVoterRoll", back_populates="electorate", cascade="all, delete-orphan"
    )
    voting_tokens: Mapped[list["VotingToken"]] = relationship(
        "VotingToken", back_populates="electorate", cascade="all, delete-orphan"
    )
    voting_sessions: Mapped[list["VotingSession"]] = relationship(
        "VotingSession", back_populates="electorate", cascade="all, delete-orphan"
    )

    # ------------------------------------------------------------------
    # Helpers (election-scoped)
    # ------------------------------------------------------------------

    def get_active_token(self, election_id: uuid.UUID) -> Optional["VotingToken"]:
        """Return the active, non-expired token for a given election, or None."""
        tokens = self.__dict__.get("voting_tokens")
        if not tokens:
            return None
        now = datetime.now(timezone.utc)
        for token in tokens:
            if str(token.election_id) != str(election_id):
                continue
            if token.revoked or not token.is_active:
                continue
            expires_at = token.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > now:
                return token
        return None

    def get_enrollment(self, election_id: uuid.UUID) -> Optional["ElectionVoterRoll"]:
        """Return this voter's ElectionVoterRoll entry for a given election."""
        enrollments = self.__dict__.get("election_enrollments") or []
        for e in enrollments:
            if str(e.election_id) == str(election_id):
                return e
        return None

    def is_eligible(self, election_id: uuid.UUID) -> bool:
        """True if the voter is on the roll for this election."""
        return self.get_enrollment(election_id) is not None

    def mark_voted(self):
        """
        Mark the voter as having voted.
        Call this inside the same transaction as VotingToken.mark_voted().
        """
        self.has_voted = True
        self.voted_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# ElectionVoterRoll  (junction — voters scoped per election)
# ---------------------------------------------------------------------------

class ElectionVoterRoll(Base):
    """
    Many-to-many between Election and Electorate.

    A student must appear in an election's voter roll to be eligible to vote.
    This allows the same student registry to be reused across multiple elections
    with different eligibility criteria each time.

    has_voted / voted_at here mirror the global flag on Electorate but are
    scoped per election.  This makes multi-election reporting accurate even
    if the same student votes in different elections.
    """
    __tablename__ = "election_voter_roll"
    __table_args__ = (
        UniqueConstraint(
            "election_id", "electorate_id", name="uq_voter_roll_entry"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    election_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Per-election voted status
    has_voted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    voted_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    added_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    added_by: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True  # Admin username who imported this row
    )

    # Relationships
    election: Mapped["Election"] = relationship(
        "Election", back_populates="voter_roll"
    )
    electorate: Mapped["Electorate"] = relationship(
        "Electorate", back_populates="election_enrollments"
    )

    def mark_voted(self):
        """Mark this enrollment as voted.  Call alongside Electorate.mark_voted()."""
        self.has_voted = True
        self.voted_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# VotingToken
# ---------------------------------------------------------------------------

class VotingToken(Base):
    """
    A one-time 4-character token issued to a verified voter by an EC Official.

    Lifecycle:
      ACTIVE  →  electorate presents token + student_id at a voting station
      USED    →  ballot submitted successfully (is_used=True, is_active=False)
      REVOKED →  manually revoked OR auto-revoked after max_failures bad attempts

    Security layers:
      1. Token is hashed (SHA-256) at rest — plaintext never stored in the DB.
      2. Student ID is required as a second factor at the verify endpoint.
      3. failure_count triggers auto-revoke after TOKEN_MAX_FAILURES bad attempts.
      4. UniqueConstraint(election_id, electorate_id) — one token per voter per election.
    """
    __tablename__ = "voting_tokens"
    __table_args__ = (
        UniqueConstraint(
            "election_id", "electorate_id", name="uq_token_per_election_voter"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    election_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("elections.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(64),        # SHA-256 hex digest is exactly 64 chars
        nullable=False,
        unique=True,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # Number of consecutive failed verification attempts.
    # Resets to 0 on a successful authentication.
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # How many times the token was successfully used to authenticate.
    # For a single-use token this should never exceed 1.
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    revoked_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    election: Mapped["Election"] = relationship(
        "Election", back_populates="voting_tokens"
    )
    electorate: Mapped["Electorate"] = relationship(
        "Electorate", back_populates="voting_tokens"
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", back_populates="voting_token"
    )

    # ------------------------------------------------------------------
    # Business logic helpers
    # ------------------------------------------------------------------

    @property
    def is_valid(self) -> bool:
        """True if the token can still be used to authenticate."""
        now = datetime.now(timezone.utc)
        expires = self.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return (
            self.is_active
            and not self.revoked
            and not self.is_used
            and expires > now
        )

    def increment_failure(self, max_failures: int = 5) -> bool:
        """
        Increment the failure counter.
        Returns True if the token was auto-revoked (limit reached).
        """
        self.failure_count += 1
        if self.failure_count >= max_failures:
            self.revoked = True
            self.revoked_at = datetime.now(timezone.utc)
            self.revoked_reason = f"Auto-revoked after {max_failures} failed attempts"
            self.is_active = False
            return True
        return False

    def record_use(self):
        """Record a successful authentication (token presented at a voting station)."""
        self.failure_count = 0
        self.usage_count += 1
        self.last_used_at = datetime.now(timezone.utc)

    def mark_voted(self):
        """
        Consume the token after a successful ballot submission.
        MUST be called in the same transaction as Electorate.mark_voted()
        and ElectionVoterRoll.mark_voted().
        """
        self.is_used = True
        self.is_active = False
        self.used_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# VotingSession
# ---------------------------------------------------------------------------

class VotingSession(Base):
    """
    Tracks a voter's active session at a terminal — from token entry to
    vote submission.

    Linked to Electorate for audit purposes.
    Vote itself is NOT linked to Electorate (anonymization — see module §1).
    """
    __tablename__ = "voting_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    electorate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    election_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("elections.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    voting_token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voting_tokens.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # JWT session token issued to the voting station for the duration of this session
    session_token: Mapped[str] = mapped_column(
        String(1550), nullable=False, unique=True, index=True
    )

    # Identifies which terminal this session belongs to (IP or station name)
    station_identifier: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(
        String(45), nullable=True, index=True
    )
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    login_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    vote_submitted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    last_activity_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    terminated_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    termination_reason: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    suspicious_activity: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    activity_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    electorate: Mapped["Electorate"] = relationship(
        "Electorate", back_populates="voting_sessions"
    )

    # ------------------------------------------------------------------
    # Business logic helpers
    # ------------------------------------------------------------------

    def update_activity(self, ip_address: str):
        self.last_activity_at = datetime.now(timezone.utc)
        self.activity_count += 1
        self.ip_address = ip_address

    def terminate(self, reason: str = "logout"):
        self.is_valid = False
        self.terminated_at = datetime.now(timezone.utc)
        self.termination_reason = reason

    def mark_submitted(self):
        """Call after all votes are committed.  Terminates the session."""
        self.vote_submitted = True
        self.terminate(reason="vote_submitted")

    @property
    def is_expired(self) -> bool:
        now = datetime.now(timezone.utc)
        expires = self.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires < now


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

class Portfolio(Base):
    """
    A position being contested in an election (e.g. President, Treasurer).
    Scoped to a specific election via election_id.
    """
    __tablename__ = "portfolios"
    __table_args__ = (
        # Same portfolio name cannot appear twice in the same election
        UniqueConstraint("election_id", "name", name="uq_portfolio_per_election"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    election_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("elections.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_candidates: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    voting_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    election: Mapped["Election"] = relationship(
        "Election", back_populates="portfolios"
    )
    candidates: Mapped[list["Candidate"]] = relationship(
        "Candidate", back_populates="portfolio", cascade="all, delete-orphan"
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", back_populates="portfolio"
    )


# ---------------------------------------------------------------------------
# Candidate
# ---------------------------------------------------------------------------

class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    picture_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    picture_filename: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    manifesto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    portfolio: Mapped["Portfolio"] = relationship(
        "Portfolio", back_populates="candidates"
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote", back_populates="candidate"
    )


# ---------------------------------------------------------------------------
# Vote — ANONYMIZED
# ---------------------------------------------------------------------------

class Vote(Base):
    """
    An individual ballot choice for one portfolio in one election.

    ANONYMITY DESIGN
    ────────────────
    Vote is linked to VotingToken (NOT directly to Electorate/student).
    VotingToken links back to Electorate, but that link is one step removed.
    Once the election is closed, tokens can be logically decoupled from results:
    tallying is possible (via vote counts per candidate) without ever revealing
    who voted for whom.

    DOUBLE-VOTE PREVENTION (two independent layers)
    ────────────────────────────────────────────────
    Layer 1 — Application:  VotingToken.is_used is checked before accepting
              any ballot.  If True, the request is rejected immediately.
    Layer 2 — Database:     UniqueConstraint(voting_token_id, portfolio_id)
              means the DB will reject a duplicate even if Layer 1 is bypassed
              (e.g. concurrent requests).  The CRUD must handle IntegrityError.

    Do NOT add electorate_id to this model.
    """
    __tablename__ = "votes"
    __table_args__ = (
        # Core integrity constraint: one vote per token per portfolio
        UniqueConstraint(
            "voting_token_id",
            "portfolio_id",
            name="uq_vote_token_portfolio",
        ),
        Index("ix_votes_portfolio_valid",  "portfolio_id", "is_valid"),
        Index("ix_votes_candidate_valid",  "candidate_id", "is_valid"),
        Index("ix_votes_election",         "election_id"),
        Index("ix_votes_token",            "voting_token_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    election_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("elections.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolios.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Anonymized voter link — identity is one hop away via the token
    voting_token_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voting_tokens.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    voting_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("voting_sessions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    vote_type: Mapped[str] = mapped_column(
        String(50),
        default=VoteType.ENDORSED.value,
        nullable=False,
        index=True,
    )

    # Terminal metadata for audit — identifies the station, not the voter
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    user_agent: Mapped[str] = mapped_column(Text, nullable=False)

    voted_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    is_valid: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    election: Mapped["Election"] = relationship("Election")
    portfolio: Mapped["Portfolio"] = relationship(
        "Portfolio", back_populates="votes"
    )
    candidate: Mapped["Candidate"] = relationship(
        "Candidate", back_populates="votes"
    )
    voting_token: Mapped["VotingToken"] = relationship(
        "VotingToken", back_populates="votes"
    )
    voting_session: Mapped[Optional["VotingSession"]] = relationship(
        "VotingSession"
    )


# ---------------------------------------------------------------------------
# AuditLog — append-only, never UPDATE or DELETE
# ---------------------------------------------------------------------------

class AuditLog(Base):
    """
    Tamper-evident, append-only audit trail.

    Every security-sensitive action must write a row here.
    NEVER issue UPDATE or DELETE against this table.
    The only permitted DML is INSERT.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_event_type", "event_type"),
        Index("ix_audit_actor",      "actor_id"),
        Index("ix_audit_created",    "created_at"),
        Index("ix_audit_election",   "election_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, index=True
    )
    election_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("elections.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    severity: Mapped[str] = mapped_column(
        String(20), default=AuditSeverity.INFO.value, nullable=False
    )
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    election: Mapped[Optional["Election"]] = relationship(
        "Election", back_populates="audit_logs"
    )