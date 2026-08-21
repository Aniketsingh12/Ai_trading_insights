"""
Compare candidate models for the `report` tier — the one expensive call.

One synthesis call is ~85% of a deep-research run's cost, so it's the obvious
thing to make cheaper. It is also the only call whose output is *parsed*: the
verdict is pulled out with a regex and the six section headings drive the UI.
A cheaper model that quietly stops emitting "VERDICT:" doesn't error — it just
silently degrades every report to the "HOLD" fallback.

So measure instead of guessing. This runs the real prompt from
agents/report_agent.py against each candidate and scores what actually matters.

    cd backend
    .venv/Scripts/python.exe scripts/eval_report_model.py
    .venv/Scripts/python.exe scripts/eval_report_model.py --models deepseek-ai/DeepSeek-V4-Flash-0731

Needs TOGETHER_API_KEY in backend/.env. Each run is a handful of cheap calls.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Imported, not re-declared: if the prompt gains or renames a section, this
# script must score against the new list automatically rather than keep
# approving models that no longer produce a complete report.
from agents.report_agent import REQUIRED_SECTIONS, SYSTEM, parse_verdict  # noqa: E402
from config import settings  # noqa: E402
from utils.llm import LLMClient  # noqa: E402

# Published Together prices, $ per 1M (input, output). Verified against
# together.ai/pricing. A model missing here still runs — its cost prints as "?"
# rather than a misleading $0.
PRICES = {
    "deepseek-ai/DeepSeek-V4-Pro": (1.74, 3.48),
    "deepseek-ai/DeepSeek-V4-Pro-0813": (1.32, 3.96),
    "Qwen/Qwen3.7-Plus": (0.32, 1.28),
    "MiniMaxAI/MiniMax-M3": (0.30, 1.20),
    "thinkingmachines/Inkling-Small": (0.50, 1.20),
    "Qwen/Qwen3.5-9B": (0.17, 0.25),
    "openai/gpt-oss-120b": (0.15, 0.60),
    "deepseek-ai/DeepSeek-V4-Flash-0731": (0.14, 0.28),
    "google/gemma-3n-E4B-it": (0.06, 0.12),
    "openai/gpt-oss-20b": (0.05, 0.20),
    "LiquidAI/LFM2.5-8B-A1B": (0.03, 0.12),
    "Prism-ML/Ternary-Bonsai-27B": (0.0, 0.0),
}

# The shortlist worth spending a few cents to compare, expensive to cheapest.
DEFAULT_CANDIDATES = [
    "deepseek-ai/DeepSeek-V4-Pro",           # the old default — baseline to beat
    "Qwen/Qwen3.7-Plus",                     # 3.8x cheaper, advertises JSON/function calling
    "openai/gpt-oss-120b",                   # current default: 8.2x cheaper
    "deepseek-ai/DeepSeek-V4-Flash-0731",    # 12x cheaper, no structured-output claim
    "Prism-ML/Ternary-Bonsai-27B",           # free tier, reduced rate limits
]

# A realistic stand-in for what the four analysts hand the synthesiser. Kept
# fixed so every model is judged on identical input.
FIXTURE = """Ticker: AAPL

The four analyst reports follow. Synthesize them into the final report.

=== ResearchAgent (Fundamental analyst) ===
Apple earns primarily from iPhone (52% of revenue) with Services at 25% and growing
16% YoY. Gross margin 46.2%, up 120bps. Moat is the hardware/software lock-in and a
2.2bn active device base. Trailing P/E 34.1 vs a 5-year median of 27.8 — richly
valued. Risk: iPhone unit growth is flat; Services growth is carrying the story.

=== TechnicalAgent (Technical analyst) ===
Price 305.93, above SMA50 (291.40) and SMA200 (268.10) — full uptrend. RSI 61.2,
healthy-bullish, not overbought. MACD histogram +1.84, positive. Resistance at the
52-week high 341.20; support at SMA50 291.40. Setup: entry near 305, stop 291,
target 341. Volume is average.

=== SentimentAgent (Sentiment analyst) ===
Stocktwits 1.8x bullish (142 bullish / 79 bearish). Put/call 0.71, leaning bullish.
Headlines are mixed: a services-revenue beat, offset by an EU regulatory probe into
App Store fees. Overall: mildly bullish, but the crowd is less enthusiastic than in
the prior quarter.

