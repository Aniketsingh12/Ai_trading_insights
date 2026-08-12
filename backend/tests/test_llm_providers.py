"""
Provider wiring + defensive parsing of OpenAI-compatible responses.

The three tiers must map to distinct models per provider, and a bad response
shape must raise a readable RuntimeError rather than KeyError/AttributeError —
a wrong model ID should tell you the model was wrong.
"""
from __future__ import annotations

import asyncio

import pytest

from config import settings
from utils.llm import LLMClient


def _fake_transport(monkeypatch, body):
    """Stub httpx.AsyncClient so _chat_completion sees `body` as the response."""
    import utils.llm as llm_mod

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return body

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FakeResp()

    monkeypatch.setattr(llm_mod.httpx, "AsyncClient", lambda *a, **k: FakeClient())


def _complete(client, **kw):
    return asyncio.run(
        client._chat_completion(
            "prompt", "system", "model-x", 100, 0.2,
            base_url="https://example.test/v1", api_key="key", key_hint="KEY",
            **kw,
        )
    )


# ─────────────────────────── provider wiring ───────────────────────────
def test_together_tiers_map_to_configured_models():
    c = LLMClient(provider="together")
    assert c._model_for("quick") == settings.together_model_quick
    assert c._model_for("agent") == settings.together_model_agent
    assert c._model_for("report") == settings.together_model_report
    # Tiering only saves money if the tiers actually differ.
    assert c._model_for("quick") != c._model_for("report")


def test_together_defaults_are_namespaced_ids():
    """Together uses `namespace/model`; a bare name is almost certainly wrong."""
    for model in (
        settings.together_model_quick,
        settings.together_model_agent,
        settings.together_model_report,
    ):
        assert "/" in model, model


def test_together_health_reports_key_state_without_leaking_it():
    health = asyncio.run(LLMClient(provider="together").health())
    assert health["provider"] == "together"
    assert health["ok"] is bool(settings.together_api_key)
    assert health["base_url"] == "https://api.together.ai/v1"
    assert set(health["models"]) == {"quick", "agent", "report"}
    assert settings.together_api_key not in str(health) or not settings.together_api_key


def test_missing_key_raises_named_error(monkeypatch):
    monkeypatch.setattr(settings, "together_api_key", "")
    c = LLMClient(provider="together")
    with pytest.raises(RuntimeError, match="TOGETHER_API_KEY"):
        asyncio.run(c.complete("hi", tier="quick"))


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        asyncio.run(LLMClient(provider="nope").complete("hi"))


# ─────────────────────────── response parsing ───────────────────────────
def test_normal_response(monkeypatch):
    _fake_transport(monkeypatch, {"choices": [{"message": {"content": "  hello  "}}]})
    assert _complete(LLMClient(provider="together")) == "hello"


def test_reasoning_content_is_used_when_content_is_null(monkeypatch):
    """Some models put the text in reasoning_content and leave content null."""
    _fake_transport(monkeypatch, {
        "choices": [{"message": {"content": None, "reasoning_content": "thought"}}]
    })
    assert _complete(LLMClient(provider="together")) == "thought"


@pytest.mark.parametrize("body,expected", [
    ({"error": {"message": "model not found: bad/model"}}, "model not found"),
    ({"choices": []}, "no choices"),
    ({"choices": [{"message": {"content": None}, "finish_reason": "length"}]}, "empty completion"),
])
def test_bad_responses_raise_readable_errors(monkeypatch, body, expected):
    _fake_transport(monkeypatch, body)
    with pytest.raises(RuntimeError, match=expected):
        _complete(LLMClient(provider="together"))
