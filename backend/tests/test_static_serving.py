"""
Single-service hosting: FastAPI serves the built SPA from backend/static.

These build a throwaway static/ dir so the behaviour is verified even when no
real frontend build is present (CI, fresh clone).
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

STATIC = Path(__file__).resolve().parent.parent / "static"


@pytest.fixture
def spa_client():
    """Create a minimal static/ tree, reload main so the SPA routes register."""
    created = not STATIC.exists()
    (STATIC / "assets").mkdir(parents=True, exist_ok=True)
    (STATIC / "index.html").write_text("<!doctype html><title>MarketMind</title>", encoding="utf-8")
    (STATIC / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (STATIC / "manifest.webmanifest").write_text("{}", encoding="utf-8")
    import main
    importlib.reload(main)
    try:
        yield TestClient(main.app)
    finally:
        for p in (STATIC / "assets" / "app.js", STATIC / "index.html", STATIC / "manifest.webmanifest"):
            p.unlink(missing_ok=True)
        (STATIC / "assets").rmdir()
        if created:
            STATIC.rmdir()
        importlib.reload(main)  # restore API-only app for other tests


def test_api_still_json_when_spa_is_mounted(spa_client):
    r = spa_client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_spa_owns_root_and_client_routes(spa_client):
    """/portfolio must be the React page, not the API — that name exists in both."""
    for path in ("/", "/portfolio", "/watchlist", "/analyze/RELIANCE.NS"):
        r = spa_client.get(path)
        assert r.status_code == 200, path
        assert "text/html" in r.headers["content-type"], path


def test_real_static_files_are_served(spa_client):
    assert spa_client.get("/assets/app.js").status_code == 200
    assert spa_client.get("/manifest.webmanifest").status_code == 200


def test_unknown_route_falls_back_to_index(spa_client):
    """Deep links and the client-side 404 page both need index.html."""
    r = spa_client.get("/definitely-not-a-route")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]


@pytest.mark.parametrize("attack", [
    "/../.env",
    "/../../backend/.env",
    "/..%2f..%2f.env",
    "/assets/../../.env",
])
def test_path_traversal_cannot_escape_static_dir(spa_client, attack):
    """Must never serve a file outside static/ — falls back to index.html."""
    r = spa_client.get(attack)
    assert "text/html" in r.headers.get("content-type", "")
    for secret in ("GEMINI_API_KEY", "POLYGON_API_KEY", "SUPABASE"):
        assert secret not in r.text
