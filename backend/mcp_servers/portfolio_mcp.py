"""portfolio-mcp — In-memory portfolio store. Swap for Supabase later."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

_store: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)


async def get_portfolio(user_id: str) -> list[dict[str, Any]]:
    return list(_store.get(user_id, {}).values())


async def add_position(user_id: str, ticker: str, qty: float, avg_price: float) -> dict[str, Any]:
    pos = {"ticker": ticker.upper(), "qty": qty, "avg_price": avg_price}
    _store[user_id][ticker.upper()] = pos
    return pos


async def remove_position(user_id: str, ticker: str) -> bool:
    return _store[user_id].pop(ticker.upper(), None) is not None


async def get_portfolio_stats(user_id: str) -> dict[str, Any]:
    positions = list(_store.get(user_id, {}).values())
    total_cost = sum(p["qty"] * p["avg_price"] for p in positions)
    return {"positions": len(positions), "total_cost_basis": round(total_cost, 2)}
