import asyncio

from fastapi import APIRouter

from mcp_servers import market_data_mcp

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

# In-memory store. Swap for Supabase later.
_watchlists: dict[str, set[str]] = {}


def _user_id() -> str:
    # TODO: replace with Supabase Auth-derived user id
    return "demo-user"


@router.get("")
async def list_watchlist():
    tickers = sorted(_watchlists.get(_user_id(), set()))
    if not tickers:
        return {"tickers": [], "quotes": []}
    # Fetch concurrently (was a sequential await loop) and let one bad symbol
    # degrade to a priceless row instead of failing the whole list.
    results = await asyncio.gather(
        *(market_data_mcp.get_quote(t) for t in tickers), return_exceptions=True
    )
    quotes = [
        q if isinstance(q, dict) else {"ticker": t, "price": None}
        for q, t in zip(results, tickers)
    ]
    return {"tickers": tickers, "quotes": quotes}


@router.post("/{ticker}")
async def add(ticker: str):
    _watchlists.setdefault(_user_id(), set()).add(ticker.upper())
    return {"ok": True, "ticker": ticker.upper()}


@router.delete("/{ticker}")
async def remove(ticker: str):
    _watchlists.setdefault(_user_id(), set()).discard(ticker.upper())
    return {"ok": True}
