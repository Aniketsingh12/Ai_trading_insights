"""ReportAgent — senior analyst that synthesizes the four analyst sections."""
from __future__ import annotations

import logging
import re
from typing import Any, Literal

from config import settings
from utils.llm import llm

# The headings the prompt demands and the UI renders. Also what
# scripts/eval_report_model.py scores a candidate model against — a test pins
# the two lists together so they cannot drift apart.
REQUIRED_SECTIONS = [
    "EXECUTIVE SUMMARY",
    "INVESTMENT THESIS",
    "KEY RISKS",
    "TECHNICAL SETUP",
    "WATCHPOINTS",
]

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

log = logging.getLogger("marketmind.report")

# How the verdict was obtained, worst to best:
#   explicit — the model emitted a literal "VERDICT: X" line, as instructed
#   scanned  — no such line, but a verdict word appeared somewhere in the prose
#   fallback — nothing found; HOLD is a default, not an opinion
Source = Literal["explicit", "scanned", "fallback"]


def parse_verdict(text: str) -> tuple[str, Source]:
    """
    Read the verdict and report how confidently it was read.

    This distinction is what makes it safe to run the report tier on a cheaper
    model. A weaker model that stops following the format doesn't fail loudly —
    it just stops emitting "VERDICT:", and a bare `-> "HOLD"` would present that
    as a considered neutral call. Surfacing the source turns a silent quality
    regression into something visible in the logs and the API response.
    """
    m = re.search(r"VERDICT:\s*\**\s*(STRONG BUY|STRONG SELL|BUY|SELL|HOLD)", text, re.IGNORECASE)
    if m:
        return m.group(1).upper(), "explicit"
    upper = text.upper()
    for v in _VERDICTS:
        if v in upper:
            return v, "scanned"
    return "HOLD", "fallback"


def _parse_verdict(text: str) -> str:
    """Verdict only. Kept for callers that don't care how it was derived."""
    return parse_verdict(text)[0]


def _missing_sections(text: str) -> list[str]:
    upper = text.upper()
    return [s for s in REQUIRED_SECTIONS if s not in upper]


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

    verdict, source = parse_verdict(text)
    missing = _missing_sections(text)

    # The point of failure worth catching: a cheaper report model that quietly
    # stops following the format. Neither of these raises, so say so out loud.
    if source != "explicit" or missing:
        log.warning(
            "Report model %s produced a degraded report for %s "
            "(verdict source=%s, missing sections=%s). If this persists, that model "
            "is not following the format — see scripts/eval_report_model.py.",
            settings.together_model_report, ticker.upper(), source, missing or "none",
        )

    return {
        "ticker": ticker.upper(),
        "report": text,
        "verdict": verdict,
        "verdict_source": source,
        "missing_sections": missing,
    }
