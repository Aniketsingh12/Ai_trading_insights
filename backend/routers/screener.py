from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services import daily_service, screener_service
from utils.guard import rate_limit, require_key

# These routes fan out to many data calls and spend LLM tokens, so they carry the
# optional access-key + rate-limit guards (both no-ops unless configured).
router = APIRouter(tags=["screener"], dependencies=[Depends(require_key), Depends(rate_limit)])


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
async def score(ticker: str, explain: bool = False):
    """Scored breakdown + risk/reward metrics for a single ticker.

    `explain=true` adds an LLM-written reason — opt-in so simply opening a page
    doesn't silently spend tokens.
    """
    return await screener_service.analyze_one(ticker, explain=explain)


class DailyRequest(BaseModel):
    tickers: list[str] = []


@router.post("/daily/report")
async def daily_report(req: DailyRequest):
    """Today's market report. Optional `tickers` (e.g. watchlist) enrich the movers."""
    return await daily_service.build_report(req.tickers)
