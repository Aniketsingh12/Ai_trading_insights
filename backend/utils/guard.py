"""
Access guards for public deployments.

Both are OFF by default so local development is frictionless. Enable them via
env vars when the API is exposed on the internet, otherwise anyone who finds the
URL can drain your LLM quota and third-party data keys.

  API_ACCESS_KEY   — if set, requests must send  X-API-Key: <value>
  RATE_LIMIT_PER_MIN — if > 0, per-client cap on the expensive endpoints
"""
from __future__ import annotations

import time
from collections import deque

from fastapi import Header, HTTPException, Request

from config import settings

# client-id -> timestamps of recent hits
_hits: dict[str, deque[float]] = {}
_MAX_CLIENTS = 1000


async def require_key(x_api_key: str | None = Header(default=None)) -> None:
    """No-op unless API_ACCESS_KEY is configured."""
    expected = settings.api_access_key
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(401, "Invalid or missing X-API-Key")


async def rate_limit(request: Request) -> None:
    """Sliding-window limiter for costly routes (LLM + heavy data fan-out)."""
    limit = settings.rate_limit_per_min
    if limit <= 0:
        return
    client = request.client.host if request.client else "unknown"
    now = time.time()

    if len(_hits) > _MAX_CLIENTS:  # keep the map bounded
        _hits.clear()

    window = _hits.setdefault(client, deque())
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(429, "Rate limit exceeded — try again in a minute")
    window.append(now)
