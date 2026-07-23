from mcp_servers.news_mcp import _is_entertainment
from utils.markets import SCREENER_UNIVERSE


def test_entertainment_filter_blocks_ott_content():
    assert _is_entertainment("New web series drops on OTT this Friday")
    assert _is_entertainment("Box office: blockbuster movie review")
    assert _is_entertainment("Watch the trailer of the new season")


def test_entertainment_filter_keeps_market_news():
    assert not _is_entertainment("Nifty hits record high as IT stocks rally")
    assert not _is_entertainment("Fed turns hawkish; Wall Street slips")
    assert not _is_entertainment("Reliance Q1 profit beats estimates")
    # Netflix as a STOCK should pass (company news, not entertainment content)
    assert not _is_entertainment("Netflix shares jump 8% on subscriber beat")


def test_screener_universe_regions():
    assert "global" in SCREENER_UNIVERSE and "india" in SCREENER_UNIVERSE
    assert len(SCREENER_UNIVERSE["global"]) >= 10
    assert len(SCREENER_UNIVERSE["india"]) >= 10
    # all Indian universe symbols are NSE-listed
    assert all(t.endswith(".NS") for t in SCREENER_UNIVERSE["india"])
