"""
portfolio-mcp — position store plus live valuation.

Positions themselves are held in memory (swap for Supabase later), but every read
is enriched with a live quote so the UI can show market value, unrealised P&L and
today's move — the store on its own only knows what you paid.

Totals are grouped BY CURRENCY. Summing an INR holding and a USD holding into one
number would be meaningless, and there is no FX conversion in this project.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from mcp_servers import market_data_mcp

_store: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)


async def get_positions(user_id: str) -> list[dict[str, Any]]:
    """Raw stored positions, no market data."""
    return list(_store.get(user_id, {}).values())


async def add_position(user_id: str, ticker: str, qty: float, avg_price: float) -> dict[str, Any]:
    pos = {
        "ticker": ticker.upper(),
        "qty": qty,
        "avg_price": avg_price,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    _store[user_id][ticker.upper()] = pos
    return pos


async def remove_position(user_id: str, ticker: str) -> bool:
    return _store[user_id].pop(ticker.upper(), None) is not None


def _value(pos: dict[str, Any], quote: dict[str, Any]) -> dict[str, Any]:
    """Combine a stored position with a live quote into a valued row."""
    qty = pos["qty"]
    avg = pos["avg_price"]
    cost = qty * avg
    price = quote.get("price")

    row = {
        **pos,
        "cost_basis": round(cost, 2),
        "price": price,
        "currency": quote.get("currency", "USD"),
        "currency_symbol": quote.get("currency_symbol", ""),
        "exchange": quote.get("exchange"),
        "change_pct": quote.get("change_pct"),
    }
    if price is None:
        # Quote unavailable (bad symbol / rate limited) — show cost only, don't guess.
        row.update(market_value=None, pnl=None, pnl_pct=None, day_pnl=None, priced=False)
        return row

    market_value = qty * price
    pnl = market_value - cost
    row.update(
        market_value=round(market_value, 2),
        pnl=round(pnl, 2),
        pnl_pct=round((pnl / cost * 100), 2) if cost else None,
        day_pnl=round(qty * quote["change"], 2) if quote.get("change") is not None else None,
        priced=True,
    )
    return row


async def get_portfolio(user_id: str) -> list[dict[str, Any]]:
    """Positions enriched with live price, market value and unrealised P&L."""
    positions = list(_store.get(user_id, {}).values())
    if not positions:
        return []
    quotes = await asyncio.gather(
        *(market_data_mcp.get_quote(p["ticker"]) for p in positions),
        return_exceptions=True,
    )
    return [
        _value(p, q if isinstance(q, dict) else {})
        for p, q in zip(positions, quotes)
    ]


async def get_portfolio_stats(user_id: str) -> dict[str, Any]:
    """Totals per currency, so mixed-currency portfolios stay honest."""
    rows = await get_portfolio(user_id)
    buckets: dict[str, dict[str, Any]] = {}

    for r in rows:
        cur = r.get("currency") or "USD"
        b = buckets.setdefault(cur, {
            "currency": cur,
            "currency_symbol": r.get("currency_symbol", ""),
            "positions": 0,
            "cost_basis": 0.0,
            "market_value": 0.0,
            "day_pnl": 0.0,
            "priced_positions": 0,
        })
        b["positions"] += 1
        b["cost_basis"] += r["cost_basis"]
        if r.get("priced"):
            b["priced_positions"] += 1
            b["market_value"] += r["market_value"]
            b["day_pnl"] += r.get("day_pnl") or 0.0

    totals = []
    for b in buckets.values():
        # Only compare against the cost of positions we could actually price.
        pnl = b["market_value"] - b["cost_basis"] if b["priced_positions"] == b["positions"] else None
        totals.append({
            **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in b.items()},
            "pnl": round(pnl, 2) if pnl is not None else None,
            "pnl_pct": round(pnl / b["cost_basis"] * 100, 2) if pnl is not None and b["cost_basis"] else None,
        })

    return {"positions": len(rows), "totals": totals}
