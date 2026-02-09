"""
Offline Security Audit Logger
Simplified logging for offline voting system
"""

from datetime import datetime, timezone
import json
import logging

logger = logging.getLogger("security_audit")


class SecurityAuditLogger:
    """Security audit logging for offline election system"""

    @staticmethod
    def log_security_event(
        event_type: str,
        user_id: str = None,
        ip_address: str = None,
        details: dict = None,
        severity: str = "INFO",
    ):
        """
        Log security events with structured data
        
        Args:
            event_type: Type of security event
            user_id: User or electorate ID
            ip_address: IP address (usually localhost for offline)
            details: Additional event details
            severity: Log severity level
        """
        
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "ip_address": ip_address or "127.0.0.1",
            "details": details or {},
            "severity": severity,
        }

        # Log based on severity
        if severity == "ERROR":
            logger.error(json.dumps(log_entry))
        elif severity == "WARNING":
            logger.warning(json.dumps(log_entry))
        else:
            logger.info(json.dumps(log_entry))

    @staticmethod
    def log_voting_attempt(
        electorate_id: str,
        success: bool,
        reason: str = None,
    ):
        """
        Log voting attempt
        
        Args:
            electorate_id: Electorate ID
            success: Whether voting was successful
            reason: Reason for failure (if applicable)
        """
        SecurityAuditLogger.log_security_event(
            event_type="voting_attempt",
            user_id=electorate_id,
            details={"success": success, "reason": reason},
            severity="WARNING" if not success else "INFO",
        )

    @staticmethod
    def log_session_creation(
        electorate_id: str,
        session_duration: int,
    ):
        """
        Log voting session creation
        
        Args:
            electorate_id: Electorate ID
            session_duration: Session duration in minutes
        """
        SecurityAuditLogger.log_security_event(
            event_type="session_created",
            user_id=electorate_id,
            details={"session_duration_minutes": session_duration},
            severity="INFO",
        )

    @staticmethod
    def log_token_generation(
        admin_username: str,
        token_count: int,
        electorate_ids: list = None,
    ):
        """
        Log token generation activity
        
        Args:
            admin_username: Admin who generated tokens
            token_count: Number of tokens generated
            electorate_ids: List of electorate IDs (optional)
        """
        SecurityAuditLogger.log_security_event(
            event_type="token_generation",
            user_id=admin_username,
            details={
                "token_count": token_count,
                "electorate_count": len(electorate_ids) if electorate_ids else 0,
            },
            severity="INFO",
        )

    @staticmethod
    def log_admin_action(
        admin_username: str,
        action: str,
        resource: str,
        details: dict = None,
    ):
        """
        Log admin actions
        
        Args:
            admin_username: Admin username
            action: Action performed
            resource: Resource affected
            details: Additional details
        """
        SecurityAuditLogger.log_security_event(
            event_type="admin_action",
            user_id=admin_username,
            details={
                "action": action,
                "resource": resource,
                **(details or {})
            },
            severity="INFO",
        )


__all__ = ["SecurityAuditLogger"]