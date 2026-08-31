"""
The provider key must never reach a client.

Several paths hand exception text to the browser. Nothing puts a key into an
exception today — that was audited — but an exception is written by whatever
raised it, so "no leak today" is not "cannot leak". These tests plant the key
inside failures deliberately and assert it never comes out the other end.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from config import settings
from main import app
from utils import redact

client = TestClient(app, raise_server_exceptions=False)

CANARY = "sk-LEAKCANARY-9f3a7c2b1d8e4f60"


@pytest.fixture(autouse=True)
def planted_key(monkeypatch):
    monkeypatch.setattr(settings, "together_api_key", CANARY)
    yield


# ─────────────────────────── the scrubber ───────────────────────────
def test_the_configured_key_is_removed_wherever_it_appears():
    for text in (
        CANARY,
        f"Connection to https://api.together.ai failed (Authorization: Bearer {CANARY})",
        f"{{'error': 'invalid key {CANARY}'}}",
        f"line1\nline2 {CANARY} trailing",
    ):
        assert CANARY not in redact.scrub(text)
        assert redact.REDACTED in redact.scrub(text)


@pytest.mark.parametrize("shaped", [
    "sk-abcdefghijklmnopqrstuvwxyz123456",
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "api_key=abcdef1234567890abcdef",
    "AIzaSyD-1234567890abcdefghijklmnopqrs",
])
def test_key_shaped_tokens_are_removed_even_when_not_in_settings(shaped):
    """A credential we never configured — a URL-embedded one, say — still goes."""
    assert redact.REDACTED in redact.scrub(f"failed: {shaped}")


def test_ordinary_error_text_survives():
    """Over-redacting would destroy the messages this is meant to keep useful."""
    msg = "openai/gpt-oss-20b used its whole 1600-token budget on reasoning"
    assert redact.scrub(msg) == msg


def test_a_short_secret_does_not_mangle_everything(monkeypatch):
    """A 3-char key would otherwise match inside ordinary words."""
    monkeypatch.setattr(settings, "api_access_key", "abc")
    assert redact.scrub("abcdef is a fine word") == "abcdef is a fine word"


# ─────────────────────── safe_detail's contract ───────────────────────
def test_deliberate_messages_pass_through_scrubbed():
    detail = redact.safe_detail(RuntimeError(f"model rejected key {CANARY}"), "fallback")
    assert CANARY not in detail
    assert "model rejected" in detail          # still diagnostic


def test_arbitrary_internal_exceptions_are_replaced_wholesale():
    """
    An unexpected exception's text is not ours to predict, so it is not shown at
    all — a KeyError repr can contain anything the code put in the dict.
    """
    detail = redact.safe_detail(KeyError(CANARY), "Analysis failed.")
    assert detail == "Analysis failed."
    assert CANARY not in detail


# ─────────────────────── the live channels ───────────────────────
def test_quick_analysis_failure_never_returns_the_key(monkeypatch):
    async def boom(ticker):
        raise RuntimeError(f"upstream refused: Bearer {CANARY}")

    monkeypatch.setattr("routers.analyze.quick_analysis", boom)
    r = client.get("/api/analyze/quick/AAPL")
    assert r.status_code == 500
    assert CANARY not in r.text


def test_daily_briefing_failure_never_returns_the_key(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError(f"provider error, key={CANARY}")

    monkeypatch.setattr("services.daily_service.llm.complete", boom)
    r = client.post("/api/daily/report", json={"tickers": []})
    assert CANARY not in r.text


def test_health_never_returns_the_key():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert CANARY not in r.text
    # It must still report whether a key is configured — that is what the UI needs.
    assert r.json()["llm"]["ok"] is True


def test_models_endpoint_never_returns_the_key():
    assert CANARY not in client.get("/api/models").text


def test_openapi_schema_never_returns_the_key():
    assert CANARY not in client.get("/openapi.json").text


@pytest.mark.parametrize("path", [
    "/.env", "/../.env", "/../../.env", "/%2e%2e/.env",
    "/..%2f.env", "/static/../.env", "/....//.env",
])
def test_the_env_file_cannot_be_fetched_through_the_spa_route(path):
    """The catch-all resolves paths under static/; it must not escape it."""
    r = client.get(path)
    assert CANARY not in r.text
    assert "TOGETHER_API_KEY" not in r.text
