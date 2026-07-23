"""RiskAgent — risk analyst. Tools: market-data-mcp (volatility), fundamentals-mcp, options-flow-mcp."""
from __future__ import annotations

import statistics
from typing import Any

from agents.base import Agent
from mcp_servers import fundamentals_mcp, market_data_mcp, options_flow_mcp

SYSTEM = """You are a risk analyst. Identify threats and catalysts for this asset. Cover:
1. Upcoming catalysts: earnings, product launches, regulatory decisions (if indicated by data)
2. Macro risks: sensitivity to rate changes, inflation, sector rotation
3. Volatility: the realized volatility figure given and what it implies for expected move
4. Options-implied risk: put/call ratio, any skew
5. Key risk events to watch in the next 30 days

Quantify where possible. "Realized 30d volatility of 42% implies a ~±X% monthly move"
is better than "it is volatile". Cite the numbers provided."""


class RiskAgent(Agent):
    name = "RiskAgent"
    role = "Risk analyst"
    system_prompt = SYSTEM
    tier = "agent"

    async def gather(self, ticker: str) -> dict[str, Any]:
        candles = await market_data_mcp.get_ohlcv(ticker, "1d", 90)
        vol = self._realized_volatility(candles)
        ratios = await fundamentals_mcp.get_ratios(ticker)
        put_call = await options_flow_mcp.get_put_call_ratio(ticker)
        beta = ratios.get("beta") if isinstance(ratios, dict) else None
        return {
            "realized_volatility_30d_annualized_pct": vol,
            "beta": beta,
            "put_call_ratio": put_call,
            "valuation_context": ratios,
        }

    @staticmethod
    def _realized_volatility(candles: list[dict[str, Any]]) -> float | None:
        closes = [c["close"] for c in candles if c.get("close")]
        if len(closes) < 21:
            return None
        rets = [
            (closes[i] - closes[i - 1]) / closes[i - 1]
            for i in range(1, len(closes))
            if closes[i - 1]
        ]
        window = rets[-30:]
        if len(window) < 2:
            return None
        daily_std = statistics.pstdev(window)
        return round(daily_std * (252 ** 0.5) * 100, 2)  # annualized %