=== RiskAgent (Risk analyst) ===
Realized 30d volatility 24.8% annualized, implying a ~±7.2% monthly move. Beta 1.19.
Catalysts: earnings in 3 weeks, EU DMA ruling expected within 30 days. Rate
sensitivity is moderate. The regulatory outcome is the main binary risk.
"""


async def evaluate(model: str, timeout: float) -> dict:
    client = LLMClient(provider="together")
    # Point the report tier at this candidate for the duration of one call.
    original = settings.together_model_report
    settings.together_model_report = model
    started = time.perf_counter()
    try:
        text = await asyncio.wait_for(
            client.complete(FIXTURE, system=SYSTEM, tier="report", max_tokens=1400, temperature=0.3),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        return {"model": model, "error": f"timed out after {timeout:.0f}s"}
    except Exception as e:
        return {"model": model, "error": str(e)[:90]}
    finally:
        settings.together_model_report = original

    elapsed = time.perf_counter() - started
    upper = text.upper()
    found = [s for s in REQUIRED_SECTIONS if s in upper]
    # `source` separates a real HOLD from the silent fallback — the exact
    # failure this script exists to catch.
    verdict, source = parse_verdict(text)
    explicit = source == "explicit"

    # Rough token estimate; adequate for comparing candidates.
    in_tok, out_tok = len(FIXTURE) / 4 + len(SYSTEM) / 4, len(text) / 4
    price = PRICES.get(model)
    # None means "not in the table" — distinct from the free model's real 0.0,
    # so an unlisted model can't masquerade as free in the ranking below.
    cost = None if price is None else (in_tok * price[0] + out_tok * price[1]) / 1_000_000

    return {
        "model": model,
        "verdict": verdict,
        "verdict_source": source,
        "explicit_verdict": explicit,
        "sections": f"{len(found)}/{len(REQUIRED_SECTIONS)}",
        "complete": len(found) == len(REQUIRED_SECTIONS) and explicit,
        "chars": len(text),
        "secs": round(elapsed, 1),
        "cost_per_call": cost,
        "missing": [s for s in REQUIRED_SECTIONS if s not in upper],
    }


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=DEFAULT_CANDIDATES)
    ap.add_argument("--timeout", type=float, default=180.0)
    args = ap.parse_args()

    if not settings.together_api_key:
        print("TOGETHER_API_KEY is not set in backend/.env - nothing to test against.")
        return 1

    print(f"Report-tier prompt, {len(args.models)} candidates, identical input.\n")
    results = []
    for model in args.models:
        # Console output stays ASCII: Windows terminals default to cp1252 and
        # mangle (or choke on) anything else.
        print(f"  running {model} ...", flush=True)
        results.append(await evaluate(model, args.timeout))

    print(f"\n{'model':<40} {'verdict':<12} {'sections':<9} {'chars':>6} {'secs':>5} {'$/call':>10}")
    print("-" * 90)
    for r in results:
        if "error" in r:
            print(f"{r['model']:<40} FAILED - {r['error']}")
            continue
        flag = "ok " if r["complete"] else "!! "
        verdict = r["verdict"] + ("" if r["explicit_verdict"] else "*")
        cost = "?" if r["cost_per_call"] is None else f"{r['cost_per_call']:.6f}"
        print(
            f"{flag}{r['model']:<37} {verdict:<12} {r['sections']:<9} "
            f"{r['chars']:>6} {r['secs']:>5} {cost:>10}"
        )

    print("\n  * = no literal 'VERDICT:' line; the parser inferred or defaulted it.")
    print("  !! = incomplete format; this model would silently degrade every report.")
    for r in results:
        if r.get("missing"):
            print(f"  {r['model']}: missing {', '.join(r['missing'])}")

    # Only rank models we can both trust the format of AND price.
    priced = [r for r in results if r.get("complete") and r.get("cost_per_call") is not None]
    if priced:
        best = min(priced, key=lambda r: r["cost_per_call"])
        base = next(
            (r for r in results if r["model"] == DEFAULT_CANDIDATES[0] and r.get("cost_per_call")),
            None,
        )
        print(f"\nCheapest candidate that kept the full format: {best['model']}")
        if base and best["cost_per_call"] and best["model"] != base["model"]:
            print(
                f"  {base['cost_per_call'] / best['cost_per_call']:.1f}x cheaper per call "
                f"than {base['model']}."
            )
        elif best["cost_per_call"] == 0:
            print("  Free tier - but rate limited, so keep a paid model as the fallback.")
        print(f"  Set TOGETHER_MODEL_REPORT={best['model']}")
    else:
        print("\nNo priced candidate produced a complete report - keep the current model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
