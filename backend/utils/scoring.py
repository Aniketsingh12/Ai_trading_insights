"""
Transparent scoring engine — deterministic math for trade metrics and ranking.

Everything here is pure Python (no LLM): every number a user sees in "Top Picks"
or the risk/reward panel is computed from real market data with a stated formula,
and each scoring component returns its own reason string so the UI can show the
"why" behind a rank. This keeps rankings fast, free, reproducible, and auditable.

NOTE: informational analysis only, NOT financial advice. Targets/stops are derived
from historical support/resistance and volatility — they are scenarios, not promises.
"""
from __future__ import annotations

import math
from typing import Any


# ─────────────────── indicators from a single series ───────────────────
# Deriving everything from ONE price history (instead of 3 separate downloads)
# keeps the screener light on the data provider and avoids rate-limit (429) bursts.
def _ema(values: list[float], span: int) -> list[float]:
    if not values:
        return []
    k = 2 / (span + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def indicators_from_closes(closes: list[float]) -> dict[str, float | None]:
    """RSI(14), MACD histogram, SMA50, SMA200, last close — pure Python."""
    closes = [c for c in closes if c]
    out: dict[str, float | None] = {
        "rsi": None, "macd_hist": None, "sma50": None, "sma200": None,
        "last_close": round(closes[-1], 2) if closes else None,
    }
    if len(closes) >= 15:
        deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
        gains = [max(d, 0) for d in deltas][-14:]
        losses = [max(-d, 0) for d in deltas][-14:]
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        if avg_loss == 0:
            out["rsi"] = 100.0 if avg_gain > 0 else 50.0
        else:
            rs = avg_gain / avg_loss
            out["rsi"] = round(100 - 100 / (1 + rs), 2)
    if len(closes) >= 26:
        ema12 = _ema(closes, 12)
        ema26 = _ema(closes, 26)
        macd_line = [a - b for a, b in zip(ema12, ema26)]
        signal = _ema(macd_line, 9)
        out["macd_hist"] = round(macd_line[-1] - signal[-1], 4)
    if len(closes) >= 50:
        out["sma50"] = round(sum(closes[-50:]) / 50, 2)
    if len(closes) >= 200:
        out["sma200"] = round(sum(closes[-200:]) / 200, 2)
    return out


def range_52w_from_candles(candles: list[dict]) -> dict[str, float | None]:
    """52-week high/low + % distance from each, from a candle list."""
    highs = [c["high"] for c in candles if c.get("high") is not None]
    lows = [c["low"] for c in candles if c.get("low") is not None]
    closes = [c["close"] for c in candles if c.get("close") is not None]
    if not highs or not lows or not closes:
        return {"high_52w": None, "low_52w": None, "current": None}
    hi, lo, last = max(highs), min(lows), closes[-1]
    return {
        "high_52w": round(hi, 2),
        "low_52w": round(lo, 2),
        "current": round(last, 2),
        "pct_from_high": round((last - hi) / hi * 100, 2) if hi else None,
        "pct_from_low": round((last - lo) / lo * 100, 2) if lo else None,
    }


# ─────────────────────────── volatility ───────────────────────────
def realized_volatility(closes: list[float], window: int = 30) -> float | None:
    """Annualized realized volatility (%) from daily closes.

    σ_daily = stdev(daily returns over `window`)
    σ_annual = σ_daily * √252   (252 trading days/yr)  → ×100 for percent
    """
    closes = [c for c in closes if c]
    if len(closes) < window // 2:
        return None
    rets = [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes))
        if closes[i - 1]
    ]
    win = rets[-window:]
    if len(win) < 2:
        return None
    mean = sum(win) / len(win)
    var = sum((r - mean) ** 2 for r in win) / len(win)  # population variance
    daily_std = math.sqrt(var)
    return round(daily_std * math.sqrt(252) * 100, 2)


def expected_monthly_move(vol_annual: float | None) -> float | None:
    """Expected ±% move over ~1 month:  σ_annual / √12."""
    if vol_annual is None:
        return None
    return round(vol_annual / math.sqrt(12), 2)


# ─────────────────────────── trade metrics ───────────────────────────
def trade_metrics(
    price: float | None,
    sma50: float | None,
    sma200: float | None,
    high_52w: float | None,
    low_52w: float | None,
    vol_annual: float | None,
) -> dict[str, Any]:
    """Derive entry / target / stop / upside / downside / risk-reward.

    Target  = nearest resistance above price (52-week high). If price is already at
              a new high, project one expected-monthly-move higher (breakout case).
    Stop    = nearest support below price (highest of SMA50/SMA200/52w-low that sits
              under price) — the level a trade would be invalidated at.
    Upside% = (target - price) / price * 100
    Down%   = (price - stop)  / price * 100
    R:R     = upside% / downside%   (reward earned per unit of risk taken)
    """
    if not price:
        return {"error": "no price"}

    monthly = expected_monthly_move(vol_annual)

    # nearest support strictly below price
    supports = [lvl for lvl in (sma50, sma200, low_52w) if lvl and lvl < price]
    stop = max(supports) if supports else (low_52w or price * 0.92)

    # nearest resistance above price
    if high_52w and high_52w > price:
        target = high_52w
        target_basis = "52-week high (resistance)"
    else:
        bump = (monthly or 8.0) / 100
        target = round(price * (1 + bump), 2)
        target_basis = "at new highs — projected +1 monthly move"

    upside_pct = round((target - price) / price * 100, 2)
    downside_pct = round((price - stop) / price * 100, 2)
    risk_reward = (
        round(upside_pct / downside_pct, 2) if downside_pct and downside_pct > 0 else None
    )

    return {
        "entry": round(price, 2),
        "target": round(target, 2),
        "target_basis": target_basis,
        "stop": round(stop, 2),
        "stop_basis": "nearest support below price (SMA/52w-low)",
        "upside_pct": upside_pct,
        "downside_pct": downside_pct,
        "risk_reward": risk_reward,
        "expected_monthly_move_pct": monthly,
    }


