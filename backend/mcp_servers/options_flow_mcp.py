"""options-flow-mcp — Options chain, unusual activity, IV rank. Stubs."""
from __future__ import annotations

import asyncio
from typing import Any

import yfinance as yf


def _fetch_chain(ticker: str, expiry: str | None) -> dict[str, Any] | None:
    t = yf.Ticker(ticker)
    expiries = list(t.options or [])
    if not expiries:
        return None
    chosen = expiry or expiries[0]
    chain = t.option_chain(chosen)
    return {
        "expiries": expiries,
        "chosen": chosen,
        "calls": chain.calls,
        "puts": chain.puts,
    }


async def get_options_chain(ticker: str, expiry: str | None = None) -> dict[str, Any]:
    data = await asyncio.to_thread(_fetch_chain, ticker, expiry)
    if data is None:
        return {"ticker": ticker.upper(), "error": "no options"}
    return {
        "ticker": ticker.upper(),
        "expiry": data["chosen"],
        "available_expiries": data["expiries"],
        "calls": data["calls"].head(20).to_dict(orient="records"),
        "puts": data["puts"].head(20).to_dict(orient="records"),
    }


async def get_unusual_activity(min_premium: int = 100_000) -> list[dict[str, Any]]:
    return []  # Wire to Unusual Whales API


async def get_put_call_ratio(ticker: str) -> dict[str, Any]:
    data = await asyncio.to_thread(_fetch_chain, ticker, None)
    if data is None:
        return {"ticker": ticker.upper(), "put_call_ratio": None}
    call_vol = data["calls"]["volume"].fillna(0).sum()
    put_vol = data["puts"]["volume"].fillna(0).sum()
    ratio = round(float(put_vol) / float(call_vol + 1), 3)
    return {
        "ticker": ticker.upper(),
        "put_call_ratio": ratio,
        "call_volume": int(call_vol),
        "put_volume": int(put_vol),
    }
