from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from routers import analyze, health, market, portfolio, screener, watchlist

app = FastAPI(title="MarketMind API", version="0.2.0")

# CORS still matters for the Capacitor app and for split deployments. In the
# single-service deploy the frontend is same-origin, so it needs none of this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Everything lives under /api so the SPA can own the root paths. Without this,
# routes like /portfolio would be claimed by the API and the React page of the
# same name would be unreachable.
api = APIRouter(prefix="/api")
api.include_router(health.router)
api.include_router(market.router)
api.include_router(analyze.router)
api.include_router(screener.router)
api.include_router(watchlist.router)
api.include_router(portfolio.router)


@api.get("")
async def api_root():
    return {
        "name": "MarketMind",
        "version": "0.2.0",
        "llm_provider": settings.llm_provider,
        "docs": "/docs",
    }


app.include_router(api)


# ── Single-service hosting: serve the built React app from this same process ──
# The Docker build copies frontend/dist here. When it's absent (local dev, tests)
# the API simply runs on its own and Vite serves the UI.
_STATIC = Path(__file__).parent / "static"

if (_STATIC / "index.html").is_file():
    if (_STATIC / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        """Serve a real file when one matches, else index.html so client-side
        routes such as /analyze/RELIANCE.NS survive a refresh."""
        if full_path:
            candidate = (_STATIC / full_path).resolve()
            # Containment check — never let "../" escape the static directory.
            if candidate.is_file() and candidate.is_relative_to(_STATIC.resolve()):
                return FileResponse(candidate)
        return FileResponse(_STATIC / "index.html")

else:
    @app.get("/")
    async def root():
        return {
            "name": "MarketMind",
            "version": "0.2.0",
            "llm_provider": settings.llm_provider,
            "api": "/api",
            "docs": "/docs",
        }
