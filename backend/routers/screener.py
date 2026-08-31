from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel

from services import daily_service, screener_service
from utils.guard import llm_budget, rate_limit, rate_limit_data, use_preset
from utils.validate import clamp, clean_ticker, clean_tickers

router = APIRouter(tags=["screener"])

# use_preset must precede llm_budget: what a call costs depends on which model
# preset it runs under, and FastAPI resolves dependencies in declaration order.
_AI = [Depends(use_preset), Depends(rate_limit), Depends(llm_budget(1))]


class RankRequest(BaseModel):
    tickers: list[str]


@router.post("/screener/rank", dependencies=_AI)
async def rank(req: RankRequest):
    """Rank tickers by composite score (highest first), with full math + LLM reasons."""
    # Bounded and shape-checked before anything fans out: an unbounded list here
    # is one request turning into thousands of upstream calls.
    return await screener_service.rank(clean_tickers(req.tickers))


@router.get("/screener/top", dependencies=_AI)
async def top(region: str = "global", limit: int = 10):
    """Top-N picks from a built-in universe. region = 'global' | 'india'."""
    return await screener_service.top(region, clamp(limit, 1, 25))


@router.get(
    "/screener/score/{ticker}",
    dependencies=[Depends(rate_limit_data), Depends(use_preset)],
)
async def score(
    ticker: str,
    request: Request,
    explain: bool = False,
    x_api_key: str | None = Header(default=None),
):
    """
    Scored breakdown + risk/reward metrics for a single ticker.

    The score itself is pure Python and costs nothing, so it stays free and
    unmetered — that keeps the Analyze page fully usable no matter what the
    day's AI budget looks like. Only `explain=true` reaches a model.
    """
    ticker = clean_ticker(ticker)
    if explain:
        await llm_budget(1)(request=request, x_api_key=x_api_key)
    return await screener_service.analyze_one(ticker, explain=explain)


class DailyRequest(BaseModel):
    tickers: list[str] = []


@router.post("/daily/report", dependencies=_AI)
async def daily_report(req: DailyRequest):
    """Today's market report. Optional `tickers` (e.g. watchlist) enrich the movers."""
    return await daily_service.build_report(clean_tickers(req.tickers))
