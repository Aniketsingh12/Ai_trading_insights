from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import analyze, health, market, portfolio, screener, watchlist

app = FastAPI(title="TradeForge API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(market.router)
app.include_router(analyze.router)
app.include_router(screener.router)
app.include_router(watchlist.router)
app.include_router(portfolio.router)


@app.get("/")
async def root():
    return {
        "name": "TradeForge",
        "version": "0.1.0",
        "llm_provider": settings.llm_provider,
        "docs": "/docs",
    }
