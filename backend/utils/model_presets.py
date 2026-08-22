"""
Selectable model presets.

The demo lets a visitor choose how much model they want behind a run. Three
options, and the split is about who pays rather than who is allowed:

  free      costs nothing to serve, so it draws nothing from any allowance.
            A visitor can run it all day; only the burst limiter applies.
  standard  the app's configured tiers — what the deployment actually pays for,
            and therefore what the visitor allowance meters.
  premium   flagship synthesis. Owner-only on a public demo, because one run
            costs several times a standard one.

A preset sets all three tiers at once rather than exposing a raw model list: a
visitor picking "which model writes the verdict" is a meaningless question, but
"how good do you want this to be" is not.

Model IDs verified against together.ai/pricing.
"""
from __future__ import annotations

from dataclasses import dataclass

from config import settings

"""Model ids come from settings, never from a hardcoded list here, so any
   Together model can be tried by editing .env alone."""


@dataclass(frozen=True)
class Preset:
    id: str
    label: str
    blurb: str
    # Multiplier on a call's allowance cost. 0 means "spends no money", which is
    # what makes the free option genuinely unlimited rather than just cheaper.
    cost_units: int
    owner_only: bool
    price_hint: str
    # Name of the setting holding this preset's model, or None for "use the
    # deployment's own per-tier config". Read at call time, not import time, so
    # editing .env is enough to try a different model.
    _setting: str | None = None

    def model_for(self, tier: str) -> str:
        if self._setting is None:
            return {
                "quick": settings.together_model_quick,
                "agent": settings.together_model_agent,
                "report": settings.together_model_report,
            }[tier]
        override = getattr(settings, self._setting, "").strip()
        if not override:                       # blank = fall back to configured
            return Preset(self.id, "", "", 0, False, "").model_for(tier)
        # A single-model preset runs every tier on that one model.
        return override

    @property
    def configured(self) -> bool:
        """False when its setting is blank — the option is then not offered."""
        return self._setting is None or bool(getattr(settings, self._setting, "").strip())


PRESETS: dict[str, Preset] = {
    "free": Preset(
        id="free",
        label="Free",
        blurb="Costs nothing to run. Plainer wording, and the same underlying maths.",
        cost_units=0,
        owner_only=False,
        price_hint="$0",
        _setting="together_model_free",
    ),
    "standard": Preset(
        id="standard",
        label="Standard",
        blurb="Balanced tiers — cheap models for the analysts, a larger one for the verdict.",
        cost_units=1,
        owner_only=False,
        price_hint="~$0.004 / deep run",
    ),
    "premium": Preset(
        id="premium",
        label="Premium",
        blurb="One flagship model across every step. Reserved for the owner on this demo.",
        cost_units=3,
        owner_only=True,
        price_hint="~$0.011 / deep run",
        _setting="together_model_premium",
    ),
}

DEFAULT_PRESET = "standard"


def get(name: str | None) -> Preset:
    """Resolve a preset id, falling back to the default for anything unknown."""
    return PRESETS.get((name or "").lower().strip(), PRESETS[DEFAULT_PRESET])


def allowed(name: str | None, is_owner: bool) -> bool:
    preset = PRESETS.get((name or "").lower().strip())
    if preset is None:
        return False
    return is_owner or not preset.owner_only


TIERS = ("quick", "agent", "report")


def _resolved(p: Preset) -> dict[str, str]:
    return {tier: p.model_for(tier) for tier in TIERS}


def is_redundant(p: Preset) -> bool:
    """
    True when a preset resolves to exactly the same models as the default.

    `standard` follows the deployment's TOGETHER_MODEL_* settings, so a
    deployment configured to use the flagship for its report tier makes
    `premium` identical to it. Offering that as a locked upgrade would be a
    straight lie to the visitor, so it gets dropped from the catalogue instead.
    """
    if p.id == DEFAULT_PRESET:
        return False
    return _resolved(p) == _resolved(PRESETS[DEFAULT_PRESET])


def listing(is_owner: bool) -> list[dict]:
    """The catalogue the UI renders, with `locked` resolved for this caller."""
    return [
        {
            "id": p.id,
            "label": p.label,
            "blurb": p.blurb,
            "price_hint": p.price_hint,
            "free": p.cost_units == 0,
            "locked": p.owner_only and not is_owner,
            "models": _resolved(p),
        }
        for p in PRESETS.values()
        if p.configured and not is_redundant(p)
    ]
