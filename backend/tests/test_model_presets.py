"""
Model presets.

The picker makes three promises to a visitor: the free option really is free,
the locked option really is locked, and picking one really changes which model
runs. Each is tested here, because all three fail silently otherwise.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from config import settings
from main import app
from utils import guard, llm, model_presets

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_guards():
    for store in (guard._hits, guard._visitors):
        store.clear()
    guard._global.update(day="", used=0)
    yield
    for store in (guard._hits, guard._visitors):
        store.clear()
    guard._global.update(day="", used=0)


def spend(cost=1, ip="1.2.3.4", key=None):
    class FakeReq:
        headers = {"x-forwarded-for": ip}
        client = None
    return asyncio.run(guard.llm_budget(cost)(request=FakeReq(), x_api_key=key))


# ─────────────────────────── the free promise ───────────────────────────
def test_free_preset_draws_nothing_from_any_allowance(monkeypatch):
    """
    The whole point of offering it. If free drew even one unit, a visitor would
    hit "come back tomorrow" on an option advertised as costing nothing.
    """
    monkeypatch.setattr(settings, "visitor_llm_limit", 2)
    monkeypatch.setattr(settings, "daily_llm_limit", 2)

    token = llm.set_preset("free")
    try:
        for _ in range(50):
            spend(5, ip="7.7.7.7")          # 50 deep runs, far past both limits
    finally:
        llm.reset_preset(token)

    assert guard._global["used"] == 0
    assert "7.7.7.7" not in guard._visitors


def test_paid_presets_still_meter(monkeypatch):
    monkeypatch.setattr(settings, "visitor_llm_limit", 10)
    monkeypatch.setattr(settings, "daily_llm_limit", 100)

    token = llm.set_preset("standard")
    try:
        spend(5, ip="8.8.8.8")
    finally:
        llm.reset_preset(token)
    assert guard._global["used"] == 5


def test_premium_costs_more_than_standard(monkeypatch):
    """A pricier model must draw proportionally more, or the cap under-counts."""
    monkeypatch.setattr(settings, "visitor_llm_limit", 0)
    monkeypatch.setattr(settings, "daily_llm_limit", 1000)

    for name in ("standard", "premium"):
        guard._global.update(day="", used=0)
        token = llm.set_preset(name)
        try:
            spend(5)
        finally:
            llm.reset_preset(token)
        globals().setdefault("_used", {})[name] = guard._global["used"]

    assert _used["premium"] > _used["standard"]


# ─────────────────────────── the locked promise ───────────────────────────
def test_visitor_cannot_force_the_owner_only_preset():
    r = client.get("/api/analyze/quick/AAPL", headers={"X-Model-Preset": "premium"})
    assert r.status_code == 403
    assert "owner-only" in r.json()["detail"].lower()


def test_owner_may_use_the_owner_only_preset(monkeypatch):
    monkeypatch.setattr(settings, "api_access_key", "ownerpass")
    r = client.get(
        "/api/analyze/quick/AAPL",
        headers={"X-Model-Preset": "premium", "X-API-Key": "ownerpass"},
    )
    assert r.status_code != 403


def test_unknown_preset_is_rejected_rather_than_silently_downgraded():
    """
    Falling back quietly would leave a caller believing they got a model they
    didn't. Better to say so.
    """
    r = client.get("/api/analyze/quick/AAPL", headers={"X-Model-Preset": "turbo-9000"})
    assert r.status_code == 403
    assert "unknown" in r.json()["detail"].lower()


def test_catalogue_marks_premium_locked_for_visitors_and_open_for_owner():
    visitor = {o["id"]: o for o in model_presets.listing(is_owner=False)}
    owner = {o["id"]: o for o in model_presets.listing(is_owner=True)}
    if "premium" in visitor:                       # hidden when redundant
        assert visitor["premium"]["locked"] is True
        assert owner["premium"]["locked"] is False
    assert visitor["free"]["locked"] is False


def test_endpoint_never_leaks_the_provider_key(monkeypatch):
    monkeypatch.setattr(settings, "together_api_key", "sk-should-not-appear")
    body = client.get("/api/models").text
    assert "sk-should-not-appear" not in body


# ─────────────────────────── the "it actually changes" promise ───────────────
def test_preset_selects_a_different_report_model():
    c = llm.LLMClient(provider="together")
    seen = {}
    for name in ("free", "standard", "premium"):
        token = llm.set_preset(name)
        try:
            seen[name] = c._model_for("report")
        finally:
            llm.reset_preset(token)

    assert seen["free"] != seen["standard"], "the picker would be decorative"
    assert seen["premium"] != seen["free"]


def test_no_preset_resolves_to_the_configured_models():
    """An unset preset must behave exactly as before this feature existed."""
    c = llm.LLMClient(provider="together")
    assert llm.current_preset() is None
    assert c._model_for("report") == settings.together_model_report
    assert c._model_for("quick") == settings.together_model_quick


def test_a_preset_identical_to_the_default_is_hidden(monkeypatch):
    """
    `standard` follows the deployment's own TOGETHER_MODEL_* settings, so a
    deployment configured to use the premium model everywhere makes `premium`
    the same thing. Offering it as a locked upgrade would be a lie.

    Premium runs one model across all three tiers, so redundancy needs all
    three to match — matching only the report tier still leaves premium the
    pricier option, and it should stay on offer.
    """
    premium = settings.together_model_premium
    for tier in ("quick", "agent", "report"):
        monkeypatch.setattr(settings, f"together_model_{tier}", premium)

    ids = [o["id"] for o in model_presets.listing(is_owner=True)]
    assert "premium" not in ids
    assert "standard" in ids and "free" in ids


def test_premium_stays_on_offer_when_only_the_report_tier_matches(monkeypatch):
    """The pricier option is still pricier if it upgrades the other two tiers."""
    monkeypatch.setattr(settings, "together_model_report", settings.together_model_premium)
    assert "premium" in [o["id"] for o in model_presets.listing(is_owner=True)]


def test_a_blank_setting_removes_that_option(monkeypatch):
    """Emptying the env var is how you take an option off the picker."""
    monkeypatch.setattr(settings, "together_model_free", "")
    assert "free" not in [o["id"] for o in model_presets.listing(is_owner=True)]


def test_any_model_id_is_accepted(monkeypatch):
    """
    Nothing is validated against a fixed catalogue — the point is being able to
    try a new model by editing .env alone.
    """
    monkeypatch.setattr(settings, "together_model_free", "some-vendor/brand-new-model")
    free = next(o for o in model_presets.listing(is_owner=True) if o["id"] == "free")
    assert set(free["models"].values()) == {"some-vendor/brand-new-model"}
