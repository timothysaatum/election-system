"""
Shared request utilities used across all routers.

Slightly different implementation. Some ignored X-Forwarded-For; the voting
router hardcoded "127.0.0.1" as the fallback instead of "unknown".
All routers now import extract_client_ip() from here.
"""

from fastapi import Request


def extract_client_ip(request: Request) -> str:
    """
    Extract the best available client IP from the request.

    Priority:
      1. X-Forwarded-For header (first hop — set by reverse proxies / load balancers)
      2. Direct connection address (request.client.host)
      3. "unknown" if neither is available

    This is the same logic as auth_middleware._extract_ip(); centralising it
    here allows routers to import it without depending on the auth middleware.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return getattr(request.client, "host", "unknown")
    return "unknown"


__all__ = ["extract_client_ip"]