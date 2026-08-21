"""
Demo guards.

The app is a public portfolio piece, so the properties under test are:
strangers CAN run the AI features, one stranger cannot drain the account, the
total is capped no matter how many strangers turn up, and the owner is never
locked out of their own demo.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from config import DEEP_RESEARCH_COST, settings
from main import app
from utils import guard

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_guards():
    """Guards keep process-wide state; each test needs a clean slate."""
    for store in (guard._hits, guard._visitors):
        store.clear()
    guard._global.update(day="", used=0)
    yield
    for store in (guard._hits, guard._visitors):
        store.clear()
    guard._global.update(day="", used=0)


def spend(cost=1, ip="1.2.3.4", key=None):
    """Invoke the budget dependency the way FastAPI would."""
    class FakeReq:
        headers = {"x-forwarded-for": ip}
        client = None
    return asyncio.run(guard.llm_budget(cost)(request=FakeReq(), x_api_key=key))


# ─────────────────────────── the demo promise ───────────────────────────
def test_anonymous_visitors_can_use_the_ai_features(monkeypatch):
    """The whole point of a portfolio demo — no passcode wall on the showpiece."""
    monkeypatch.setattr(settings, "api_access_key", "ownerpass")
    monkeypatch.setattr(settings, "visitor_llm_limit", 5)
    monkeypatch.setattr(settings, "daily_llm_limit", 100)

    r = client.post("/api/analyze/deep/AAPL")
    assert r.status_code != 401, "a visitor must never be asked for a passcode"
    assert r.status_code == 200


def test_free_routes_are_never_metered(monkeypatch):
    monkeypatch.setattr(settings, "visitor_llm_limit", 1)
    monkeypatch.setattr(settings, "daily_llm_limit", 1)
    for path in ("/api/health", "/api/watchlist", "/api/portfolio"):
        for _ in range(5):
            assert client.get(path).status_code == 200, path


# ─────────────────────────── per-visitor quota ───────────────────────────
def test_one_visitor_cannot_drain_the_account(monkeypatch):
    monkeypatch.setattr(settings, "api_access_key", "")
    monkeypatch.setattr(settings, "visitor_llm_limit", 3)
    monkeypatch.setattr(settings, "daily_llm_limit", 1000)

    for _ in range(3):
        spend(1, ip="9.9.9.9")
    with pytest.raises(guard.BudgetExhausted) as exc:
        spend(1, ip="9.9.9.9")
    assert exc.value.scope == "visitor"


def test_visitors_are_metered_separately(monkeypatch):
    """One person exhausting their quota must not shut out the next visitor."""
    monkeypatch.setattr(settings, "visitor_llm_limit", 2)
    monkeypatch.setattr(settings, "daily_llm_limit", 1000)

    spend(2, ip="1.1.1.1")
    with pytest.raises(guard.BudgetExhausted):
        spend(1, ip="1.1.1.1")
    spend(1, ip="2.2.2.2")   # a different visitor is unaffected


def test_visitor_identity_uses_forwarded_header(monkeypatch):
    """
    On Railway every request arrives from the same proxy address, so reading
    request.client directly would put the entire internet in one bucket.
    """
    class FakeReq:
        headers = {"x-forwarded-for": "203.0.113.7, 10.0.0.1"}
        client = None

    assert guard.client_ip(FakeReq()) == "203.0.113.7"


def test_refused_call_is_not_charged(monkeypatch):
    """A rejection must not consume the allowance it was rejected against."""
    monkeypatch.setattr(settings, "visitor_llm_limit", 5)
    monkeypatch.setattr(settings, "daily_llm_limit", 2)

    spend(2, ip="4.4.4.4")                       # global now exhausted
    with pytest.raises(guard.BudgetExhausted):
        spend(1, ip="4.4.4.4")
    # The visitor spent 2, not 3 — the refused call left no mark.
    assert guard._visitors["4.4.4.4"]["used"] == 2


# ─────────────────────────── global ceiling ───────────────────────────
def test_global_cap_bounds_the_bill_across_all_visitors(monkeypatch):
    """
    The visitor quota keys off a spoofable header, so it is fairness, not
    security. This is the layer that actually bounds spend.
    """
    monkeypatch.setattr(settings, "visitor_llm_limit", 10)
    monkeypatch.setattr(settings, "daily_llm_limit", 4)

    spend(2, ip="1.1.1.1")
    spend(2, ip="2.2.2.2")
    with pytest.raises(guard.BudgetExhausted) as exc:
        spend(1, ip="3.3.3.3")           # a brand-new "visitor" is still refused
    assert exc.value.scope == "global"


def test_deep_research_draws_its_true_cost(monkeypatch):
    """One run is five model calls, so it must not draw a single unit."""
    monkeypatch.setattr(settings, "visitor_llm_limit", 0)
    monkeypatch.setattr(settings, "daily_llm_limit", 10)
    spend(DEEP_RESEARCH_COST)
    assert guard._global["used"] == DEEP_RESEARCH_COST


def test_deep_research_cost_tracks_the_actual_crew_size():
    """
    The cost constant is a hand-maintained mirror of how many model calls a run
    makes. Add a sixth agent without updating it and every run silently
    under-charges the budget, so pin the two together here.
    """
    from agents.crew import AGENT_NAMES

    assert DEEP_RESEARCH_COST == len(AGENT_NAMES), (
        f"The crew now has {len(AGENT_NAMES)} agents but DEEP_RESEARCH_COST is "
        f"{DEEP_RESEARCH_COST} — update it in config.py."
    )


def test_an_allowance_below_one_run_is_flagged(monkeypatch, caplog):
    """
    Setting VISITOR_LLM_LIMIT=3 makes deep research permanently unreachable —
    no error, just a button that always refuses. That must be loud at startup.
    """
    import logging

    import config as config_mod

    monkeypatch.setattr(settings, "visitor_llm_limit", DEEP_RESEARCH_COST - 1)
    monkeypatch.setattr(settings, "daily_llm_limit", 0)
    with caplog.at_level(logging.WARNING, logger="marketmind.config"):
        config_mod._warn_about_unreachable_features()
    assert "VISITOR_LLM_LIMIT" in caplog.text
    assert "deep-research" in caplog.text


def test_a_sufficient_allowance_is_not_flagged(monkeypatch, caplog):
    import logging

    import config as config_mod

    monkeypatch.setattr(settings, "visitor_llm_limit", DEEP_RESEARCH_COST)
    monkeypatch.setattr(settings, "daily_llm_limit", 40)
    with caplog.at_level(logging.WARNING, logger="marketmind.config"):
        config_mod._warn_about_unreachable_features()
    assert caplog.text == ""


def test_budget_rolls_over_to_a_new_day(monkeypatch):
    monkeypatch.setattr(settings, "daily_llm_limit", 2)
    guard._global.update(day="1999-01-01", used=2)   # yesterday, exhausted
    spend(1)                                          # must not raise
    assert guard._global["used"] == 1


# ─────────────────────────── owner ───────────────────────────
def test_owner_is_never_metered(monkeypatch):
    monkeypatch.setattr(settings, "api_access_key", "ownerpass")
    monkeypatch.setattr(settings, "visitor_llm_limit", 1)
    monkeypatch.setattr(settings, "daily_llm_limit", 1)

    for _ in range(20):
        spend(5, ip="1.1.1.1", key="ownerpass")
    assert guard._global["used"] == 0

    # Owner traffic left no mark, so a visitor from the same address still has
    # their full allowance — and is still cut off once it runs out.
    spend(1, ip="1.1.1.1")
    with pytest.raises(guard.BudgetExhausted):
        spend(1, ip="1.1.1.1")


def test_owner_check_needs_a_configured_passcode():
    """With no passcode set, nobody is 'the owner' — limits apply to all."""
    assert guard.is_owner(None) is False
    assert guard.is_owner("anything") is False


def test_wrong_passcode_is_not_the_owner(monkeypatch):
    monkeypatch.setattr(settings, "api_access_key", "ownerpass")
    assert guard.is_owner("ownerpass") is True
    assert guard.is_owner("wrong") is False
    assert guard.is_owner(None) is False


def test_health_reports_allowance_without_leaking_the_passcode(monkeypatch):
    monkeypatch.setattr(settings, "api_access_key", "ownerpass")
    monkeypatch.setattr(settings, "visitor_llm_limit", 6)
    monkeypatch.setattr(settings, "daily_llm_limit", 40)

    body = client.get("/api/health").json()
    assert body["budget"]["owner"] is False
    assert body["budget"]["visitor"]["remaining"] == 6
    assert "ownerpass" not in str(body)


# ─────────────────────────── graceful degradation ───────────────────────────
def test_deep_research_falls_back_to_a_saved_run(monkeypatch):
    """
    A demo that answers "come back tomorrow" shows a visitor nothing, so once
    the budget is gone the endpoint returns a real earlier report instead.
    """
    from services import research_service

    monkeypatch.setattr(settings, "api_access_key", "")
    monkeypatch.setattr(settings, "visitor_llm_limit", 0)
    monkeypatch.setattr(settings, "daily_llm_limit", 1)   # deep costs 5 — always refused

    research_service._JOBS.clear()
    job = research_service.create_job("AAPL")
    job.update(status="done", report="EXECUTIVE SUMMARY\nAn earlier run.", verdict="BUY")

    r = client.post("/api/analyze/deep/AAPL")
    assert r.status_code == 200
    body = r.json()
    assert body["sample"] is True
    assert body["report_id"] == job["id"]
    assert "budget" in body["sample_reason"].lower() or "spent" in body["sample_reason"].lower()


def test_deep_research_refuses_when_nothing_is_cached(monkeypatch):
    """With no earlier run to show, a clear 429 beats inventing something."""
    from services import research_service

    monkeypatch.setattr(settings, "visitor_llm_limit", 0)
    monkeypatch.setattr(settings, "daily_llm_limit", 1)
    research_service._JOBS.clear()

    r = client.post("/api/analyze/deep/AAPL")
    assert r.status_code == 429


# ─────────────────────────── rate limiting ───────────────────────────
def test_rate_limit_is_off_by_default(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    for _ in range(30):
        assert client.get("/api/health").status_code == 200


def test_report_polling_is_not_rate_limited(monkeypatch):
    """
    Regression: the frontend polls this every 1.5s (40/min). With the limiter on
    a router-level dependency and the documented limit of 20, deep research died
    ~30s in. The poll reads a dict and spends nothing, so it must stay open.
    """
    monkeypatch.setattr(settings, "rate_limit_per_min", 5)
    codes = [client.get("/api/analyze/report/does-not-exist").status_code for _ in range(40)]
    assert 429 not in codes
    assert set(codes) == {404}
