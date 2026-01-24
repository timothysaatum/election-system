# Election System - Authentication Error Analysis

## Error Summary
You're experiencing **401 Unauthorized** errors on the voting endpoint (`POST /api/voting/vote`) and refresh endpoint (`POST /api/auth/refresh`).

The error logs show:
```
[AUTH] Suspicious activity detected in session d3967760-0934-4903-913c-b5f1f0043c77
[AUTH] Invalid session - Voter: bbc4dce3-5bc9-4b3d-b2a3-4ae755668d91, Session: d3967760-0934-4903-913c-b5f1f0043c77
```

---

## Root Cause: IP Address Mismatch

The issue is in [backend/app/models/electorates.py](backend/app/models/electorates.py#L301) in the `VotingSession.update_activity()` method:

```python
def update_activity(self, current_ip: str):
    """Update session activity and IP address"""
    self.last_activity_at = datetime.now(timezone.utc)
    self.activity_count += 1

    # Check for IP changes
    if self.ip_address != current_ip:
        self.suspicious_activity = True  # ← THIS SETS THE FLAG
```

**What's happening:**
1. When a voting session is created, the initial IP address is stored
2. Later, when the voter tries to cast a vote, the current IP is checked against the stored IP
3. If they don't match (even slightly), `suspicious_activity` is set to `True`
4. This flag triggers the termination logic in [auth_middleware.py lines 461-464](backend/app/middleware/auth_middleware.py#L461-L464):

```python
if session.suspicious_activity:
    logger.error(f"[AUTH] Suspicious activity detected in session {session_id}")
    session.terminate("Suspicious activity detected")
    await db.commit()
    return None  # Session validation fails → 401 error
```

---

## Why Your IP Changed

In a Docker environment (you're using `docker-compose.yml`), the container's IP can change between requests due to:

1. **Docker networking** - Default bridge network assigns IPs dynamically
2. **Proxy/Load balancing** - If requests go through nginx or a reverse proxy, the source IP appears different
3. **NAT/Port forwarding** - IP headers may show the docker gateway instead of original client
4. **Multiple containers** - Each container might see a different IP for the same client

---

## Where the Error is Triggered

### Error Point 1: Session Validation Failure
**File:** [backend/app/middleware/auth_middleware.py](backend/app/middleware/auth_middleware.py#L375-L385)
- **Lines 375-385:** `get_current_voter()` calls `_validate_voter_session()`
- **Line 461-464:** Session with `suspicious_activity=True` returns `None`
- **Line 380-384:** Returns 401 error: `"Session expired or invalid. Please login again."`

### Error Point 2: Vote Endpoint Requires Valid Session
**File:** [backend/app/api/voting_router.py](backend/app/api/voting_router.py#L1-L50)
- The `/vote` endpoint depends on `get_current_voter` dependency
- If session validation fails (returns 401), the endpoint never executes

---

## Solutions

### Option 1: Use X-Forwarded-For Header (Recommended for Docker/Proxies)
Modify [backend/app/middleware/auth_middleware.py](backend/app/middleware/auth_middleware.py#L463-L470) to extract the real client IP:

```python
def get_client_ip(request: Request) -> str:
    """Extract real client IP, accounting for proxies"""
    # Check for proxy headers first
    if request.headers.get("x-forwarded-for"):
        return request.headers.get("x-forwarded-for").split(",")[0].strip()
    if request.headers.get("x-real-ip"):
        return request.headers.get("x-real-ip")
    # Fall back to direct connection
    return request.client.host if request.client else "unknown"
```

Then update the session IP retrieval:
```python
current_ip = get_client_ip(request)  # Instead of getattr(request.client, "host", "unknown")
```

### Option 2: Be More Lenient with IP Changes
In [backend/app/models/electorates.py](backend/app/models/electorates.py#L295-L302), log the change but don't immediately flag it as suspicious:

```python
def update_activity(self, current_ip: str):
    """Update session activity and IP address"""
    self.last_activity_at = datetime.now(timezone.utc)
    self.activity_count += 1

    # Check for IP changes and log (but don't auto-flag as suspicious)
    if self.ip_address != current_ip:
        logger.warning(f"Session {self.id}: IP changed from {self.ip_address} to {current_ip}")
        # Only flag if this is the nth change in a short period
        self.ip_address = current_ip  # Update to new IP
```

### Option 3: Disable IP Validation for Testing
Temporarily comment out the IP check in `update_activity()`:

```python
def update_activity(self, current_ip: str):
    self.last_activity_at = datetime.now(timezone.utc)
    self.activity_count += 1
    # if self.ip_address != current_ip:
    #     self.suspicious_activity = True
```

---

## Debugging Steps

1. **Check your docker-compose.yml** - Ensure nginx is passing `X-Forwarded-For` headers
2. **Add logging** - Enable debug logging to see actual IP values:
   ```python
   logger.debug(f"Stored IP: {session.ip_address}, Current IP: {current_ip}")
   ```
3. **Inspect the stored session** - Query the database to see what IP was originally stored
4. **Check nginx config** - If using nginx, verify it's configured to pass client IP:
   ```
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Real-IP $remote_addr;
   ```

---

## Related Code Files

- **Session Model:** [backend/app/models/electorates.py#L280-L305](backend/app/models/electorates.py#L280-L305)
- **Session Validation:** [backend/app/middleware/auth_middleware.py#L399-L475](backend/app/middleware/auth_middleware.py#L399-L475)
- **Error Response:** [backend/app/middleware/auth_middleware.py#L380-L384](backend/app/middleware/auth_middleware.py#L380-L384)
- **Voting Endpoint:** [backend/app/api/voting_router.py](backend/app/api/voting_router.py)
