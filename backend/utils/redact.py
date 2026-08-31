"""
Last line of defence before text reaches a client.

Nothing currently puts a provider key into an error message — that was audited.
But several code paths hand raw exception text to the browser, and an exception
is written by whatever raised it: a client library that includes a request in
its repr, a provider that echoes part of the request back in an error body, or
a future edit that interpolates a URL containing credentials. Any of those turns
a debug convenience into an exfiltration channel.

So text that leaves the process is scrubbed rather than trusted. Exact
configured secrets are replaced first (reliable), then obviously key-shaped
tokens (a net for anything not in settings).
"""
from __future__ import annotations

import re

from config import settings

REDACTED = "[redacted]"

# Every setting that holds a credential. Listed explicitly rather than matched
# by name so a new secret is a deliberate addition here, not an accident.
_SECRET_FIELDS = (
    "together_api_key", "gemini_api_key", "openai_api_key", "anthropic_api_key",
    "polygon_api_key", "fmp_api_key", "newsapi_key", "alpha_vantage_key",
    "unusual_whales_key", "reddit_client_secret",
    "supabase_key", "supabase_service_key", "api_access_key",
)

# Shapes that are credentials regardless of where they came from. Deliberately
# conservative — over-redacting would destroy the error messages this exists to
# keep useful.
_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_\-]{12,}"),          # OpenAI/Together style
    re.compile(r"\bBearer\s+[A-Za-z0-9._\-]{12,}", re.IGNORECASE),
    re.compile(r"\b(?:api[_-]?key|token|secret)=\s*[A-Za-z0-9._\-]{8,}", re.IGNORECASE),
    re.compile(r"\bAIza[A-Za-z0-9_\-]{20,}"),          # Google
)


def scrub(text: object) -> str:
    """Replace any credential in `text` with a placeholder."""
    out = str(text)

    # Exact values first: the only method that cannot miss a key it knows about.
    for field in _SECRET_FIELDS:
        value = getattr(settings, field, "") or ""
        # A very short secret would match everywhere and mangle the message; one
        # that short is not protecting anything anyway.
        if len(value) >= 8:
            out = out.replace(value, REDACTED)

    for pattern in _PATTERNS:
        out = pattern.sub(REDACTED, out)
    return out


def safe_detail(exc: BaseException, fallback: str) -> str:
    """
    A client-facing message for an exception.

    Returns the scrubbed text when it is a message we raised deliberately, and a
    generic fallback otherwise — an arbitrary internal exception's text is not
    written for a stranger to read, and its shape is not ours to predict.
    """
    if isinstance(exc, (RuntimeError, ValueError)):
        return scrub(exc)
    return fallback
