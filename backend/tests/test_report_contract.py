"""
The report tier's output contract.

The synthesis call is the only LLM output the code *parses* rather than just
displays: a regex pulls the verdict out, and the six section headings drive how
AiText renders it. That makes it the risky place to swap in a cheaper model —
a weaker model that stops emitting the format doesn't error, it silently
degrades every report to the HOLD fallback.

These tests pin the two halves together so the contract can't drift unnoticed.
"""
from __future__ import annotations

import pytest

from agents.report_agent import REQUIRED_SECTIONS, SYSTEM, _parse_verdict, parse_verdict


def test_every_required_section_is_actually_demanded_by_the_prompt():
    """
    REQUIRED_SECTIONS is what the eval script scores a candidate model against,
    and what the UI expects to render. If a section is listed here but no longer
    asked for in the prompt, every model would be failed for omitting something
    it was never told to write.
    """
    for section in REQUIRED_SECTIONS:
        assert section in SYSTEM, (
            f"'{section}' is in REQUIRED_SECTIONS but no longer appears in the report "
            f"prompt — update one or the other in agents/report_agent.py."
        )


def test_prompt_still_demands_a_parseable_verdict_line():
    assert "VERDICT:" in SYSTEM


@pytest.mark.parametrize("text,expected", [
    ("VERDICT: BUY\nReasoning follows.", "BUY"),
    ("**VERDICT: STRONG BUY**", "STRONG BUY"),          # markdown-wrapped
    ("verdict:  strong sell  ", "STRONG SELL"),          # lowercase + padding
    ("VERDICT: HOLD", "HOLD"),
])
def test_verdict_parses_the_shapes_models_actually_emit(text, expected):
    assert _parse_verdict(text) == expected


def test_unparseable_output_falls_back_to_hold():
    """
    A model that ignores the format must not be read as bullish or bearish.
    HOLD is the safe default.
    """
    assert _parse_verdict("Here is a report with no verdict line at all.") == "HOLD"


@pytest.mark.parametrize("text,expected_source", [
    ("VERDICT: BUY\nBecause…", "explicit"),
    ("**VERDICT: HOLD**", "explicit"),
    ("On balance we would HOLD this position.", "scanned"),
    ("A report with no verdict word anywhere.", "fallback"),
])
def test_verdict_source_distinguishes_a_real_call_from_the_default(text, expected_source):
    """
    The whole safety net for running a cheaper report model. Without this, a
    model that stops emitting 'VERDICT:' returns plain 'HOLD' and looks like a
    considered neutral call rather than a formatting failure.
    """
    assert parse_verdict(text)[1] == expected_source


def test_a_real_hold_is_not_confused_with_the_fallback():
    verdict_a, source_a = parse_verdict("VERDICT: HOLD\nValuation is full.")
    verdict_b, source_b = parse_verdict("No verdict here.")
    assert (verdict_a, verdict_b) == ("HOLD", "HOLD")   # identical verdicts…
    assert source_a != source_b                          # …but distinguishable


def test_strong_buy_is_not_truncated_to_buy():
    """
    'BUY' is a substring of 'STRONG BUY'. An ordering bug in the alternation
    would downgrade every strongest call to a plain BUY.
    """
    assert _parse_verdict("VERDICT: STRONG BUY") == "STRONG BUY"
    assert _parse_verdict("VERDICT: STRONG SELL") == "STRONG SELL"
