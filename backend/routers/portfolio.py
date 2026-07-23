from fastapi import APIRouter
from pydantic import BaseModel

from mcp_servers import portfolio_mcp

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _user_id() -> str:
    return "demo-user"


class Position(BaseModel):
    ticker: str
    qty: float
    avg_price: float


@router.get("")
async def get():
    return await portfolio_mcp.get_portfolio(_user_id())


@router.post("/position")
async def upsert(pos: Position):
    return await portfolio_mcp.add_position(_user_id(), pos.ticker, pos.qty, pos.avg_price)


@router.delete("/position/{ticker}")
async def remove(ticker: str):
    return {"removed": await portfolio_mcp.remove_position(_user_id(), ticker)}


@router.get("/stats")
async def stats():
    return await portfolio_mcp.get_portfolio_stats(_user_id())
