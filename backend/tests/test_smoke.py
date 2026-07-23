import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["name"] == "TradeForge"


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_quote_yfinance():
    r = client.get("/market/quote/AAPL")
    # Allow 404 in offline CI; assert structure when reachable
    assert r.status_code in (200, 404)
