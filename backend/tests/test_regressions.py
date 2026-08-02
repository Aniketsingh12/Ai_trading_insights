"""Regression tests for bugs found in review."""
from __future__ import annotations

import asyncio

import pytest

from services import screener_service as ss
from utils import cache as cache_mod
from utils import llm as llmmod
from utils.markets import display_name


def _pick(ticker, score, factor_pts=20):
    return {
        "ticker": ticker,
        "price": 100.0,
        "score": score,
        "label": "BUY",
        "breakdown": [{"factor": "Trend", "points": factor_pts, "max": 30, "reason": "r"}],
        "metrics": {"risk_reward": 2.0},
    }


def test_rank_reasons_do_not_collide_on_substring_tickers(monkeypatch):
    """'V' (Visa) must not absorb the line belonging to 'NVDA'/'AVGO'."""
    picks = [_pick("V", 80), _pick("NVDA", 70), _pick("AVGO", 60)]

    async def fake(prompt, **kw):
        return (
            "#1 NVDA :: NVDA line.\n"
            "2. V :: Visa line.\n"
            "AVGO :: Broadcom line.\n"
            "OVERALL :: summary here"
        )

    monkeypatch.setattr(llmmod.llm, "complete", fake)
    reasons, summary = asyncio.run(ss._rank_reasons(picks))
    assert reasons["V"] == "Visa line."
    assert reasons["NVDA"] == "NVDA line."
    assert reasons["AVGO"] == "Broadcom line."
    assert summary == "summary here"


def test_get_indices_survives_one_failing_ticker(monkeypatch):
    """A single flaky symbol must not blank the whole dashboard."""
    from mcp_servers import market_data_mcp as m

    async def flaky(ticker):
        if ticker == "^HSI":
            raise RuntimeError("rate limited")
        return {"ticker": ticker, "price": 1.0, "change_pct": 0.5, "currency_symbol": ""}

    monkeypatch.setattr(m, "get_quote", flaky)
    out = asyncio.run(m.get_indices("global"))
    assert len(out) == 10                     # every tile still returned
    bad = [x for x in out if x.get("price") is None]
    assert len(bad) == 1 and bad[0]["ticker"] == "^HSI"


def test_daily_movers_survives_bad_watchlist_ticker(monkeypatch):
    from mcp_servers import market_data_mcp as m
    from services import daily_service as d

    async def ok_indices(region):
        return [{"ticker": "IDX", "label": "IDX", "price": 1.0, "change_pct": 1.0}]

    async def bad_quote(t):
        raise RuntimeError("bad ticker")

    monkeypatch.setattr(m, "get_indices", ok_indices)
    monkeypatch.setattr(m, "get_quote", bad_quote)
    movers = asyncio.run(d._movers(["NOPE"]))
    assert movers["gainers"]                  # report still builds


def test_cache_evicts_expired_and_caps_size(monkeypatch):
    """Expired keys must be swept — the in-memory fallback has no other eviction.

    Redis is forced off here: the module-level client binds to the first event
    loop it sees, so touching it from several asyncio.run() calls would break
    unrelated tests.
    """
    monkeypatch.setattr(cache_mod, "_redis", False)
    cache_mod._mem.clear()
    cache_mod._last_sweep[0] = 0.0

    async def fill():
        for i in range(20):
            await cache_mod.cache_set(f"old:{i}", i, ttl=-1)  # already expired
        cache_mod._last_sweep[0] = 0.0  # force the (amortized) sweep to run now
        await cache_mod.cache_set("fresh", 1, ttl=60)

    asyncio.run(fill())
    assert "fresh" in cache_mod._mem
    assert not [k for k in cache_mod._mem if k.startswith("old:")], "expired keys survived"
    cache_mod._mem.clear()


def test_cache_is_hard_capped(monkeypatch):
    """Even with everything unexpired, the store must not grow without bound."""
    monkeypatch.setattr(cache_mod, "_redis", False)
    cache_mod._mem.clear()
    cache_mod._last_sweep[0] = 0.0

    async def fill():
        for i in range(cache_mod._MEM_MAX_KEYS + 200):
            await cache_mod.cache_set(f"k:{i}", i, ttl=3600)

    asyncio.run(fill())
    assert len(cache_mod._mem) <= cache_mod._MEM_MAX_KEYS + 1
    cache_mod._mem.clear()


def test_research_jobs_are_bounded():
    from services import research_service as rs

    rs._JOBS.clear()
    for i in range(rs._MAX_JOBS + 25):
        rs.create_job(f"TCK{i}")
    assert len(rs._JOBS) <= rs._MAX_JOBS
    rs._JOBS.clear()


def test_display_name_falls_back_to_ticker():
    assert display_name("AAPL") == "Apple"
    assert display_name("RELIANCE.NS") == "Reliance Industries"
    assert display_name("UNKNOWN.XY") == "UNKNOWN.XY"


def test_score_endpoint_does_not_explain_by_default(monkeypatch):
    """Opening a ticker page must not silently spend LLM tokens."""
    called = {"n": 0}

    async def fake_compute(ticker):
        return {"ticker": ticker, "price": 1.0, "breakdown": [], "metrics": {}}

    async def fake_reason(pick):
        called["n"] += 1
        return "reason"

    monkeypatch.setattr(ss, "_compute", fake_compute)
    monkeypatch.setattr(ss, "_llm_reason", fake_reason)

    asyncio.run(ss.analyze_one("AAPL", explain=False))
    assert called["n"] == 0
    asyncio.run(ss.analyze_one("AAPL", explain=True))
    assert called["n"] == 1
