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
    quotes = []
    for t in tickers:
        quotes.append(await market_data_mcp.get_quote(t))
    return {"tickers": tickers, "quotes": quotes}


@router.post("/{ticker}")
async def add(ticker: str):
    _watchlists.setdefault(_user_id(), set()).add(ticker.upper())
    return {"ok": True, "ticker": ticker.upper()}


@router.delete("/{ticker}")
async def remove(ticker: str):
    _watchlists.setdefault(_user_id(), set()).discard(ticker.upper())
    return {"ok": True}
