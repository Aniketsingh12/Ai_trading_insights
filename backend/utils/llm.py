"""
LLM abstraction supporting both Claude API and local Ollama (OSS) models.
Switch via LLM_PROVIDER env var.
"""
from __future__ import annotations

import asyncio
from typing import Literal

import httpx
from anthropic import Anthropic

from config import settings

Tier = Literal["quick", "agent", "report"]


class LLMClient:
    def __init__(self, provider: str | None = None) -> None:
        self.provider = (provider or settings.llm_provider).lower()
        self._anthropic: Anthropic | None = None

    def _get_anthropic(self) -> Anthropic:
        """Lazily create the Anthropic client so a missing key surfaces as a
        clean per-request error instead of crashing app startup."""
        if self._anthropic is None:
            if not settings.anthropic_api_key:
                raise RuntimeError(
                    "ANTHROPIC_API_KEY missing — set it in .env or switch LLM_PROVIDER=ollama"
                )
            self._anthropic = Anthropic(api_key=settings.anthropic_api_key)
        return self._anthropic

    def _model_for(self, tier: Tier) -> str:
        if self.provider == "anthropic":
            return {
                "quick": settings.claude_model_quick,
                "agent": settings.claude_model_agent,
                "report": settings.claude_model_report,
            }[tier]
        if self.provider == "openai_compat":
            return {
                "quick": settings.openai_model_quick,
                "agent": settings.openai_model_agent,
                "report": settings.openai_model_report,
            }[tier]
        if self.provider == "gemini":
            return {
                "quick": settings.gemini_model_quick,
                "agent": settings.gemini_model_agent,
                "report": settings.gemini_model_report,
            }[tier]
        return {
            "quick": settings.ollama_model_quick,
            "agent": settings.ollama_model_agent,
            "report": settings.ollama_model_report,
        }[tier]

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        tier: Tier = "quick",
        max_tokens: int = 1024,
        temperature: float = 0.4,
    ) -> str:
        model = self._model_for(tier)
        if self.provider == "anthropic":
            return await self._anthropic_complete(prompt, system, model, max_tokens, temperature)
        if self.provider == "openai_compat":
            return await self._openai_complete(prompt, system, model, max_tokens, temperature)
        if self.provider == "gemini":
            return await self._gemini_complete(prompt, system, model, max_tokens, temperature)
        if self.provider == "ollama":
            return await self._ollama_complete(prompt, system, model, max_tokens, temperature)
        raise ValueError(f"Unknown LLM provider: {self.provider}")

    async def _anthropic_complete(
        self, prompt: str, system: str, model: str, max_tokens: int, temperature: float
    ) -> str:
        client = self._get_anthropic()
        # SDK call is synchronous — run off the event loop so it doesn't block.
        resp = await asyncio.to_thread(
            client.messages.create,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system or "You are a helpful trading analyst.",
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(block.text for block in resp.content if hasattr(block, "text"))

    async def _chat_completion(
        self, prompt, system, model, max_tokens, temperature, *, base_url, api_key, key_hint
    ) -> str:
        """OpenAI-compatible chat completion. Shared by Groq/OpenRouter/etc and Gemini,
        which all expose a POST {base}/chat/completions endpoint."""
        if not api_key:
            raise RuntimeError(f"{key_hint} missing — set it in .env for this provider")
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system or "You are a helpful trading analyst."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        headers = {"Authorization": f"Bearer {api_key}"}
        url = f"{base_url.rstrip('/')}/chat/completions"
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        return data["choices"][0]["message"]["content"].strip()

    async def _openai_complete(self, prompt, system, model, max_tokens, temperature) -> str:
        """Groq (free) / OpenRouter / Together / HF router."""
        return await self._chat_completion(
            prompt, system, model, max_tokens, temperature,
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
            key_hint="OPENAI_API_KEY (e.g. a free key from console.groq.com)",
        )

    async def _gemini_complete(self, prompt, system, model, max_tokens, temperature) -> str:
        """Google Gemini via its OpenAI-compatible endpoint (free tier from AI Studio)."""
        return await self._chat_completion(
            prompt, system, model, max_tokens, temperature,
            base_url=settings.gemini_base_url,
            api_key=settings.gemini_api_key,
            key_hint="GEMINI_API_KEY (free key from aistudio.google.com/apikey)",
        )

    async def _ollama_complete(
        self, prompt: str, system: str, model: str, max_tokens: int, temperature: float
    ) -> str:
        payload = {
            "model": model,
            "prompt": prompt,
            "system": system or "You are a helpful trading analyst.",
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{settings.ollama_host}/api/generate", json=payload)
            r.raise_for_status()
            return r.json().get("response", "").strip()

    async def health(self) -> dict:
        if self.provider == "ollama":
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    r = await client.get(f"{settings.ollama_host}/api/tags")
                    r.raise_for_status()
                    models = [m["name"] for m in r.json().get("models", [])]
                return {"provider": "ollama", "ok": True, "models": models}
            except Exception as e:
                return {"provider": "ollama", "ok": False, "error": str(e)}
        if self.provider == "openai_compat":
            return {
                "provider": "openai_compat",
                "ok": bool(settings.openai_api_key),
                "base_url": settings.openai_base_url,
            }
        if self.provider == "gemini":
            return {
                "provider": "gemini",
                "ok": bool(settings.gemini_api_key),
                "model": settings.gemini_model_quick,
            }
        return {"provider": "anthropic", "ok": bool(settings.anthropic_api_key)}


llm = LLMClient()
