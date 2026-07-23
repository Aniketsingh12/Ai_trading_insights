"""fundamentals-mcp — Financial statements, ratios, analyst ratings."""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
import yfinance as yf

from config import settings
from utils.cache import cache_get, cache_set

FMP_BASE = "https://financialmodelingprep.com/api/v3"


async def _fmp(path: str, **params: Any) -> Any:
    if not settings.fmp_api_key:
        return None
    params["apikey"] = settings.fmp_api_key
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(f"{FMP_BASE}/{path}", params=params)
    return r.json() if r.status_code == 200 else None


async def get_ratios(ticker: str) -> dict[str, Any]:
    key = f"ratios:{ticker.upper()}"
    cached = await cache_get(key)
    if cached:
        return cached

    data = await _fmp(f"ratios-ttm/{ticker.upper()}")
    if data:
        await cache_set(key, data[0] if data else {}, ttl=3600)
        return data[0] if data else {}

    # yfinance fallback (synchronous — run off the event loop)
    info = await asyncio.to_thread(lambda: yf.Ticker(ticker).info or {})
    result = {
        "peRatio": info.get("trailingPE"),
        "pegRatio": info.get("pegRatio"),
        "priceToSales": info.get("priceToSalesTrailing12Months"),
        "priceToBook": info.get("priceToBook"),
        "returnOnEquity": info.get("returnOnEquity"),
        "debtToEquity": info.get("debtToEquity"),
        "marketCap": info.get("marketCap"),
        "source": "yfinance",
    }
    await cache_set(key, result, ttl=3600)
    return result


async def get_income_statement(ticker: str, years: int = 4) -> list[dict[str, Any]]:
    data = await _fmp(f"income-statement/{ticker.upper()}", limit=years)
    return data or []


async def get_analyst_ratings(ticker: str) -> dict[str, Any]:
    try:
        rec = await asyncio.to_thread(lambda: yf.Ticker(ticker).recommendations_summary)
        if rec is not None and not rec.empty:
            row = rec.iloc[-1].to_dict()
            return {"ticker": ticker.upper(), **{k: int(v) for k, v in row.items() if str(v).isdigit()}}
    except Exception:
        pass
    return {"ticker": ticker.upper(), "data": "unavailable"}
