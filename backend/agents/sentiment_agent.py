"""SentimentAgent — sentiment analyst. Tools: news-mcp, social-sentiment-mcp, options-flow-mcp."""
from __future__ import annotations

from typing import Any

from agents.base import Agent
from mcp_servers import news_mcp, options_flow_mcp, social_sentiment_mcp

SYSTEM = """You are a market sentiment analyst. Read the market's mood around a ticker
using news, social media, and options data. Summarize:
1. News sentiment and the 3 most relevant recent stories (use the headlines given)
2. Social sentiment: Stocktwits bullish vs bearish ratio and any Reddit signal
3. Options market signal: put/call ratio interpretation
4. Overall sentiment verdict: strongly bullish / mildly bullish / neutral /
   mildly bearish / strongly bearish — with reasoning

Separate noise from signal. High message volume is not the same as bullishness.
Interpret context. Cite the numbers provided."""


class SentimentAgent(Agent):
    name = "SentimentAgent"
    role = "Sentiment analyst"
    system_prompt = SYSTEM
    tier = "agent"

    async def gather(self, ticker: str) -> dict[str, Any]:
        news = await news_mcp.get_news(ticker, limit=8)
        headlines = [{"title": n["title"], "source": n["source"]} for n in news]
        stocktwits = await social_sentiment_mcp.get_stocktwits_sentiment(ticker)
        reddit = await social_sentiment_mcp.get_reddit_mentions(ticker, days=7)
        put_call = await options_flow_mcp.get_put_call_ratio(ticker)
        fear_greed = await social_sentiment_mcp.get_fear_greed_index()
        return {
            "recent_headlines": headlines,
            "stocktwits_sentiment": stocktwits,
            "reddit_mentions": reddit,
            "put_call_ratio": put_call,
            "market_fear_greed": fear_greed,
        }
