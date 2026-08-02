from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from services import research_service
from services.analysis_service import quick_analysis
from utils.guard import rate_limit, require_key

# LLM-backed routes — guarded (no-ops unless API_ACCESS_KEY / RATE_LIMIT_PER_MIN set).
router = APIRouter(
    prefix="/analyze",
    tags=["analyze"],
    dependencies=[Depends(require_key), Depends(rate_limit)],
)


@router.get("/quick/{ticker}")
async def quick(ticker: str):
    try:
        return await quick_analysis(ticker)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/deep/{ticker}")
async def deep(ticker: str, background: BackgroundTasks):
    """Kick off a 5-agent deep research run. Returns a job id to poll."""
    job = research_service.create_job(ticker)
    background.add_task(research_service.run_job, job["id"])
    return {"report_id": job["id"], "ticker": job["ticker"], "status": job["status"]}


@router.get("/report/{report_id}")
async def report(report_id: str):
    """Poll deep-research status / fetch the completed report + agent progress."""
    job = research_service.get_job(report_id)
    if not job:
        raise HTTPException(404, "Report not found")
    return job
