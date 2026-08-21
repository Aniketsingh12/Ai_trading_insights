from fastapi import APIRouter, Depends, HTTPException

from mcp_servers import market_data_mcp
from utils.guard import rate_limit_data

# Free to serve, so no passcode — but still capped, because every call here
# reaches a third-party data provider under our IP and quota.
router = APIRouter(prefix="/market", tags=["market"], dependencies=[Depends(rate_limit_data)])


@router.get("/search")
async def search(q: str = ""):
    """Search tickers by company name or symbol. e.g. ?q=Apple or ?q=Reliance"""
    return await market_data_mcp.search_tickers(q)


@router.get("/indices")
async def indices(region: str = "global"):
    """Index basket for a region. region = 'global' | 'india'."""
    return await market_data_mcp.get_indices(region)


@router.get("/quote/{ticker}")
async def quote(ticker: str):
    data = await market_data_mcp.get_quote(ticker)
    if data.get("price") is None:
        raise HTTPException(404, f"No data for {ticker}")
    return data


@router.get("/ohlcv/{ticker}")
async def ohlcv(ticker: str, interval: str = "1d", days: int = 90):
    return await market_data_mcp.get_ohlcv(ticker, interval, days)


@router.get("/indicators/{ticker}")
async def indicators(ticker: str):
    return await market_data_mcp.get_indicators(ticker)


@router.get("/52week/{ticker}")
async def week52(ticker: str):
    return await market_data_mcp.get_52week(ticker)
