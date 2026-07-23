"""news-mcp — News articles, earnings news, economic calendar."""
from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from typing import Any

import httpx

from config import settings
from utils.cache import cache_get, cache_set
from utils.markets import news_search_term

# Curated, region-specific MARKET news feeds (not ticker-based, so India is never
# empty and global isn't polluted with the wrong region). Several per region for
# redundancy — if one feed is down, the others fill in.
_MARKET_FEEDS: dict[str, list[tuple[str, str]]] = {
    "global": [
        ("https://finance.yahoo.com/news/rssindex", "Yahoo Finance"),
        ("https://www.cnbc.com/id/20910258/device/rss/rss.html", "CNBC"),
        ("https://feeds.marketwatch.com/marketwatch/marketpulse/", "MarketWatch"),
    ],
    "india": [
        ("https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", "Economic Times"),
        ("https://www.moneycontrol.com/rss/marketreports.xml", "Moneycontrol"),
        ("https://www.business-standard.com/rss/markets-106.rss", "Business Standard"),
    ],
}

# Drop entertainment / OTT / movie / series content that leaks into general feeds.
_BLOCK_TERMS = (
    "web series", "web-series", " ott", "ott ", "box office", "trailer", "teaser",
    "first look", "movie review", "film review", "bollywood", "hollywood", "tollywood",
    "kollywood", "episode", "season ", "watch online", "release date", "song launch",
    "celebrity", "actress", "web show", "what to watch", "streaming guide", "ott release",
)


def _is_entertainment(title: str) -> bool:
    t = title.lower()
    return any(term in t for term in _BLOCK_TERMS)


async def _fetch_feed(url: str, source: str, client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Parse one RSS/Atom feed into {title, url, source} items."""
    try:
        r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.content)
    except Exception:
        return []
    items: list[dict[str, Any]] = []
    for el in root.iter():
        if el.tag.split("}")[-1] not in ("item", "entry"):
            continue
        title, link = None, ""
        for child in el:
            ctag = child.tag.split("}")[-1]
            if ctag == "title" and child.text:
                title = child.text.strip()
            elif ctag == "link":
                link = (child.text or child.get("href") or "").strip()
        if title:
            items.append({"title": title, "url": link, "source": source})
    return items


async def get_market_news(region: str = "global", limit: int = 8) -> list[dict[str, Any]]:
    """Region-appropriate market headlines, de-duplicated, entertainment filtered."""
    region = region.lower()
    key = f"mktnews:{region}:{limit}"
    cached = await cache_get(key)
    if cached:
        return cached

    feeds = _MARKET_FEEDS.get(region, _MARKET_FEEDS["global"])
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        results = await asyncio.gather(
            *(_fetch_feed(u, s, client) for u, s in feeds), return_exceptions=True
        )

    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for res in results:
        if not isinstance(res, list):
            continue
        for n in res:
            t = n["title"]
            if not t or t in seen or _is_entertainment(t):
                continue
            seen.add(t)
            merged.append(n)
    merged = merged[:limit]
    await cache_set(key, merged, ttl=900)
    return merged


async def get_news(ticker: str, limit: int = 10) -> list[dict[str, Any]]:
    key = f"news:{ticker.upper()}:{limit}"
    cached = await cache_get(key)
    if cached:
        return cached

    # Strip exchange suffix so "RELIANCE.NS" searches for "RELIANCE", "BTC-USD" -> "BTC"
    query = news_search_term(ticker)

    if settings.newsapi_key:
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": query,
            "sortBy": "publishedAt",
            "pageSize": limit,
            "language": "en",
            "apiKey": settings.newsapi_key,
        }
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(url, params=params)
        if r.status_code == 200:
            items = [
                {
                    "title": a["title"],
                    "url": a["url"],
                    "source": a["source"]["name"],
                    "published_at": a["publishedAt"],
                    "summary": a.get("description") or "",
                }
                for a in r.json().get("articles", [])
            ]
            await cache_set(key, items, ttl=900)
            return items

    # Yahoo Finance free fallback via RSS
    import xml.etree.ElementTree as ET

    rss_url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.get(rss_url)
    items: list[dict[str, Any]] = []
    if r.status_code == 200:
        root = ET.fromstring(r.text)
        for item in root.iter("item"):
            items.append(
                {
                    "title": (item.findtext("title") or "").strip(),
                    "url": item.findtext("link") or "",
                    "source": "Yahoo Finance",
                    "published_at": item.findtext("pubDate") or "",
                    "summary": (item.findtext("description") or "").strip(),
                }
            )
            if len(items) >= limit:
                break
    await cache_set(key, items, ttl=900)
    return items


async def get_economic_calendar(week: str | None = None) -> list[dict[str, Any]]:
    # Stub — wire to TradingEconomics or Finnhub later
    return []
