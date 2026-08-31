"""
Access guards for a public demo.

The app is a portfolio piece: strangers must be able to actually run the AI
features, or the best part of it is invisible. So this is not a lock — it is a
metered free trial with a hard ceiling on what it can ever cost.

  VISITOR_LLM_LIMIT   what one anonymous visitor gets per day. Generous enough
                      to try everything once; small enough that a bad actor
                      can't drain the account from a single address.
  DAILY_LLM_LIMIT     the ceiling across all visitors. This is the layer that
                      actually bounds the bill, and the only one that cannot be
                      side-stepped: visitor quota keys off a client IP, which is
                      spoofable, so it is a fairness mechanism, not a security
                      boundary. The global cap is the security boundary.
  API_ACCESS_KEY      the owner's passcode. Bypasses both, so you are never
                      locked out of your own demo by visitors.
  RATE_LIMIT_PER_MIN  per-IP burst cap. Data routes get 8x.

All are OFF by default so local development stays frictionless.
"""
from __future__ import annotations

import secrets
import time
from collections import deque
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Query, Request

from config import settings
from utils import llm, model_presets

# ─────────────────────────── identity ───────────────────────────


def is_owner(provided: str | None) -> bool:
    """True only when a passcode is configured AND the caller supplied it."""
    expected = settings.api_access_key
    if not expected:
        return False
    # Constant-time: a plain == leaks the key one character at a time to an
    # attacker who can measure response timing.
    return secrets.compare_digest(provided or "", expected)


