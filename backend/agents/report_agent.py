"""ReportAgent — senior analyst that synthesizes the four analyst sections."""
from __future__ import annotations

import re
from typing import Any

from utils.llm import llm

SYSTEM = """You are a senior portfolio analyst. You have received research from four analysts:
a fundamental researcher, a technical analyst, a sentiment analyst, and a risk analyst.

Synthesize their findings into a single coherent report with EXACTLY these sections,
each introduced by its heading on its own line:

EXECUTIVE SUMMARY
(3-4 sentences: what is this company/asset, and the overall takeaway)

INVESTMENT THESIS
(the bull case in plain language)

KEY RISKS
(the bear case in plain language)

TECHNICAL SETUP
(entry zone, stop, target — only if the technical data supports a setup; else say "No clean setup")

WATCHPOINTS
(specific price levels, upcoming events, data to monitor)

VERDICT: <one of: STRONG BUY | BUY | HOLD | SELL | STRONG SELL>
(one paragraph of clear reasoning for the verdict)

Rules:
- Resolve conflicts between analysts explicitly (e.g. "fundamentals strong but technicals weak").
- This is informational analysis, NOT financial advice. Do not promise returns.
- The VERDICT line MUST start with the literal word VERDICT: followed by one of the five labels."""

_VERDICTS = ["STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"]


def _parse_verdict(text: str) -> str:
    m = re.search(r"VERDICT:\s*\**\s*(STRONG BUY|STRONG SELL|BUY|SELL|HOLD)", text, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    # fallback: scan for any verdict token
    upper = text.upper()
    for v in _VERDICTS:
        if v in upper:
            return v
    return "HOLD"


async def synthesize(ticker: str, sections: list[dict[str, Any]]) -> dict[str, Any]:
    context = "\n\n".join(
        f"=== {s['agent']} ({s['role']}) ===\n{s['output']}" for s in sections
    )
    prompt = (
        f"Ticker: {ticker.upper()}\n\n"
        f"The four analyst reports follow. Synthesize them into the final report.\n\n"
        f"{context}"
    )
    text = await llm.complete(
        prompt, system=SYSTEM, tier="report", max_tokens=1400, temperature=0.3
    )
    return {"ticker": ticker.upper(), "report": text, "verdict": _parse_verdict(text)}
