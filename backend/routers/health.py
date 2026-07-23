from fastapi import APIRouter

from utils.llm import llm

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health():
    return {"status": "ok", "llm": await llm.health()}
