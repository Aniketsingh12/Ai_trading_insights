from utils.markets import INDEX_BASKETS, market_for, news_search_term


def test_indian_exchanges():
    assert market_for("RELIANCE.NS").exchange == "NSE"
    assert market_for("RELIANCE.NS").currency == "INR"
    assert market_for("TCS.BO").exchange == "BSE"
    assert market_for("INFY.NS").currency_symbol == "₹"


def test_us_default():
    assert market_for("AAPL").exchange == "US"
    assert market_for("AAPL").currency == "USD"


def test_crypto():
    assert market_for("BTC-USD").exchange == "Crypto"


def test_other_global():
    assert market_for("VOD.L").region == "UK"
    assert market_for("BHP.AX").currency == "AUD"


def test_news_search_term_strips_suffix():
    assert news_search_term("RELIANCE.NS") == "RELIANCE"
    assert news_search_term("TCS.BO") == "TCS"
    assert news_search_term("BTC-USD") == "BTC"
    assert news_search_term("AAPL") == "AAPL"


def test_global_indices_mapping():
    assert market_for("^FTSE").region == "UK"
    assert market_for("^GDAXI").region == "Germany"
    assert market_for("^N225").region == "Japan"
    assert market_for("^HSI").region == "Hong Kong"
    # indices show point levels — no currency symbol prefix
    assert market_for("^NSEI").currency_symbol == ""
    assert market_for("^FTSE").currency_symbol == ""


def test_baskets_present():
    assert "india" in INDEX_BASKETS and "global" in INDEX_BASKETS
    assert any(i["ticker"] == "^NSEI" for i in INDEX_BASKETS["india"])
    # global basket is genuinely global, not just US
    g = {i["ticker"] for i in INDEX_BASKETS["global"]}
    assert {"^FTSE", "^GDAXI", "^N225", "^HSI"}.issubset(g)


def test_no_pinned_company_tickers_in_baskets():
    # baskets are market-level only: every ticker is an index (^), FX (=X),
    # commodity future (=F), an ETF proxy, or crypto — never a single company.
    etf_proxies = {"SPY", "QQQ", "DIA"}
    for region in INDEX_BASKETS.values():
        for item in region:
            t = item["ticker"]
            assert (
                t.startswith("^")
                or t.endswith("=X")
                or t.endswith("=F")
                or t.endswith("-USD")
                or t in etf_proxies
            ), f"{t} looks like a pinned company ticker"
