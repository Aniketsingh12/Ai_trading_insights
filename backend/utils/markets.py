"""
Market / exchange awareness — maps tickers to exchange, currency, and region.

yfinance already serves Indian equities via suffixes:
  RELIANCE.NS  → NSE (National Stock Exchange of India)
  TCS.BO       → BSE (Bombay Stock Exchange)
and global venues via .L (LSE), .AX (ASX), .TO (TSX), etc.

This module centralises the metadata so quotes, news, and reports can show the
right currency symbol and the right news search term.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MarketInfo:
    exchange: str
    region: str
    currency: str
    currency_symbol: str


# Suffix → market metadata
_SUFFIX_MAP: dict[str, MarketInfo] = {
    ".NS": MarketInfo("NSE", "India", "INR", "₹"),
    ".BO": MarketInfo("BSE", "India", "INR", "₹"),
    ".L": MarketInfo("LSE", "UK", "GBP", "£"),
    ".AX": MarketInfo("ASX", "Australia", "AUD", "A$"),
    ".TO": MarketInfo("TSX", "Canada", "CAD", "C$"),
    ".HK": MarketInfo("HKEX", "Hong Kong", "HKD", "HK$"),
    ".T": MarketInfo("TSE", "Japan", "JPY", "¥"),
    ".DE": MarketInfo("XETRA", "Germany", "EUR", "€"),
    ".PA": MarketInfo("Euronext", "France", "EUR", "€"),
}

_US = MarketInfo("US", "United States", "USD", "$")
_CRYPTO = MarketInfo("Crypto", "Global", "USD", "$")
# Index / FX entries display as point levels, so currency_symbol is "" (no prefix).
# region/currency are still set so the badge shows the right market.
_IDX_IN = MarketInfo("NSE", "India", "INR", "")
_IDX_US = MarketInfo("Index", "United States", "USD", "")
_IDX_UK = MarketInfo("LSE", "UK", "GBP", "")
_IDX_DE = MarketInfo("XETRA", "Germany", "EUR", "")
_IDX_JP = MarketInfo("TSE", "Japan", "JPY", "")
_IDX_HK = MarketInfo("HKEX", "Hong Kong", "HKD", "")
_FX_IN = MarketInfo("FX", "India", "INR", "")

# Suffix-less symbols (indices / FX) that need explicit region mapping.
_EXPLICIT: dict[str, MarketInfo] = {
    # India
    "^NSEI": _IDX_IN,      # Nifty 50
    "^BSESN": _IDX_IN,     # Sensex
    "^NSEBANK": _IDX_IN,   # Bank Nifty
    "^CNXIT": _IDX_IN,     # Nifty IT
    "^INDIAVIX": _IDX_IN,  # India VIX
    "INR=X": _FX_IN,       # USD/INR
    # Global indices
    "^VIX": _IDX_US,       # CBOE Volatility Index
    "^GSPC": _IDX_US,      # S&P 500
    "^NDX": _IDX_US,       # NASDAQ 100
    "^DJI": _IDX_US,       # Dow Jones
    "^FTSE": _IDX_UK,      # FTSE 100
    "^GDAXI": _IDX_DE,     # DAX
    "^N225": _IDX_JP,      # Nikkei 225
    "^HSI": _IDX_HK,       # Hang Seng
}


def market_for(ticker: str) -> MarketInfo:
    """Resolve exchange/currency/region from a raw ticker symbol."""
    t = ticker.upper().strip()
    if t in _EXPLICIT:
        return _EXPLICIT[t]
    if t.endswith("-USD"):
        return _CRYPTO
    for suffix, info in _SUFFIX_MAP.items():
        if t.endswith(suffix.upper()):
            return info
    return _US


def news_search_term(ticker: str) -> str:
    """Strip exchange suffix / crypto pair so news search hits the company name.

    RELIANCE.NS -> RELIANCE,  BTC-USD -> BTC,  AAPL -> AAPL
    """
    t = ticker.upper().strip()
    if t.endswith("-USD"):
        return t[:-4]
    for suffix in _SUFFIX_MAP:
        if t.endswith(suffix.upper()):
            return t[: -len(suffix)]
    return t


# Index baskets shown on the Dashboard, by region. Market-level instruments only —
# no individual company tickers are pinned here.
INDEX_BASKETS: dict[str, list[dict[str, str]]] = {
    "global": [
        {"ticker": "SPY", "label": "S&P 500"},
        {"ticker": "QQQ", "label": "NASDAQ 100"},
        {"ticker": "DIA", "label": "Dow Jones"},
        {"ticker": "^FTSE", "label": "FTSE 100"},
        {"ticker": "^GDAXI", "label": "DAX"},
        {"ticker": "^N225", "label": "Nikkei 225"},
        {"ticker": "^HSI", "label": "Hang Seng"},
        {"ticker": "^VIX", "label": "VIX"},
        {"ticker": "BTC-USD", "label": "Bitcoin"},
        {"ticker": "GC=F", "label": "Gold"},
    ],
    "india": [
        {"ticker": "^NSEI", "label": "Nifty 50"},
        {"ticker": "^BSESN", "label": "Sensex"},
        {"ticker": "^NSEBANK", "label": "Bank Nifty"},
        {"ticker": "^CNXIT", "label": "Nifty IT"},
        {"ticker": "^INDIAVIX", "label": "India VIX"},
        {"ticker": "INR=X", "label": "USD/INR"},
    ],
}

# Default stock universes the Top Picks screener scans to surface a top-N.
# These ARE individual companies (a screener needs a universe) — large, liquid,
# sector-diversified names. Users can still rank their own tickers or watchlist.
SCREENER_UNIVERSE: dict[str, list[str]] = {
    "global": [
        "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
        "JPM", "V", "WMT", "XOM", "JNJ", "AVGO", "NFLX",
    ],
    "india": [
        "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
        "BHARTIARTL.NS", "SBIN.NS", "LT.NS", "ITC.NS", "HINDUNILVR.NS",
        "AXISBANK.NS", "MARUTI.NS",
    ],
}
