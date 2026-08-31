"""
Daily Market Report — today's index moves, biggest movers, key news, and a
Claude-written briefing tying it together.

Data is assembled deterministically (indices, movers, headlines); only the final
5-bullet briefing is LLM-generated. Movers are drawn from the index baskets plus
any tickers the caller passes (e.g. the user's watchlist) — nothing brand-pinned.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from mcp_servers import market_data_mcp, news_mcp
from utils.llm import llm
from utils.redact import safe_detail

log = logging.getLogger("marketmind.daily")

_BRIEFING_SYSTEM = """You are a markets desk analyst writing a concise pre-market style
briefing. Given index levels, the day's biggest movers, and top headlines, write:

MARKET TONE: one line — risk-on / risk-off / mixed, with the key driver.
Then 5 short bullets covering: index direction, the standout mover and why (use the
headline if relevant), one cross-asset note (gold/crypto/FX), and one thing to watch.

Be factual, cite the numbers you were given, no hype, no price targets. This is
market commentary, NOT financial advice."""


async def _movers(extra_tickers: list[str]) -> dict[str, Any]:
    # Every fan-out here uses return_exceptions so a single bad/rate-limited symbol
    # degrades one row instead of 500-ing the whole report.
    glob, india = await asyncio.gather(
        market_data_mcp.get_indices("global"),
        market_data_mcp.get_indices("india"),
        return_exceptions=True,
    )
    glob = glob if isinstance(glob, list) else []
    india = india if isinstance(india, list) else []
    universe = list(glob) + list(india)

    # enrich with caller-supplied tickers (e.g. watchlist), de-duplicated
    seen = {x["ticker"] for x in universe}
    extra = [t.upper() for t in extra_tickers if t and t.upper() not in seen]
    if extra:
        extra_q = await asyncio.gather(
            *(market_data_mcp.get_quote(t) for t in extra), return_exceptions=True
        )
        for q in extra_q:
            if not isinstance(q, dict):
                continue
            q.setdefault("label", q.get("ticker"))
            universe.append(q)

    with_move = [x for x in universe if x.get("change_pct") is not None]
    with_move.sort(key=lambda x: x["change_pct"], reverse=True)
    gainers = with_move[:5]
    losers = list(reversed(with_move[-5:])) if len(with_move) > 5 else []
    return {"global": glob, "india": india, "gainers": gainers, "losers": losers}


async def build_report(extra_tickers: list[str] | None = None) -> dict[str, Any]:
    movers, news_global, news_india = await asyncio.gather(
        _movers(extra_tickers or []),
        news_mcp.get_market_news("global", 7),
        news_mcp.get_market_news("india", 7),
    )

    def _fmt(items):
        return ", ".join(
            f"{x.get('label', x['ticker'])} {x['change_pct']:+.2f}%" for x in items
        ) or "n/a"

    headlines = [n["title"] for n in news_global[:4]] + [n["title"] for n in news_india[:4]]
    prompt = f"""GLOBAL INDICES: {_fmt(movers['global'])}
INDIAN INDICES: {_fmt(movers['india'])}
TOP GAINERS: {_fmt(movers['gainers'])}
TOP LOSERS: {_fmt(movers['losers'])}

HEADLINES (global + India):
{chr(10).join('- ' + h for h in headlines) or '(none)'}

Write the briefing now."""

    try:
        briefing = await llm.complete(prompt, system=_BRIEFING_SYSTEM, tier="quick", max_tokens=500)
    except Exception as e:
        log.exception("daily briefing failed")
        briefing = f"(briefing unavailable: {safe_detail(e, 'the model is unreachable')})"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "indices": {"global": movers["global"], "india": movers["india"]},
        "gainers": movers["gainers"],
        "losers": movers["losers"],
        "news_global": news_global,
        "news_india": news_india,
        "briefing": briefing,
    }
