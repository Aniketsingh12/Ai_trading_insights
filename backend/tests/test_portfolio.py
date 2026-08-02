"""Portfolio valuation — live P&L, mixed currencies, and unpriced positions."""
from __future__ import annotations

import asyncio

import pytest

from mcp_servers import market_data_mcp, portfolio_mcp


@pytest.fixture(autouse=True)
def clean_store():
    portfolio_mcp._store.clear()
    yield
    portfolio_mcp._store.clear()


def _stub_quotes(monkeypatch, table):
    async def fake(ticker):
        return {"ticker": ticker, **table.get(ticker, {"price": None})}
    monkeypatch.setattr(market_data_mcp, "get_quote", fake)


USD = {"price": 200.0, "change": 2.0, "change_pct": 1.0, "currency": "USD",
       "currency_symbol": "$", "exchange": "US"}
INR = {"price": 1500.0, "change": -10.0, "change_pct": -0.66, "currency": "INR",
       "currency_symbol": "₹", "exchange": "NSE"}


def test_position_pnl_math(monkeypatch):
    _stub_quotes(monkeypatch, {"AAPL": USD})
    asyncio.run(portfolio_mcp.add_position("u", "AAPL", 10, 150.0))
    row = asyncio.run(portfolio_mcp.get_portfolio("u"))[0]
    assert row["cost_basis"] == 1500.0          # 10 * 150
    assert row["market_value"] == 2000.0        # 10 * 200
    assert row["pnl"] == 500.0
    assert row["pnl_pct"] == pytest.approx(33.33, abs=0.01)
    assert row["day_pnl"] == 20.0               # 10 * +2.00
    assert row["priced"] is True


def test_unpriced_position_reports_no_fake_numbers(monkeypatch):
    _stub_quotes(monkeypatch, {})               # every quote returns price=None
    asyncio.run(portfolio_mcp.add_position("u", "NOPE", 1, 50.0))
    row = asyncio.run(portfolio_mcp.get_portfolio("u"))[0]
    assert row["priced"] is False
    assert row["market_value"] is None and row["pnl"] is None
    assert row["cost_basis"] == 50.0            # what we do know is still shown


def test_totals_are_split_by_currency(monkeypatch):
    _stub_quotes(monkeypatch, {"AAPL": USD, "RELIANCE.NS": INR})
    asyncio.run(portfolio_mcp.add_position("u", "AAPL", 10, 150.0))
    asyncio.run(portfolio_mcp.add_position("u", "RELIANCE.NS", 5, 1400.0))
    stats = asyncio.run(portfolio_mcp.get_portfolio_stats("u"))

    by_cur = {t["currency"]: t for t in stats["totals"]}
    assert set(by_cur) == {"USD", "INR"}        # never summed together
    assert by_cur["USD"]["market_value"] == 2000.0
    assert by_cur["USD"]["pnl"] == 500.0
    assert by_cur["INR"]["market_value"] == 7500.0
    assert by_cur["INR"]["pnl"] == 500.0        # 5 * (1500 - 1400)


def test_total_is_withheld_when_a_position_cannot_be_priced(monkeypatch):
    """A partial total would understate the portfolio, so report None instead."""
    _stub_quotes(monkeypatch, {"AAPL": USD})    # BADTICK resolves to price=None
    asyncio.run(portfolio_mcp.add_position("u", "AAPL", 10, 150.0))
    asyncio.run(portfolio_mcp.add_position("u", "BADTICK", 1, 50.0))
    usd = asyncio.run(portfolio_mcp.get_portfolio_stats("u"))["totals"][0]
    assert usd["positions"] == 2 and usd["priced_positions"] == 1
    assert usd["pnl"] is None


def test_remove_position(monkeypatch):
    _stub_quotes(monkeypatch, {"AAPL": USD})
    asyncio.run(portfolio_mcp.add_position("u", "AAPL", 1, 1.0))
    assert asyncio.run(portfolio_mcp.remove_position("u", "aapl")) is True   # case-insensitive
    assert asyncio.run(portfolio_mcp.get_portfolio("u")) == []
    assert asyncio.run(portfolio_mcp.remove_position("u", "AAPL")) is False
