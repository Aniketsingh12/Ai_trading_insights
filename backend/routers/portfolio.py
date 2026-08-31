from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from mcp_servers import portfolio_mcp
from utils.guard import rate_limit_data
from utils.validate import clean_ticker

router = APIRouter(prefix="/portfolio", tags=["portfolio"], dependencies=[Depends(rate_limit_data)])


def _user_id() -> str:
    return "demo-user"


class Position(BaseModel):
    ticker: str
    # Bounded so a position can't carry absurd numbers into the P&L maths.
    qty: float = Field(gt=0, le=1e9)
    avg_price: float = Field(gt=0, le=1e9)


@router.get("")
async def get():
    return await portfolio_mcp.get_portfolio(_user_id())


@router.post("/position")
async def upsert(pos: Position):
    return await portfolio_mcp.add_position(_user_id(), clean_ticker(pos.ticker), pos.qty, pos.avg_price)


@router.delete("/position/{ticker}")
async def remove(ticker: str):
    return {"removed": await portfolio_mcp.remove_position(_user_id(), clean_ticker(ticker))}


@router.get("/stats")
async def stats():
    return await portfolio_mcp.get_portfolio_stats(_user_id())