def client_ip(request: Request) -> str:
    """
    The visitor's address, taken from the last hop we actually trust.

    Railway terminates TLS at a proxy, so `request.client.host` is the same
    proxy for every visitor — using it directly would put the whole internet in
    one shared quota bucket.

    But the *leftmost* X-Forwarded-For entry is the wrong answer too, and worse:
    a client can send its own X-Forwarded-For, and the proxy appends rather than
    replaces. So the left of the chain is attacker-controlled, and reading it
    means a new "visitor" on every request — the per-visitor quota stops
    existing. Only the entries our own proxies appended can be trusted, so we
    count TRUSTED_PROXY_HOPS back from the right.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        chain = [p.strip() for p in xff.split(",") if p.strip()]
        hops = max(1, settings.trusted_proxy_hops)
        if len(chain) >= hops:
            return chain[-hops]
        # Shorter chain than configured — trust the leftmost real entry rather
        # than index out of bounds.
        if chain:
            return chain[0]
    return request.client.host if request.client else "unknown"


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ─────────────────────────── budgets ───────────────────────────

_global = {"day": "", "used": 0}
_visitors: dict[str, dict] = {}          # ip -> {"day": str, "used": int}
_MAX_VISITORS = 5000


def _global_state() -> tuple[int, int]:
    """(used, limit) for today, rolling over at 00:00 UTC."""
    limit = settings.daily_llm_limit
    if _global["day"] != _today():
        return 0, limit
    return _global["used"], limit


def budget_status(request: Request | None = None, x_api_key: str | None = None) -> dict:
    """
    What the UI needs to show remaining runs. Contains no secrets.

    Reports the *visitor's* remaining allowance when we can identify them, since
    that is the number that actually governs whether their next click works.
    """
    used, limit = _global_state()
    out: dict = {
        "owner": is_owner(x_api_key),
        "global": {"enabled": limit > 0, "limit": limit, "used": used,
                   "remaining": max(0, limit - used) if limit > 0 else None},
    }
    v_limit = settings.visitor_llm_limit
    if out["owner"]:
        out["visitor"] = {"enabled": False, "unlimited": True}
    elif v_limit > 0 and request is not None:
        rec = _visitors.get(client_ip(request))
        v_used = rec["used"] if rec and rec["day"] == _today() else 0
        out["visitor"] = {"enabled": True, "limit": v_limit, "used": v_used,
                          "remaining": max(0, v_limit - v_used)}
    else:
        out["visitor"] = {"enabled": v_limit > 0}
    return out


class BudgetExhausted(HTTPException):
    """429 that callers can catch to fall back to a cached result."""

    def __init__(self, detail: str, scope: str):
        super().__init__(429, detail)
        self.scope = scope   # "visitor" | "global"


async def use_preset(
    request: Request,
    model: str | None = Query(default=None),
    x_api_key: str | None = Header(default=None),
):
    """
    Bind the caller's chosen model preset to this request.

    Must be declared before llm_budget on a route, because what a call costs
    depends on which preset it runs under. Yields so the context is unwound once
    the response is done rather than leaking into the next request on this task.
    """
    chosen = model or request.headers.get("x-model-preset")
    if chosen and not model_presets.allowed(chosen, is_owner(x_api_key)):
        preset = model_presets.PRESETS.get(chosen.lower().strip())
        # Say which it was rather than silently downgrading — a caller that
        # asked for premium and quietly got standard has no way to tell.
        raise HTTPException(
            403,
            f"The '{preset.label}' model is owner-only on this demo."
            if preset else f"Unknown model option '{chosen}'.",
        )

    token = llm.set_preset(chosen or None)
    try:
        yield model_presets.get(chosen)
    finally:
        llm.reset_preset(token)


def llm_budget(cost: int = 1):
    """
    Dependency factory. `cost` is how many model calls the route really makes,
    so one deep-research run (five calls) draws five units rather than one.

    The actual charge is that count times the preset's multiplier, so the free
    option draws nothing at all and premium draws several times a standard run.
    """

    async def _spend(request: Request, x_api_key: str | None = Header(default=None)) -> None:
        if is_owner(x_api_key):
            return                                    # the owner is never metered

        preset = model_presets.get(llm.current_preset())
        cost_units = cost * preset.cost_units
        if cost_units == 0:
            # Costs no money, so it meters nothing. The per-IP burst limiter is
            # what stops the free option being hammered.
            return

        # ── per-visitor allowance ──
        v_limit = settings.visitor_llm_limit
        if v_limit > 0:
            ip = client_ip(request)
            today = _today()
            if len(_visitors) > _MAX_VISITORS:        # keep the map bounded
                _visitors.clear()
            rec = _visitors.setdefault(ip, {"day": today, "used": 0})
            if rec["day"] != today:
                rec["day"], rec["used"] = today, 0
            if rec["used"] + cost_units > v_limit:
                raise BudgetExhausted(
                    f"You've used today's {v_limit} free AI runs on this demo. "
                    f"They reset at 00:00 UTC.",
                    scope="visitor",
                )

        # ── shared ceiling ──
        used, g_limit = _global_state()
        if g_limit > 0 and used + cost_units > g_limit:
            raise BudgetExhausted(
                "Today's shared AI budget for this demo is spent. It resets at 00:00 UTC.",
                scope="global",
            )

        # Only charge once both checks pass, so a refused call costs nothing.
        if v_limit > 0:
            _visitors[client_ip(request)]["used"] += cost_units
        if g_limit > 0:
            if _global["day"] != _today():
                _global["day"], _global["used"] = _today(), 0
            _global["used"] += cost_units

    return _spend


# ─────────────────────────── rate limiting ───────────────────────────
# Separate buckets per class of route: browsing the dashboard must never eat
# into the allowance for the paid endpoints.

_hits: dict[str, deque[float]] = {}
_MAX_CLIENTS = 5000


def _consume(bucket: str, request: Request, limit: int) -> None:
    if limit <= 0:
        return
    now = time.time()
    if len(_hits) > _MAX_CLIENTS:
        _hits.clear()

    window = _hits.setdefault(f"{bucket}:{client_ip(request)}", deque())
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(429, "Too many requests — try again in a minute.")
    window.append(now)


async def rate_limit(request: Request) -> None:
    """Strict bucket, for routes that spend money."""
    _consume("paid", request, settings.rate_limit_per_min)


async def rate_limit_data(request: Request) -> None:
    """
    Relaxed bucket, for the free data routes.

    These are polled by design — the dashboard refreshes every 30s and several
    panels subscribe at once — so they need far more headroom than a paid route.
    """
    limit = settings.rate_limit_per_min
    _consume("data", request, limit * 8 if limit > 0 else 0)
