"""
Screener / Top Picks — rank tickers by a transparent composite score, then have
the LLM explain WHY each one ranks where it does.

Two layers, on purpose:
  1. Deterministic math (utils/scoring.py) — the auditable evidence. Every point a
     ticker earns is traceable to a formula and shown in the UI breakdown.
  2. LLM reasoning — turns that evidence + the ranking context + news into a plain
     "why it's top / why it's low" sentence per pick, plus an overall summary.

So the numbers are reproducible AND there's a human-readable reason for the order.
If the LLM is unavailable, a deterministic fallback reason is built from the math.
"""
from __future__ import annotations

import asyncio
from typing import Any

from mcp_servers import market_data_mcp, news_mcp, social_sentiment_mcp
from utils import scoring
from utils.llm import llm

_REASON_SYSTEM = """You are an equity analyst explaining a quantitative signal score.
Be specific, cite the factor points and risk/reward you are given, separate strength
from weakness. This is informational analysis, NOT financial advice — never promise
returns."""

_RANK_SYSTEM = """You are an equity analyst explaining a stock ranking to an investor.
For each ticker explain, in one tight sentence, why it sits where it does relative to
the others — name its strongest and weakest scoring factor and its risk/reward. Then a
final OVERALL line. Cite the numbers given. Informational only, NOT financial advice."""


# ─────────────────────── deterministic compute (no LLM) ───────────────────────
async def _compute(ticker: str) -> dict[str, Any]:
    """Score one ticker from real data. One year of candles is fetched ONCE and all
    indicators/52w/volatility are derived locally (keeps data-provider load low)."""
    ticker = ticker.upper()

    quote, candles, social, news = await asyncio.gather(
        market_data_mcp.get_quote(ticker),
        market_data_mcp.get_ohlcv(ticker, "1d", 365),
        social_sentiment_mcp.get_stocktwits_sentiment(ticker),
        news_mcp.get_news(ticker, limit=1),
        return_exceptions=True,
    )

    def ok(x):
        return x if isinstance(x, dict) else {}

    quote, social = ok(quote), ok(social)
    candles = candles if isinstance(candles, list) else []
    closes = [c["close"] for c in candles]
    headline = news[0] if isinstance(news, list) and news else None

    indicators = scoring.indicators_from_closes(closes)
    range52 = scoring.range_52w_from_candles(candles)

    price = quote.get("price") or indicators.get("last_close")
    vol = scoring.realized_volatility(closes)

    metrics = scoring.trade_metrics(
        price=price,
        sma50=indicators.get("sma50"),
        sma200=indicators.get("sma200"),
        high_52w=range52.get("high_52w"),
        low_52w=range52.get("low_52w"),
        vol_annual=vol,
    )
    sc = scoring.score(
        price=price,
        rsi=indicators.get("rsi"),
        macd_hist=indicators.get("macd_hist"),
        sma50=indicators.get("sma50"),
        sma200=indicators.get("sma200"),
        risk_reward=metrics.get("risk_reward"),
        stocktwits_ratio=social.get("ratio"),
    )

    return {
        "ticker": ticker,
        "name": quote.get("name") or ticker,
        "price": price,
        "currency_symbol": quote.get("currency_symbol", ""),
        "exchange": quote.get("exchange"),
        "change_pct": quote.get("change_pct"),
        "score": sc["total"],
        "label": sc["label"],
        "breakdown": sc["breakdown"],
        "metrics": metrics,
        "volatility_annual_pct": vol,
        "rsi": indicators.get("rsi"),
        "macd_hist": indicators.get("macd_hist"),
        "headline": (
            {"title": headline["title"], "url": headline.get("url", "")}
            if headline
            else None
        ),
    }


# ─────────────────────────── reasoning (LLM + fallback) ───────────────────────────
def _extremes(breakdown: list[dict]) -> tuple[dict, dict]:
    ratio = lambda b: (b["points"] / b["max"]) if b.get("max") else 0
    return max(breakdown, key=ratio), min(breakdown, key=ratio)


def _fallback_reason(pick: dict) -> str:
    bd = pick.get("breakdown") or []
    if not bd:
        return "Insufficient data to score."
    top, low = _extremes(bd)
    rr = (pick.get("metrics") or {}).get("risk_reward")
    if top["factor"] == low["factor"]:  # uniform scores — no single weak spot
        return f"Strong across the board — {', '.join(b['reason'] for b in bd)}. Risk/reward {rr}:1."
    return (
        f"Strongest on {top['factor']} ({top['reason']}); weakest on "
        f"{low['factor']} ({low['reason']}). Risk/reward {rr}:1."
    )


