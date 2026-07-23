"""
market-data-mcp — Real-time quotes, OHLCV, indicators.

Uses yfinance as the free default; Polygon.io if POLYGON_API_KEY is set.
Exposed as plain Python functions today; can be wrapped with the MCP SDK later
(see https://modelcontextprotocol.io for the spec).
"""
from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pandas as pd
import yfinance as yf

from config import settings
from utils.cache import cache_get, cache_set
from utils.markets import market_for


def _clean(value: Any, ndigits: int = 2) -> float | None:
    """Round, converting NaN/inf to None so the result is valid JSON."""
    if value is None:
        return None
    f = float(value)
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, ndigits)


async def get_quote(ticker: str) -> dict[str, Any]:
    key = f"quote:{ticker.upper()}"
    cached = await cache_get(key)
    if cached:
        return cached

    mkt = market_for(ticker)
    meta = {
        "exchange": mkt.exchange,
        "region": mkt.region,
        "currency": mkt.currency,
        "currency_symbol": mkt.currency_symbol,
    }

    if settings.polygon_api_key and mkt.exchange == "US":
        url = f"https://api.polygon.io/v2/last/trade/{ticker.upper()}"
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(url, params={"apiKey": settings.polygon_api_key})
        if r.status_code == 200:
            data = r.json().get("results", {})
            result = {
                "ticker": ticker.upper(),
                "price": data.get("p"),
                "size": data.get("s"),
                "ts": data.get("t"),
                "source": "polygon",
                **meta,
            }
            await cache_set(key, result, ttl=15)
            return result

    # yfinance fallback (free, no key). Synchronous — run off the event loop.
    info = await asyncio.to_thread(_fetch_fast_info, ticker)
    result = {
        "ticker": ticker.upper(),
        "price": _clean(info["last_price"], 4),
        "previous_close": _clean(info["previous_close"], 4),
        "source": "yfinance",
        **meta,
    }
    # yfinance currency wins if present (more precise than suffix guess)
    if info.get("currency"):
        result["currency"] = info["currency"]
    if result["price"] and result["previous_close"]:
        result["change"] = _clean(result["price"] - result["previous_close"], 4)
        result["change_pct"] = _clean(
            (result["price"] - result["previous_close"]) / result["previous_close"] * 100, 2
        )
    await cache_set(key, result, ttl=60)
    return result


def _fetch_fast_info(ticker: str) -> dict[str, Any]:
    """Robustly fetch last price / previous close / currency.

    yfinance's fast_info lazily parses Yahoo metadata and raises KeyError
    (e.g. 'currentTradingPeriod') when Yahoo returns a partial payload — common
    for some indices and non-US tickers. So each field is read defensively, and
    if price data is missing we fall back to a short price history.
    """
    t = yf.Ticker(ticker)
    fi = t.fast_info

    def _safe(attr: str):
        try:
            return getattr(fi, attr)
        except Exception:
            return None

    last_price = _safe("last_price")
    previous_close = _safe("previous_close")
    currency = _safe("currency")

    # Fall back to recent daily history if fast_info couldn't give us prices.
    if last_price is None or previous_close is None:
        try:
            hist = t.history(period="5d", auto_adjust=False)
            closes = hist["Close"].dropna().tolist() if not hist.empty else []
            if last_price is None and closes:
                last_price = closes[-1]
            if previous_close is None and len(closes) >= 2:
                previous_close = closes[-2]
        except Exception:
            pass

    return {
        "last_price": last_price,
        "previous_close": previous_close,
        "currency": currency,
    }


