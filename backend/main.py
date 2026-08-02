from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import analyze, health, market, portfolio, screener, watchlist

app = FastAPI(title="MarketMind API", version="0.2.0")

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
        "name": "MarketMind",
        "version": "0.2.0",
        "llm_provider": settings.llm_provider,
        "docs": "/docs",
    }
