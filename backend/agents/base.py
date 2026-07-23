"""
Base agent for TradeForge deep research.

Design note — why not CrewAI's autonomous tool-calling:
TradeForge must run on BOTH the Claude API and local OSS models (Ollama). Small
OSS models (llama3.1:8b, qwen2.5:7b) have weak/inconsistent function-calling, which
makes CrewAI-style autonomous tool selection unreliable. So instead each agent:
  1. gather()  — deterministically pulls the data it needs from the MCP servers
  2. reason()  — sends that data to the LLM for role-specialised analysis
This is robust across every provider while keeping the 5-agent structure the guide
describes. Each agent maps 1:1 to a CrewAI agent and could be swapped later.
"""
from __future__ import annotations

from typing import Any

from utils.llm import Tier, llm


class Agent:
    name: str = "Agent"
    role: str = ""
    system_prompt: str = ""
    tier: Tier = "agent"

    async def gather(self, ticker: str) -> dict[str, Any]:
        """Pull the raw data this agent reasons over. Override per agent."""
        return {}

    async def reason(self, ticker: str, data: dict[str, Any], context: str = "") -> str:
        """Send gathered data (+ optional upstream context) to the LLM."""
        blocks = "\n\n".join(f"{k.upper()}:\n{v}" for k, v in data.items())
        ctx = f"\n\nUPSTREAM ANALYST FINDINGS:\n{context}" if context else ""
        prompt = (
            f"Ticker under analysis: {ticker.upper()}\n\n"
            f"DATA PROVIDED:\n{blocks}{ctx}\n\n"
            f"Produce your section now. Be specific, cite the numbers above, "
            f"and do not invent data you were not given."
        )
        return await llm.complete(
            prompt, system=self.system_prompt, tier=self.tier, max_tokens=900, temperature=0.3
        )

    async def run(self, ticker: str, context: str = "") -> dict[str, Any]:
        data = await self.gather(ticker)
        output = await self.reason(ticker, data, context)
        return {"agent": self.name, "role": self.role, "output": output, "data": data}
