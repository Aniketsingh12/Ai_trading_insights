"""
Crew — orchestrates the 5-agent deep research run.

Flow (mirrors the guide's hierarchical CrewAI process):
  ResearchAgent ┐
  TechnicalAgent├─ run concurrently (independent data domains)
  SentimentAgent│
  RiskAgent     ┘
        │  all four outputs collected
        ▼
  ReportAgent (manager) ── synthesizes → structured report + verdict

`progress_cb` is an optional callback invoked as each agent starts/finishes so the
API/UI can show live status without WebSockets.
"""
from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable

from agents import report_agent
from agents.research_agent import ResearchAgent
from agents.risk_agent import RiskAgent
from agents.sentiment_agent import SentimentAgent
from agents.technical_agent import TechnicalAgent

ProgressCb = Callable[[str, str], Awaitable[None]] | None  # (agent_name, status)

ANALYSTS = [ResearchAgent(), TechnicalAgent(), SentimentAgent(), RiskAgent()]
AGENT_NAMES = [a.name for a in ANALYSTS] + ["ReportAgent"]


async def run_deep_research(ticker: str, progress_cb: ProgressCb = None) -> dict[str, Any]:
    async def _notify(name: str, status: str) -> None:
        if progress_cb:
            await progress_cb(name, status)

    async def _run_analyst(agent) -> dict[str, Any]:
        await _notify(agent.name, "running")
        try:
            result = await agent.run(ticker)
            await _notify(agent.name, "done")
            return result
        except Exception as e:  # one analyst failing shouldn't kill the whole report
            await _notify(agent.name, "error")
            return {
                "agent": agent.name,
                "role": agent.role,
                "output": f"(unavailable: {e})",
                "data": {},
            }

    sections = await asyncio.gather(*(_run_analyst(a) for a in ANALYSTS))

    await _notify("ReportAgent", "running")
    synthesis = await report_agent.synthesize(ticker, list(sections))
    await _notify("ReportAgent", "done")

    return {
        "ticker": ticker.upper(),
        "sections": list(sections),
        "report": synthesis["report"],
        "verdict": synthesis["verdict"],
    }
