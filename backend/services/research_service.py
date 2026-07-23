"""
Deep-research job orchestration.

Runs the 5-agent crew as a background task and tracks live progress in an in-memory
store. The frontend polls GET /analyze/report/{id} to watch agents tick over and to
collect the final report. (Production path: swap this store for Supabase + Celery —
see backend/tasks/README.md. The crew itself is unchanged either way.)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents.crew import AGENT_NAMES, run_deep_research

# job_id -> job dict
_JOBS: dict[str, dict[str, Any]] = {}


def _new_job(ticker: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:12],
        "ticker": ticker.upper(),
        "status": "running",  # running | done | error
        "agents": [{"name": n, "status": "pending"} for n in AGENT_NAMES],
        "report": None,
        "verdict": None,
        "sections": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def create_job(ticker: str) -> dict[str, Any]:
    job = _new_job(ticker)
    _JOBS[job["id"]] = job
    return job


def get_job(job_id: str) -> dict[str, Any] | None:
    return _JOBS.get(job_id)


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

    try:
        result = await run_deep_research(job["ticker"], progress_cb=progress_cb)
        job["report"] = result["report"]
        job["verdict"] = result["verdict"]
        job["sections"] = result["sections"]
        job["status"] = "done"
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
