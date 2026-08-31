from fastapi import APIRouter, Depends, HTTPException

from mcp_servers import market_data_mcp
from utils.guard import rate_limit_data
from utils.validate import clamp, clean_ticker

# Free to serve, so no passcode — but still capped, because every call here
# reaches a third-party data provider under our IP and quota.
router = APIRouter(prefix="/market", tags=["market"], dependencies=[Depends(rate_limit_data)])


@router.get("/search")
async def search(q: str = ""):
    """Search tickers by company name or symbol. e.g. ?q=Apple or ?q=Reliance"""
    # Free text by nature, but it never reaches a model — only the search
    # provider — so a length cap is the whole requirement.
    return await market_data_mcp.search_tickers(q[:64])


@router.get("/indices")
async def indices(region: str = "global"):
    """Index basket for a region. region = 'global' | 'india'."""
    return await market_data_mcp.get_indices(region)


@router.get("/quote/{ticker}")
async def quote(ticker: str):
    ticker = clean_ticker(ticker)
    data = await market_data_mcp.get_quote(ticker)
    if data.get("price") is None:
        raise HTTPException(404, f"No data for {ticker}")
    return data


@router.get("/ohlcv/{ticker}")
async def ohlcv(ticker: str, interval: str = "1d", days: int = 90):
    # Five years is more history than any view here uses; beyond that it is
    # just load on the data provider under our IP.
    if interval not in {"1d", "1h", "5m", "15m", "1wk", "1mo"}:
        raise HTTPException(422, f"Unsupported interval '{interval[:10]}'.")
    return await market_data_mcp.get_ohlcv(clean_ticker(ticker), interval, clamp(days, 1, 1825))


@router.get("/indicators/{ticker}")
async def indicators(ticker: str):
    return await market_data_mcp.get_indicators(clean_ticker(ticker))


@router.get("/52week/{ticker}")
async def week52(ticker: str):
    return await market_data_mcp.get_52week(clean_ticker(ticker))
