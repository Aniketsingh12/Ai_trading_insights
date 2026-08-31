"""
Deep-research job orchestration.

Runs the 5-agent crew as a background task and tracks live progress in an in-memory
store. The frontend polls GET /analyze/report/{id} to watch agents tick over and to
collect the final report. (Production path: swap this store for Supabase + Celery —
see backend/tasks/README.md. The crew itself is unchanged either way.)
"""
from __future__ import annotations

import logging
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

from agents.crew import AGENT_NAMES, run_deep_research
from utils import llm
from utils.redact import safe_detail

log = logging.getLogger("marketmind.research")

# job_id -> job dict. Bounded: each finished job holds the full report plus every
# agent's raw data (candles, news, ratios), so an unbounded dict would slowly eat
# the container's memory. Oldest entries are evicted first.
_JOBS: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_MAX_JOBS = 50


def _evict_old_jobs() -> None:
    while len(_JOBS) > _MAX_JOBS:
        _JOBS.popitem(last=False)  # drop oldest


def _new_job(ticker: str, preset: str | None = None) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:12],
        "ticker": ticker.upper(),
        "preset": preset,     # model preset this run was started with
        "status": "running",  # running | done | error
        "agents": [{"name": n, "status": "pending"} for n in AGENT_NAMES],
        "report": None,
        "verdict": None,
        "verdict_source": None,   # explicit | scanned | fallback
        "missing_sections": None,
        "sections": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def create_job(ticker: str, preset: str | None = None) -> dict[str, Any]:
    job = _new_job(ticker, preset)
    _JOBS[job["id"]] = job
    _evict_old_jobs()
    return job


def get_job(job_id: str) -> dict[str, Any] | None:
    return _JOBS.get(job_id)


def latest_completed(ticker: str | None = None) -> dict[str, Any] | None:
    """
    The most recent finished report, preferring one for `ticker`.

    Used when the day's AI budget is spent: a portfolio demo that answers
    "come back tomorrow" shows the visitor nothing, so it falls back to a real
    run from earlier instead. Reuses the job store already kept for polling —
    no fixtures to maintain, and it self-populates from real usage.
    """
    done = [j for j in reversed(_JOBS.values()) if j.get("status") == "done" and j.get("report")]
    if not done:
        return None
    if ticker:
        for job in done:
            if job["ticker"] == ticker.upper():
                return job
    return done[0]


async def run_job(job_id: str) -> None:
    """Background entrypoint. Updates the job record as the crew progresses."""
    job = _JOBS.get(job_id)
    if not job:
        return

    async def progress_cb(agent_name: str, status: str) -> None:
        for a in job["agents"]:
            if a["name"] == agent_name:
                a["status"] = status
                break

    # Re-bind the preset the run was started with. This task executes after the
    # response, so the request's context — and the preset it carried — is gone.
    token = llm.set_preset(job.get("preset"))
    try:
        result = await run_deep_research(job["ticker"], progress_cb=progress_cb)
        job["report"] = result["report"]
        job["verdict"] = result["verdict"]
        job["verdict_source"] = result["verdict_source"]
        job["missing_sections"] = result["missing_sections"]
        job["sections"] = result["sections"]
        job["status"] = "done"
    except Exception as e:
        job["status"] = "error"
        log.exception("deep research failed for %s", job["ticker"])
        job["error"] = safe_detail(e, "The research run failed.")
    finally:
        llm.reset_preset(token)
