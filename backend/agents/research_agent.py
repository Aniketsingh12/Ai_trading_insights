"""ResearchAgent — fundamental analyst. Tools: fundamentals-mcp."""
from __future__ import annotations

from typing import Any

from agents.base import Agent
from mcp_servers import fundamentals_mcp

SYSTEM = """You are a fundamental equity analyst. Research the company behind a ticker
and produce a clear, factual summary of:
1. What the company does and how it makes money
2. Competitive position and moat (if any)
3. Recent financial performance (revenue growth, profitability trend)
4. Key risks to the business
5. Any significant recent corporate events

Be specific. Use numbers. Cite the data you were given. Do not speculate.
If a data point is missing, say so plainly rather than guessing."""


class ResearchAgent(Agent):
    name = "ResearchAgent"
    role = "Fundamental analyst"
    system_prompt = SYSTEM
    tier = "agent"

    async def gather(self, ticker: str) -> dict[str, Any]:
        ratios = await fundamentals_mcp.get_ratios(ticker)
        income = await fundamentals_mcp.get_income_statement(ticker, years=4)
        ratings = await fundamentals_mcp.get_analyst_ratings(ticker)
        return {
            "valuation_ratios": ratios,
            "income_statement_4y": income,
            "analyst_ratings": ratings,
        }
