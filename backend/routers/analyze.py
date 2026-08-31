from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request

from config import DEEP_RESEARCH_COST
from services import research_service
from services.analysis_service import quick_analysis
from utils.guard import BudgetExhausted, llm_budget, rate_limit, use_preset
from utils.llm import current_preset
from utils.validate import clean_ticker

router = APIRouter(prefix="/analyze", tags=["analyze"])


@router.get(
    "/quick/{ticker}",
    # use_preset first: the cost of the call depends on the preset it runs under.
    dependencies=[Depends(use_preset), Depends(rate_limit), Depends(llm_budget(1))],
)
async def quick(ticker: str):
    # This value is interpolated into the model prompt. Unvalidated, it is a
    # free-text channel straight to the provider on our account.
    ticker = clean_ticker(ticker)
    try:
        return await quick_analysis(ticker)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/deep/{ticker}", dependencies=[Depends(rate_limit), Depends(use_preset)])
async def deep(
    ticker: str,
    background: BackgroundTasks,
    request: Request,
    x_api_key: str | None = Header(default=None),
):
    """
    Kick off a 5-agent deep research run. Returns a job id to poll.

    Costs DEEP_RESEARCH_COST units — four analysts plus the synthesis — not one.

    The budget is charged here rather than by a route dependency so that a
    refusal can degrade instead of dead-ending: this is the demo's showpiece,
    and "come back tomorrow" shows a visitor nothing. When the allowance is
    gone we hand back a real run from earlier, flagged as a sample.
    """
    ticker = clean_ticker(ticker)
    try:
        await llm_budget(DEEP_RESEARCH_COST)(request=request, x_api_key=x_api_key)
    except BudgetExhausted as limit_hit:
        cached = research_service.latest_completed(ticker)
        if cached is None:
            raise
        return {
            "report_id": cached["id"],
            "ticker": cached["ticker"],
            "status": cached["status"],
            "sample": True,
            "sample_reason": limit_hit.detail,
        }

    # The preset is stored on the job, not read from context by the worker: this
    # task runs after the response, by which point the request's context is gone.
    job = research_service.create_job(ticker, preset=current_preset())
    background.add_task(research_service.run_job, job["id"])
    return {"report_id": job["id"], "ticker": job["ticker"], "status": job["status"]}


@router.get("/report/{report_id}")
async def report(report_id: str):
    """
    Poll deep-research status / fetch the completed report + agent progress.

    Deliberately NOT rate limited: the frontend polls this every 1.5s while a
    run is in flight — 40 requests a minute — so the standard per-minute cap
    would cut the run off mid-flight. It only reads an in-memory dict and spends
    nothing, so there is no cost to protect here.
    """
    job = research_service.get_job(report_id)
    if not job:
        raise HTTPException(404, "Report not found")
    return job
