"""
Offline Security Audit Logger
Writes to both the audit_logs DB table (durable) and structured Python logger.
The DB table is the authoritative record; the log file is a secondary backup.
"""

from datetime import datetime, timezone
from typing import Optional
import json
import logging

logger = logging.getLogger("security_audit")


class SecurityAuditLogger:
    """
    Security audit logging for offline election system.

    Every event is written to:
      1. The audit_logs table in the database (durable, queryable, append-only)
      2. The Python logger (log file / stdout backup)

    Usage:
        await SecurityAuditLogger.log(db, "token_verified", actor_id=..., success=True)
    """

    @staticmethod
    async def log(
        db,
        event_type: str,
        *,
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = "127.0.0.1",
        details: Optional[dict] = None,
        severity: str = "INFO",
        success: bool = True,
    ):
        """
        Persist an audit event to the database and log it.

        Args:
            db:            AsyncSession — the current request's DB session.
            event_type:    Short snake_case identifier, e.g. 'vote_cast', 'token_revoked'.
            actor_id:      Who triggered the event (student UUID, admin username, etc.)
            actor_role:    Role of the actor ('admin', 'ec_official', 'voter')
            resource_type: What was acted upon ('vote', 'token', 'electorate', ...)
            resource_id:   ID of the affected resource.
            ip_address:    Source IP (always 127.0.0.1 for offline).
            details:       Arbitrary JSON-serialisable dict with extra context.
            severity:      'INFO', 'WARNING', or 'ERROR'.
            success:       Whether the action succeeded.
        """
        from app.models.electorates import AuditLog

        # Write to database
        try:
            entry = AuditLog(
                event_type=event_type,
                actor_id=actor_id,
                actor_role=actor_role,
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip_address or "127.0.0.1",
                details=details or {},
                severity=severity,
                success=success,
            )
            db.add(entry)
            # Use flush (not commit) so the caller controls the transaction boundary.
            await db.flush()
        except Exception as exc:
            # Never let audit logging crash the main request
            logger.error("Failed to write audit log to DB: %s", exc)

        # Also write to Python logger as a secondary backup
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "actor_id": actor_id,
            "actor_role": actor_role,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": ip_address or "127.0.0.1",
            "details": details or {},
            "severity": severity,
            "success": success,
        }
        msg = json.dumps(log_entry)
        if severity == "ERROR":
            logger.error(msg)
        elif severity == "WARNING":
            logger.warning(msg)
        else:
            logger.info(msg)

    # ── Convenience helpers ───────────────────────────────────────────────────

    @staticmethod
    async def log_token_verified(db, electorate_id: str, success: bool, reason: str = ""):
        await SecurityAuditLogger.log(
            db,
            "token_verified",
            actor_id=electorate_id,
            actor_role="voter",
            resource_type="voting_token",
            details={"reason": reason},
            severity="INFO" if success else "WARNING",
            success=success,
        )

    @staticmethod
    async def log_token_auto_revoked(db, electorate_id: str, token_id: str, reason: str):
        await SecurityAuditLogger.log(
            db,
            "token_auto_revoked",
            actor_id=electorate_id,
            resource_type="voting_token",
            resource_id=token_id,
            details={"reason": reason},
            severity="WARNING",
            success=True,
        )

    @staticmethod
    async def log_vote_cast(db, electorate_id: str, portfolio_id: str, success: bool, reason: str = ""):
        await SecurityAuditLogger.log(
            db,
            "vote_cast",
            actor_id=electorate_id,
            actor_role="voter",
            resource_type="vote",
            resource_id=portfolio_id,
            details={"reason": reason},
            severity="INFO" if success else "WARNING",
            success=success,
        )

    @staticmethod
    async def log_admin_action(
        db,
        username: str,
        role: str,
        action: str,
        resource: str,
        resource_id: str = "",
        details: dict = None,
    ):
        await SecurityAuditLogger.log(
            db,
            "admin_action",
            actor_id=username,
            actor_role=role,
            resource_type=resource,
            resource_id=resource_id,
            details={"action": action, **(details or {})},
            severity="INFO",
            success=True,
        )

    @staticmethod
    async def log_token_generation(db, admin_username: str, token_count: int, role: str = "admin"):
        await SecurityAuditLogger.log(
            db,
            "token_generation",
            actor_id=admin_username,
            actor_role=role,
            resource_type="voting_token",
            details={"token_count": token_count},
            severity="INFO",
            success=True,
        )

    @staticmethod
    async def log_session_created(db, electorate_id: str, session_id: str, duration_minutes: int):
        await SecurityAuditLogger.log(
            db,
            "session_created",
            actor_id=electorate_id,
            actor_role="voter",
            resource_type="voting_session",
            resource_id=session_id,
            details={"duration_minutes": duration_minutes},
            severity="INFO",
            success=True,
        )

    # ── Synchronous fallback (for contexts without a DB session) ─────────────

    @staticmethod
    def log_sync(
        event_type: str,
        actor_id: str = None,
        ip_address: str = None,
        details: dict = None,
        severity: str = "INFO",
    ):
        """
        Synchronous log — only writes to Python logger.
        Use only when no DB session is available (e.g. startup/shutdown events).
        """
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "actor_id": actor_id,
            "ip_address": ip_address or "127.0.0.1",
            "details": details or {},
            "severity": severity,
        }
        msg = json.dumps(log_entry)
        if severity == "ERROR":
            logger.error(msg)
        elif severity == "WARNING":
            logger.warning(msg)
        else:
            logger.info(msg)


__all__ = ["SecurityAuditLogger"]