async def get_ohlcv(ticker: str, interval: str = "1d", days: int = 90) -> list[dict[str, Any]]:
    key = f"ohlcv:{ticker.upper()}:{interval}:{days}"
    cached = await cache_get(key)
    if cached:
        return cached

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    df = await asyncio.to_thread(
        yf.download, ticker, start=start, end=end, interval=interval, progress=False, auto_adjust=False
    )
    if df.empty:
        return []
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df = df.reset_index()
    df["Date"] = df["Date"].astype(str) if "Date" in df.columns else df["Datetime"].astype(str)
    candles = [
        {
            "date": row.get("Date") or row.get("Datetime"),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]),
        }
        for row in df.to_dict(orient="records")
    ]
    await cache_set(key, candles, ttl=300)
    return candles


async def get_indicators(ticker: str, indicators: list[str] | None = None) -> dict[str, Any]:
    indicators = indicators or ["rsi", "macd", "sma50", "sma200"]
    candles = await get_ohlcv(ticker, "1d", 250)
    if not candles:
        return {"ticker": ticker.upper(), "error": "no data"}

    df = pd.DataFrame(candles)
    close = df["close"]
    out: dict[str, Any] = {"ticker": ticker.upper()}

    if "rsi" in indicators:
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = -delta.clip(upper=0).rolling(14).mean()
        rs = gain / loss
        out["rsi"] = _clean((100 - 100 / (1 + rs)).iloc[-1], 2)

    if "macd" in indicators:
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd = ema12 - ema26
        signal = macd.ewm(span=9, adjust=False).mean()
        out["macd"] = _clean(macd.iloc[-1], 4)
        out["macd_signal"] = _clean(signal.iloc[-1], 4)
        out["macd_hist"] = _clean(macd.iloc[-1] - signal.iloc[-1], 4)

    if "sma50" in indicators and len(close) >= 50:
        out["sma50"] = _clean(close.rolling(50).mean().iloc[-1], 2)
    if "sma200" in indicators and len(close) >= 200:
        out["sma200"] = _clean(close.rolling(200).mean().iloc[-1], 2)

    out["last_close"] = _clean(close.iloc[-1], 2)
    return out


async def get_indices(region: str = "global") -> list[dict[str, Any]]:
    """Fetch quotes for a region's index basket (region: 'global' | 'india')."""
    from utils.markets import INDEX_BASKETS

    basket = INDEX_BASKETS.get(region.lower(), INDEX_BASKETS["global"])
    results = await asyncio.gather(*(get_quote(item["ticker"]) for item in basket))
    return [{**q, "label": item["label"]} for q, item in zip(results, basket)]


async def get_52week(ticker: str) -> dict[str, Any]:
    candles = await get_ohlcv(ticker, "1d", 365)
    if not candles:
        return {"ticker": ticker.upper(), "error": "no data"}
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    last = candles[-1]["close"]
    hi, lo = max(highs), min(lows)
    return {
        "ticker": ticker.upper(),
        "high_52w": hi,
        "low_52w": lo,
        "current": last,
        "pct_from_high": round((last - hi) / hi * 100, 2),
        "pct_from_low": round((last - lo) / lo * 100, 2),
    }


_SKIP_TYPES = {"CURRENCY"}  # FX pairs clutter results; can still be typed manually


async def search_tickers(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Search by company name or ticker symbol via Yahoo Finance (no key needed)."""
    q = query.strip()
    if len(q) < 2:
        return []
    cache_key = f"search:{q.lower()}:{limit}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {"q": q, "quotesCount": limit, "newsCount": 0, "listsCount": 0}
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        async with httpx.AsyncClient(timeout=8.0, headers=headers) as c:
            r = await c.get(url, params=params)
        if r.status_code != 200:
            return []
        quotes = r.json().get("quotes", [])
    except Exception:
        return []

    results = [
        {
            "ticker": item["symbol"],
            "name": item.get("shortname") or item.get("longname") or item["symbol"],
            "exchange": item.get("exchDisp") or item.get("exchange") or "",
            "type": item.get("quoteType", ""),
        }
        for item in quotes
        if item.get("symbol") and item.get("quoteType") not in _SKIP_TYPES
    ]
    await cache_set(cache_key, results, ttl=300)
    return results
