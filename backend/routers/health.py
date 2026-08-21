from fastapi import APIRouter, Header, Request

from utils.guard import budget_status
from utils.llm import llm

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health(request: Request, x_api_key: str | None = Header(default=None)):
    """
    Status, plus what the UI needs to show the visitor their remaining AI runs.

    Reports allowances and whether the caller is the owner — never the passcode
    itself, and never the model provider's key.
    """
    return {
        "status": "ok",
        "llm": await llm.health(),
        "budget": budget_status(request, x_api_key),
    }
