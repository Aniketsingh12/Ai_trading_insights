"""In-memory + optional Redis cache. Falls back gracefully if Redis is unavailable."""
from __future__ import annotations

import json
import time
from typing import Any

try:
    import redis.asyncio as redis_async
except ImportError:
    redis_async = None  # type: ignore

from config import settings

_mem: dict[str, tuple[float, Any]] = {}
_redis = None


async def _get_redis():
    global _redis
    if _redis is not None or redis_async is None:
        return _redis
    try:
        client = redis_async.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        _redis = client
    except Exception:
        _redis = False  # mark as unavailable
    return _redis if _redis else None


async def cache_get(key: str) -> Any | None:
    r = await _get_redis()
    if r:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    entry = _mem.get(key)
    if not entry:
        return None
    expires, value = entry
    if expires < time.time():
        _mem.pop(key, None)
        return None
    return value


async def cache_set(key: str, value: Any, ttl: int = 60) -> None:
    r = await _get_redis()
    if r:
        await r.set(key, json.dumps(value), ex=ttl)
        return
    _mem[key] = (time.time() + ttl, value)
