from fastapi import APIRouter
from pydantic import BaseModel

from services import daily_service, screener_service

router = APIRouter(tags=["screener"])


class RankRequest(BaseModel):
    tickers: list[str]


@router.post("/screener/rank")
async def rank(req: RankRequest):
    """Rank tickers by composite score (highest first), with full math + LLM reasons."""
    return await screener_service.rank(req.tickers)


@router.get("/screener/top")
async def top(region: str = "global", limit: int = 10):
    """Top-N picks from a built-in universe. region = 'global' | 'india'."""
    return await screener_service.top(region, limit)


@router.get("/screener/score/{ticker}")
async def score(ticker: str):
    """Scored breakdown + risk/reward metrics for a single ticker."""
    return await screener_service.analyze_one(ticker)


class DailyRequest(BaseModel):
    tickers: list[str] = []


@router.post("/daily/report")
async def daily_report(req: DailyRequest):
    """Today's market report. Optional `tickers` (e.g. watchlist) enrich the movers."""
    return await daily_service.build_report(req.tickers)
