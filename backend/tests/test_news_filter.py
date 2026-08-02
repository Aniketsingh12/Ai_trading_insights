from mcp_servers.news_mcp import _is_entertainment
from utils.markets import SCREENER_UNIVERSE


def test_entertainment_filter_blocks_ott_content():
    assert _is_entertainment("New web series drops on OTT this Friday")
    assert _is_entertainment("Box office: blockbuster movie review")
    assert _is_entertainment("Watch the trailer of the new season")
    assert _is_entertainment("Actress announces next Bollywood film")
    assert _is_entertainment("Episode 5 release date confirmed")


def test_entertainment_filter_keeps_market_news():
    assert not _is_entertainment("Nifty hits record high as IT stocks rally")
    assert not _is_entertainment("Fed turns hawkish; Wall Street slips")
    assert not _is_entertainment("Reliance Q1 profit beats estimates")
    # Netflix as a STOCK should pass (company news, not entertainment content)
    assert not _is_entertainment("Netflix shares jump 8% on subscriber beat")


def test_entertainment_filter_does_not_eat_market_vocabulary():
    """Regression: substring matching used to block these common headlines."""
    for headline in (
        "Earnings season kicks off with bank results",
        "Q3 earnings season: what to watch in IT stocks",
        "Nifty in holiday season rally",
        "Celebrity-backed IPO oversubscribed 12x",
        "Sensex first look at Budget impact",
        "Netflix series drives record revenue growth",
    ):
        assert not _is_entertainment(headline), headline


def test_screener_universe_regions():
    assert "global" in SCREENER_UNIVERSE and "india" in SCREENER_UNIVERSE
    assert len(SCREENER_UNIVERSE["global"]) >= 10
    assert len(SCREENER_UNIVERSE["india"]) >= 10
    # all Indian universe symbols are NSE-listed
    assert all(t.endswith(".NS") for t in SCREENER_UNIVERSE["india"])
