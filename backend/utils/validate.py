"""
Input validation for anything that reaches a model or a data provider.

The threat this exists for: a ticker is interpolated into an LLM prompt, and
until it is validated a "ticker" can be any string at all. That turns a public
deployment into a free general-purpose LLM proxy — send a few kilobytes of your
own instructions as the symbol and get arbitrary completions billed to the
deployment's provider key. Constraining the shape closes that, and bounding the
list length stops one request from fanning out into thousands of upstream calls.
"""
from __future__ import annotations

import re

from fastapi import HTTPException

# Every real symbol this app handles: AAPL, BRK.B, RELIANCE.NS, BTC-USD, ^NSEI,
# GC=F, INR=X. Letters, digits, and the four separators those formats use.
# Anything else is not a symbol, whatever else it might be.
_TICKER = re.compile(r"^[A-Za-z0-9.\-^=]{1,15}$")

# Comfortably above the built-in universes (14 global / 12 India) and any
# realistic watchlist, far below a batch that would cost real money.
MAX_TICKERS = 25


def clean_ticker(raw: str) -> str:
    """Normalise one symbol, or reject it. Never returns free-form text."""
    ticker = (raw or "").strip().upper()
    if not _TICKER.match(ticker):
        # Echo only a short slice: the input is attacker-controlled and the
        # message ends up in logs and in the client's error toast.
        raise HTTPException(422, f"'{ticker[:20]}' is not a valid symbol.")
    return ticker


def clean_tickers(raws: list[str], *, max_n: int = MAX_TICKERS) -> list[str]:
    """
    Normalise and de-duplicate a batch, rejecting an oversized one outright.

    Truncating silently would be friendlier but wrong: the caller would believe
    it had scored a list it hadn't.
    """
    seen = [t for t in (r.strip().upper() for r in raws or []) if t]
    unique = list(dict.fromkeys(seen))
    if len(unique) > max_n:
        raise HTTPException(422, f"Too many symbols — {len(unique)} sent, {max_n} is the maximum.")
    return [clean_ticker(t) for t in unique]


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))
