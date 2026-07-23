"""TechnicalAgent — technical analyst. Tools: market-data-mcp."""
from __future__ import annotations

from typing import Any

from agents.base import Agent
from mcp_servers import market_data_mcp

SYSTEM = """You are a technical analyst. Analyze the price, indicator, and range data provided.
Identify:
1. Primary trend (uptrend / downtrend / sideways) with evidence
2. Key support and resistance levels (exact price levels)
3. Current momentum (RSI, MACD reading and implication)
4. Notable chart context (position vs SMA50/SMA200, distance from 52w high/low)
5. Volume context if available
6. Suggested trade setup: entry zone, stop loss level, target levels

Be precise. Give specific price levels, not vague descriptions.
Never guarantee outcomes — state levels and probabilities."""


class TechnicalAgent(Agent):
    name = "TechnicalAgent"
    role = "Technical analyst"
    system_prompt = SYSTEM
    tier = "agent"

    async def gather(self, ticker: str) -> dict[str, Any]:
        quote = await market_data_mcp.get_quote(ticker)
        indicators = await market_data_mcp.get_indicators(
            ticker, ["rsi", "macd", "sma50", "sma200"]
        )
        range52 = await market_data_mcp.get_52week(ticker)
        # last 30 daily closes for trend context
        candles = await market_data_mcp.get_ohlcv(ticker, "1d", 45)
        recent = [{"date": c["date"], "close": c["close"], "volume": c["volume"]} for c in candles[-30:]]
        return {
            "quote": quote,
            "indicators": indicators,
            "range_52w": range52,
            "recent_closes_30d": recent,
        }
