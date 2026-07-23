"""social-sentiment-mcp — Reddit, Stocktwits, fear/greed."""
from __future__ import annotations

from typing import Any

import httpx

from utils.cache import cache_get, cache_set


async def get_stocktwits_sentiment(ticker: str) -> dict[str, Any]:
    key = f"stocktwits:{ticker.upper()}"
    cached = await cache_get(key)
    if cached:
        return cached
    url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker.upper()}.json"
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.get(url)
    if r.status_code != 200:
        return {"ticker": ticker.upper(), "error": "stocktwits unavailable"}
    msgs = r.json().get("messages", [])
    bull = sum(1 for m in msgs if (m.get("entities", {}).get("sentiment") or {}).get("basic") == "Bullish")
    bear = sum(1 for m in msgs if (m.get("entities", {}).get("sentiment") or {}).get("basic") == "Bearish")
    result = {
        "ticker": ticker.upper(),
        "bullish": bull,
        "bearish": bear,
        "total_messages": len(msgs),
        "ratio": round(bull / (bear + 1), 2),
    }
    await cache_set(key, result, ttl=600)
    return result


async def get_reddit_mentions(ticker: str, days: int = 7) -> dict[str, Any]:
    # Stub — wire to PRAW with REDDIT_CLIENT_ID/SECRET
    return {"ticker": ticker.upper(), "days": days, "mentions": 0, "note": "configure PRAW"}


async def get_fear_greed_index() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as c:
        try:
            r = await c.get("https://api.alternative.me/fng/?limit=1")
            data = r.json().get("data", [{}])[0]
            return {
                "value": int(data.get("value", 0)),
                "classification": data.get("value_classification"),
                "source": "alternative.me (crypto fear/greed proxy)",
            }
        except Exception as e:
            return {"error": str(e)}