# ─────────────────────────── composite score ───────────────────────────
def _trend_points(price, sma50, sma200) -> tuple[float, float, str]:
    """Max 30 — where price sits relative to its moving averages."""
    if sma50 and sma200:
        if price > sma50 > sma200:
            return 30, 30, "Full uptrend — price > SMA50 > SMA200"
        if price > sma50 and price > sma200:
            return 24, 30, "Above both SMAs (50 & 200)"
        if price > sma200:
            return 16, 30, "Above SMA200 but below SMA50 (cooling)"
        if price > sma50:
            return 12, 30, "Above SMA50 but below SMA200 (early)"
        return 5, 30, "Downtrend — below both SMAs"
    if sma50:
        return (22, 30, "Above SMA50") if price > sma50 else (8, 30, "Below SMA50")
    return 15, 30, "Insufficient history for trend"


def _momentum_points(rsi, macd_hist) -> tuple[float, float, str]:
    """Max 25 — RSI (15) + MACD histogram (10)."""
    pts, bits = 0.0, []
    if rsi is not None:
        if 55 <= rsi <= 68:
            pts += 15; bits.append(f"RSI {rsi} healthy-bullish")
        elif 68 < rsi <= 78:
            pts += 11; bits.append(f"RSI {rsi} strong, nearing overbought")
        elif 45 <= rsi < 55:
            pts += 10; bits.append(f"RSI {rsi} neutral")
        elif 35 <= rsi < 45:
            pts += 7; bits.append(f"RSI {rsi} soft")
        elif rsi > 78:
            pts += 6; bits.append(f"RSI {rsi} overbought (pullback risk)")
        else:
            pts += 9; bits.append(f"RSI {rsi} oversold (bounce potential)")
    else:
        pts += 7; bits.append("RSI n/a")
    if macd_hist is not None:
        if macd_hist > 0:
            pts += 10; bits.append("MACD histogram positive (bullish)")
        else:
            pts += 3; bits.append("MACD histogram negative (bearish)")
    else:
        pts += 5; bits.append("MACD n/a")
    return pts, 25, "; ".join(bits)


def _rr_points(risk_reward) -> tuple[float, float, str]:
    """Max 25 — reward per unit of risk."""
    if risk_reward is None:
        return 8, 25, "Risk/reward n/a"
    if risk_reward >= 3:
        return 25, 25, f"Excellent R:R {risk_reward}:1"
    if risk_reward >= 2:
        return 20, 25, f"Strong R:R {risk_reward}:1"
    if risk_reward >= 1.5:
        return 14, 25, f"Fair R:R {risk_reward}:1"
    if risk_reward >= 1:
        return 8, 25, f"Thin R:R {risk_reward}:1"
    return 3, 25, f"Poor R:R {risk_reward}:1 (more risk than reward)"


def _sentiment_points(st_ratio) -> tuple[float, float, str]:
    """Max 20 — Stocktwits bullish/bearish message ratio."""
    if st_ratio is None:
        return 10, 20, "No social data (neutral)"
    if st_ratio >= 2:
        return 20, 20, f"Stocktwits {st_ratio}x bullish"
    if st_ratio >= 1.3:
        return 15, 20, f"Stocktwits {st_ratio}x lean bullish"
    if st_ratio >= 0.8:
        return 10, 20, f"Stocktwits {st_ratio}x balanced"
    if st_ratio >= 0.5:
        return 6, 20, f"Stocktwits {st_ratio}x lean bearish"
    return 3, 20, f"Stocktwits {st_ratio}x bearish crowd"


def _label(total: float) -> str:
    if total >= 75:
        return "STRONG BUY"
    if total >= 60:
        return "BUY"
    if total >= 42:
        return "HOLD"
    if total >= 28:
        return "SELL"
    return "STRONG SELL"


def score(
    *,
    price: float | None,
    rsi: float | None,
    macd_hist: float | None,
    sma50: float | None,
    sma200: float | None,
    risk_reward: float | None,
    stocktwits_ratio: float | None,
) -> dict[str, Any]:
    """Composite 0–100 score with a per-component breakdown (points/max + reason)."""
    if not price:
        return {"total": 0, "label": "STRONG SELL", "breakdown": [], "error": "no price"}

    components = [
        ("Trend", *_trend_points(price, sma50, sma200)),
        ("Momentum", *_momentum_points(rsi, macd_hist)),
        ("Risk/Reward", *_rr_points(risk_reward)),
        ("Sentiment", *_sentiment_points(stocktwits_ratio)),
    ]
    total = round(sum(c[1] for c in components), 1)
    breakdown = [
        {"factor": name, "points": round(pts, 1), "max": mx, "reason": reason}
        for (name, pts, mx, reason) in components
    ]
    return {"total": total, "label": _label(total), "breakdown": breakdown}
