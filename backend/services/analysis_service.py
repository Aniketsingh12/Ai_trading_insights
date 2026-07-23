"""Quick analysis — single LLM call combining quote + indicators + news headlines."""
from __future__ import annotations

from typing import Any

from mcp_servers import market_data_mcp, news_mcp
from utils.llm import llm

SYSTEM = """You are a precise equity analyst. Given current market data for a ticker,
produce a tight, factual analysis. Be concrete: cite numbers, name levels.
Never give financial advice — present analysis only. Output structured sections:
SENTIMENT (BULLISH/NEUTRAL/BEARISH), SUMMARY (3-4 lines), KEY LEVELS (support/resistance),
WATCHPOINTS (next catalysts).
"""


async def quick_analysis(ticker: str) -> dict[str, Any]:
    quote = await market_data_mcp.get_quote(ticker)
    indicators = await market_data_mcp.get_indicators(ticker, ["rsi", "macd", "sma50", "sma200"])
    range52 = await market_data_mcp.get_52week(ticker)
    news = await news_mcp.get_news(ticker, limit=5)
    headlines = "\n".join(f"- {n['title']}" for n in news[:5])

    prompt = f"""Ticker: {ticker.upper()}

QUOTE: {quote}

INDICATORS: {indicators}

52-WEEK RANGE: {range52}

RECENT HEADLINES:
{headlines or '(none)'}

Produce the structured analysis now."""

    text = await llm.complete(prompt, system=SYSTEM, tier="quick", max_tokens=600)

    return {
        "ticker": ticker.upper(),
        "quote": quote,
        "indicators": indicators,
        "range_52w": range52,
        "news_count": len(news),
        "analysis": text,
    }