async def _llm_reason(pick: dict) -> str:
    """One plain-English paragraph for a single ticker (used by the Analyze page)."""
    if not pick.get("breakdown"):
        return "No price data to score this symbol."
    bd = "; ".join(
        f"{b['factor']} {b['points']}/{b['max']} ({b['reason']})" for b in pick["breakdown"]
    )
    m = pick.get("metrics") or {}
    head = f"\nRecent headline: {pick['headline']['title']}" if pick.get("headline") else ""
    prompt = (
        f"{pick['ticker']} scored {pick['score']}/100 ({pick['label']}).\n"
        f"Factor breakdown: {bd}\n"
        f"Trade math: entry {m.get('entry')}, target {m.get('target')} "
        f"(+{m.get('upside_pct')}%), stop {m.get('stop')} (-{m.get('downside_pct')}%), "
        f"risk/reward {m.get('risk_reward')}:1, expected monthly move "
        f"±{m.get('expected_monthly_move_pct')}%.{head}\n\n"
        f"In 2-3 sentences, explain why it earned this score — cite the strongest and "
        f"weakest factors and the risk/reward."
    )
    try:
        out = await llm.complete(prompt, system=_REASON_SYSTEM, tier="quick", max_tokens=180)
        return out.strip() or _fallback_reason(pick)
    except Exception:
        return _fallback_reason(pick)


async def _rank_reasons(picks: list[dict]) -> tuple[dict[str, str], str]:
    """One LLM call that explains the whole ranking (why each is top/low) + a summary.
    Returns {ticker: reason}, overall_summary."""
    if not picks:
        return {}, ""
    lines = []
    for i, p in enumerate(picks, 1):
        top, low = _extremes(p["breakdown"]) if p.get("breakdown") else ({}, {})
        lines.append(
            f"#{i} {p['ticker']} — score {p['score']} ({p['label']}); "
            f"strong: {top.get('factor','?')} {top.get('points','?')}/{top.get('max','?')}; "
            f"weak: {low.get('factor','?')} {low.get('points','?')}/{low.get('max','?')}; "
            f"R:R {(p.get('metrics') or {}).get('risk_reward')}"
        )
    prompt = (
        "Ranked tickers (highest score first):\n"
        + "\n".join(lines)
        + "\n\nWrite ONE sentence per ticker on why it ranks there vs the others, then a "
        "final summary. Output strictly, one per line:\nTICKER :: reason\n...\nOVERALL :: summary"
    )
    try:
        text = await llm.complete(prompt, system=_RANK_SYSTEM, tier="agent", max_tokens=600)
    except Exception:
        return {p["ticker"]: _fallback_reason(p) for p in picks}, ""

    reasons: dict[str, str] = {}
    summary = ""
    for line in text.splitlines():
        if "::" not in line:
            continue
        key, _, val = line.partition("::")
        key, val = key.strip().upper(), val.strip()
        if key.startswith("OVERALL"):
            summary = val
            continue
        for p in picks:
            if p["ticker"] in key and p["ticker"] not in reasons:
                reasons[p["ticker"]] = val
                break
    for p in picks:  # fill any the LLM skipped
        reasons.setdefault(p["ticker"], _fallback_reason(p))
    return reasons, summary


# ─────────────────────────── public API ───────────────────────────
async def analyze_one(ticker: str, explain: bool = True) -> dict[str, Any]:
    """Scored breakdown + trade math + an LLM 'why' for a single ticker."""
    pick = await _compute(ticker)
    if explain and pick.get("price"):
        pick["reason"] = await _llm_reason(pick)
    return pick


_MAX_CONCURRENCY = 4  # bound data-provider fan-out to stay under rate limits


async def rank(tickers: list[str], limit: int | None = None) -> dict[str, Any]:
    """Score tickers (bounded concurrency), sort, optionally keep top `limit`, then
    LLM-explain the resulting ranking."""
    clean = list(dict.fromkeys(t.strip().upper() for t in tickers if t and t.strip()))
    if not clean:
        return {"picks": [], "summary": ""}

    sem = asyncio.Semaphore(_MAX_CONCURRENCY)

    async def _guarded(t: str):
        async with sem:
            return await _compute(t)

    results = await asyncio.gather(*(_guarded(t) for t in clean), return_exceptions=True)
    picks = [r for r in results if isinstance(r, dict) and r.get("price")]
    picks.sort(key=lambda r: r["score"], reverse=True)
    if limit:
        picks = picks[:limit]

    reasons, summary = await _rank_reasons(picks)
    for p in picks:
        p["reason"] = reasons.get(p["ticker"], "")
    return {"picks": picks, "summary": summary}


async def top(region: str = "global", limit: int = 10) -> dict[str, Any]:
    """Scan a built-in universe for a region and return the top-N scored picks."""
    from utils.markets import SCREENER_UNIVERSE

    universe = SCREENER_UNIVERSE.get(region.lower(), SCREENER_UNIVERSE["global"])
    result = await rank(universe, limit=limit)
    result["region"] = region.lower()
    return result
