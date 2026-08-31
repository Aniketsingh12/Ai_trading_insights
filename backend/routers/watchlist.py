import asyncio

from fastapi import APIRouter, Depends, HTTPException

from mcp_servers import market_data_mcp
from utils.guard import rate_limit_data
from utils.validate import MAX_TICKERS, clean_ticker

router = APIRouter(prefix="/watchlist", tags=["watchlist"], dependencies=[Depends(rate_limit_data)])

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
    # Validated on the way IN, not just on read: a stored symbol later feeds the
    # daily report's prompt, so an unchecked one here is a delayed injection.
    ticker = clean_ticker(ticker)
    watch = _watchlists.setdefault(_user_id(), set())
    if ticker not in watch and len(watch) >= MAX_TICKERS:
        raise HTTPException(422, f"Watchlist is full ({MAX_TICKERS} symbols).")
    watch.add(ticker)
    return {"ok": True, "ticker": ticker}


@router.delete("/{ticker}")
async def remove(ticker: str):
    _watchlists.setdefault(_user_id(), set()).discard(clean_ticker(ticker))
    return {"ok": True}
