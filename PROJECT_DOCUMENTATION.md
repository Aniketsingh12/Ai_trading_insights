# MarketMind — Complete Project Documentation

AI-powered trading analysis platform. This document explains the project end to end: what
it does, the technology behind every piece, how data flows through it, what each file is
for, and the exact code that makes each feature work.

For quick reference instead of deep explanation, see [README.md](README.md). For deploy
steps, see [DEPLOY.md](DEPLOY.md). For the Android/PWA build, see [MOBILE.md](MOBILE.md).
This document supersedes none of them — it's the "how and why" behind what they describe.

> **Not financial advice.** Every number in this app is either raw market data or a
> transparent calculation you can audit. Nothing here should be read as a recommendation
> to buy or sell anything.

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Tech stack at a glance](#2-tech-stack-at-a-glance)
3. [High-level architecture](#3-high-level-architecture)
4. [Complete file structure](#4-complete-file-structure)
5. [Backend — configuration](#5-backend--configuration)
6. [Backend — the LLM abstraction layer](#6-backend--the-llm-abstraction-layer)
7. [Backend — data layer (MCP servers)](#7-backend--data-layer-mcp-servers)
8. [Backend — caching strategy](#8-backend--caching-strategy)
9. [Backend — the scoring engine (the math)](#9-backend--the-scoring-engine-the-math)
10. [Backend — services (business logic)](#10-backend--services-business-logic)
11. [Backend — the deep-research agent crew](#11-backend--the-deep-research-agent-crew)
12. [Backend — API routers (endpoint reference)](#12-backend--api-routers-endpoint-reference)
13. [Backend — security guards](#13-backend--security-guards)
14. [Frontend — design system ("Instrument")](#14-frontend--design-system-instrument)
15. [Frontend — app shell & routing](#15-frontend--app-shell--routing)
16. [Frontend — shared components](#16-frontend--shared-components)
17. [Frontend — pages, one by one](#17-frontend--pages-one-by-one)
18. [Frontend — API client & data fetching](#18-frontend--api-client--data-fetching)
19. [End-to-end workflows](#19-end-to-end-workflows)
20. [Testing](#20-testing)
21. [Running locally](#21-running-locally)
22. [Deployment](#22-deployment)
23. [Environment variables reference](#23-environment-variables-reference)
24. [Known limitations & roadmap](#24-known-limitations--roadmap)

---

## 1. What this project is

MarketMind is a **single-page web app + API** that helps you research stocks, crypto and
indices across US and Indian markets. It combines three kinds of intelligence:

1. **Real market data** — live quotes, OHLCV candles, technical indicators — pulled from
   free/no-key sources by default, with optional paid providers as drop-in upgrades.
2. **Deterministic math** — a transparent 0–100 signal score and entry/target/stop trade
   math, computed in pure Python with a stated formula for every point. No LLM is involved
   in the arithmetic, so the numbers are reproducible and auditable.
3. **LLM reasoning** — a swappable language model explains *why* a score landed where it
   did, writes a daily market briefing, and — for a single ticker on demand — runs a
   5-agent "deep research" pipeline that produces a full buy/hold/sell verdict.

The design intent throughout: **the math is free and instant; the LLM is opt-in and
explains, it doesn't decide.** You can use the whole app with zero API keys (market data
degrades gracefully to free sources); AI features need exactly one key from any of five
supported providers.

### Core features

| Feature | What it does | Where |
|---|---|---|
| **Dashboard** | Live global/India index levels, a breadth chart of advancers vs decliners | `/` |
| **Analyze** | Chart + live quote + signal score + trade math + quick AI read + 5-agent deep research for one symbol | `/analyze/:ticker` |
| **Top Picks** | Scans a built-in universe (or your own list/watchlist), scores and ranks every symbol, explains the ranking | `/picks` |
| **Daily Report** | Today's indices, biggest movers, global + India news, an AI-written briefing | `/daily` |
| **Watchlist** | Symbols you're tracking, live-priced, one click to rank them all | `/watchlist` |
| **Portfolio** | Positions you hold, live market value and P&L per currency | `/portfolio` |
| **Beginner mode** | A sidebar toggle that hides raw indicators everywhere and shows only the plain-English call | global |

---

## 2. Tech stack at a glance

### Backend

| Layer | Technology | Why |
|---|---|---|
| Web framework | **FastAPI** 0.115 + **Uvicorn** | async-native, auto-generates OpenAPI docs at `/docs` |
| Data validation / settings | **Pydantic** 2.9 + **pydantic-settings** | typed `.env` loading, request/response models |
| Market data | **yfinance** 1.4 + **curl_cffi** | free, no-key quotes/OHLCV; curl_cffi impersonates a browser to dodge Yahoo's 429 rate limiting |
| Numerics | **pandas** + **numpy** | rolling means, EMA, RSI/MACD computed in pure pandas — no native TA library needed |
| HTTP client | **httpx** (async) | every outbound call (LLM providers, RSS feeds, Stocktwits, FMP) |
| LLM SDKs | **anthropic** SDK; everything else over raw `httpx` | Claude uses its native SDK; Together/Gemini/Groq/Ollama all speak the same OpenAI-compatible JSON shape, so one HTTP helper covers all four |
| Caching | **redis** (optional) with an in-memory dict fallback | works with zero infra locally, scales with Redis in production |
| Persistence (optional) | **Supabase** (Postgres) client | currently unused by default — watchlist/portfolio/jobs are in-memory; schema is ready to switch on |
| Background jobs | FastAPI `BackgroundTasks` (built-in) | deep research runs as a background task, not a separate worker |

### Frontend

| Layer | Technology | Why |
|---|---|---|
| Framework | **React** 18.3 + **Vite** 5.4 | fast dev server, ES modules, no bundler config needed |
| Routing | **react-router-dom** 6 | client-side routes, `/analyze/:ticker` deep links |
| Server state | **@tanstack/react-query** 5 | caching, polling (`refetchInterval`), request de-duplication — no hand-rolled `useEffect` fetch logic |
| Styling | **Tailwind CSS** 3.4 (custom design tokens) | utility-first, but every color/shadow/radius is a named token in `tailwind.config.js`, not a raw Tailwind default |
| Charts | **lightweight-charts** 4.2 (TradingView) | candlestick chart on the Analyze page |
| Icons | **lucide-react** | consistent icon set |
| Toasts | **react-hot-toast** | error/success notifications |
| Mobile | **Capacitor** 6 | wraps the same React build into a native Android APK; no separate mobile codebase |
| PWA | Web Manifest + service worker (hand-written, `frontend/public/`) | installable on phones with zero build tooling |

### LLM providers (pick one via `LLM_PROVIDER`)

| Provider | Cost | Notes |
|---|---|---|
| `together` | Paid, cheap | **Default.** Wide open-model catalogue, per-tier model choice |
| `gemini` | Free tier | Google AI Studio |
| `openai_compat` | Free (Groq) or paid | Any OpenAI-compatible endpoint: Groq, OpenRouter, HF router |
| `anthropic` | Paid | Claude API (Haiku/Sonnet/Opus) |
| `ollama` | Free, local | Runs on your own machine, needs a GPU for good speed |

### Infra / deploy

| Piece | Technology |
|---|---|
| Containerization | **Docker**, multi-stage build (Node builds the React app, Python serves it) |
| Deployment target | **Railway** (single service, one URL, no CORS) — primary path documented in `DEPLOY.md` |
| Alternative | Render (API) + Vercel (frontend), split deploy — `render.yaml` + `frontend/vercel.json` |
| Local dev orchestration | `run.ps1` (Windows) / `run.sh` (macOS/Linux) — one command sets up and starts both halves |

---

## 3. High-level architecture

```
┌─────────────────────────────── Browser ───────────────────────────────┐
│  React SPA (Vite dev server, or static files served by FastAPI)       │
│  React Query ── polls/caches ──> fetch('/api/...')                    │
└───────────────────────────────┬─────────────────────────────────────-┘
                                 │  HTTP (same-origin in production)
┌────────────────────────────────▼────────────────────────────────────┐
│                          FastAPI app  (backend/main.py)               │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  /api  →  routers: health, market, analyze, screener,         │    │
│  │           watchlist, portfolio                                │    │
│  └───────────┬──────────────────────────────────────┬───────────┘    │
│              │                                       │                │
│   ┌──────────▼──────────┐               ┌────────────▼───────────┐   │
│   │  services/           │               │  agents/ (deep research)│  │
│   │  screener, daily,     │               │  5-agent crew ──────┐  │  │
│   │  analysis, research   │               │                     │  │  │
│   └──────────┬───────────┘               └──────────┬──────────-┘  │  │
│              │                                        │              │
│   ┌──────────▼────────────────────────────────────────▼───────────┐  │
│   │                  mcp_servers/  (data-access layer)             │  │
│   │  market_data · news · fundamentals · social_sentiment ·        │  │
│   │  options_flow · portfolio                                      │  │
│   └──────────┬───────────────────────────────────┬────────────────┘  │
│              │                                    │                   │
│   ┌──────────▼─────────┐              ┌───────────▼────────────┐     │
│   │  utils/cache.py     │              │  utils/llm.py           │    │
│   │  (Redis / in-mem)   │              │  (5-provider LLM router)│    │
│   └─────────────────────┘              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
              │                                        │
   ┌──────────▼──────────┐                 ┌───────────▼────────────┐
   │  yfinance / Yahoo /   │                 │  Together / Gemini /    │
   │  RSS feeds / Stocktwits│                │  Groq / Anthropic /     │
   │  / FMP / Polygon       │                │  Ollama                │
   └───────────────────────┘                 └─────────────────────────┘
```

**The layering rule that matters most:** routers never call external APIs directly, and
services never make raw HTTP calls to Yahoo/Stocktwits/etc. themselves. Everything funnels
through `mcp_servers/*.py`. That's the one place caching, provider fallback, and error
shielding live — a router or service just calls `market_data_mcp.get_quote(ticker)` and
gets back either real data or a clean `None`/empty structure, never an exception that
crashes the page.

The name "MCP server" is a deliberate nod to the [Model Context
Protocol](https://modelcontextprotocol.io) shape (a named server exposing typed tools) —
today these are plain async Python functions, not a wire-protocol MCP server, but the
interface is designed so they could be wrapped as real MCP tools later without changing
any caller.

---

## 4. Complete file structure

```
tradeforge/                          (repo root — code name; product name is "MarketMind")
│
├── Dockerfile                       # single-service image: builds React, then serves it from FastAPI
├── render.yaml                      # optional split-deploy blueprint (Render, API only)
├── run.ps1 / run.sh                 # one-command local launcher (setup + start both halves)
├── README.md                        # quickstart, feature reference, LLM backend table
├── DEPLOY.md                        # Railway (primary) + Render/Vercel (alternative) deploy steps
├── MOBILE.md                        # PWA + Android APK build steps (Capacitor)
├── PROJECT_DOCUMENTATION.md         # this file
│
├── backend/
│   ├── main.py                      # FastAPI app: mounts /api routers, serves the built SPA
│   ├── config.py                    # Settings — every env var, typed, with defaults
│   ├── requirements.txt             # production deps (lean)
│   ├── requirements-dev.txt         # + pytest, for running the test suite
│   ├── .env / .env.example          # local secrets (gitignored) / template
│   │
│   ├── agents/                      # Phase 2: 5-agent deep-research crew
│   │   ├── base.py                  #   shared Agent class: gather() → reason() → run()
│   │   ├── crew.py                  #   orchestrates all 5 agents, reports progress
│   │   ├── research_agent.py        #   fundamental analyst
│   │   ├── technical_agent.py       #   technical analyst
│   │   ├── sentiment_agent.py       #   sentiment analyst
│   │   ├── risk_agent.py            #   risk analyst
│   │   ├── report_agent.py          #   synthesizes the 4 above into one verdict
│   │   └── README.md                #   design rationale (why not autonomous CrewAI tool-calling)
│   │
│   ├── mcp_servers/                 # data-access layer — the ONLY place external calls happen
│   │   ├── market_data_mcp.py       #   quotes, OHLCV, indicators, ticker search (yfinance/Polygon)
│   │   ├── news_mcp.py              #   per-ticker news + region market-news RSS feeds
│   │   ├── fundamentals_mcp.py      #   ratios, income statement, analyst ratings (FMP/yfinance)
│   │   ├── social_sentiment_mcp.py  #   Stocktwits ratio, Reddit stub, Fear & Greed index
│   │   ├── options_flow_mcp.py      #   options chain, put/call ratio (yfinance)
│   │   └── portfolio_mcp.py         #   position store + live valuation
│   │
│   ├── services/                    # business logic — composes mcp_servers + scoring + llm
│   │   ├── analysis_service.py      #   "Quick Analysis" — one LLM call over live data
│   │   ├── research_service.py      #   deep-research job store (create/poll/run in background)
│   │   ├── screener_service.py      #   Top Picks: score, rank, LLM-explain
│   │   └── daily_service.py         #   Daily Report: movers + news + AI briefing
│   │
│   ├── routers/                     # thin FastAPI route definitions — no business logic here
│   │   ├── health.py                #   GET /api/health
│   │   ├── market.py                #   GET /api/market/*
│   │   ├── analyze.py               #   GET/POST /api/analyze/*
│   │   ├── screener.py              #   GET/POST /api/screener/*, /api/daily/report
│   │   ├── watchlist.py             #   GET/POST/DELETE /api/watchlist*
│   │   └── portfolio.py             #   GET/POST/DELETE /api/portfolio*
│   │
│   ├── utils/
│   │   ├── llm.py                   #   the 5-provider LLM abstraction (see §6)
│   │   ├── scoring.py                #   pure-Python 0–100 score + trade math (see §9)
│   │   ├── markets.py                #   ticker → exchange/currency/region; index & screener universes
│   │   ├── cache.py                  #   Redis-or-in-memory cache with bounded fallback
│   │   └── guard.py                  #   optional X-API-Key + per-IP rate limit
│   │
│   ├── db/
│   │   └── supabase_client.py       #   lazy Supabase client (only created if keys are set)
│   │
│   ├── tasks/
│   │   └── README.md                #   Celery plan for Phase 2+ (not wired in — see §24)
│   │
│   └── tests/                       # pytest — see §20 for full coverage breakdown
│       ├── test_scoring.py
│       ├── test_markets.py
│       ├── test_news_filter.py
│       ├── test_portfolio.py
│       ├── test_regressions.py
│       ├── test_llm_providers.py
│       ├── test_static_serving.py
│       └── test_smoke.py
│
└── frontend/
    ├── index.html                   # HTML shell — loads Instrument Sans/Serif + JetBrains Mono
    ├── vite.config.js                # dev server + /api proxy to the backend
    ├── tailwind.config.js            # the entire design-token system (colors, type, shadows, motion)
    ├── postcss.config.js
    ├── package.json
    ├── vercel.json                   # split-deploy config (Vercel serving the frontend only)
    ├── capacitor.config.json         # Android app identity (appId, appName, colors)
    │
    ├── public/
    │   ├── manifest.webmanifest      # PWA metadata (name, icons, theme color)
    │   ├── sw.js                     # service worker (offline shell caching)
    │   └── icons/                    # PWA + Android launcher icons
    │
    └── src/
        ├── main.jsx                  # React root: QueryClient, BrowserRouter, BeginnerProvider, Toaster
        ├── App.jsx                   # shell: sidebar (desktop) / top+bottom bars (mobile), route table
        ├── styles.css                 # the material layer — card/panel/button/input primitives
        │
        ├── lib/
        │   ├── api.js                #   one function per backend endpoint (see §18)
        │   ├── beginner.jsx          #   Beginner-mode React context, persisted to localStorage
        │   └── glossary.js           #   ⓘ tooltip copy, keyed by term
        │
        ├── components/
        │   ├── Score.jsx             #   ScoreBadge, SignalArc (signature UI element), Breakdown, RiskReward
        │   ├── AiText.jsx            #   renders LLM markdown as styled React nodes (no dangerouslySetInnerHTML)
        │   ├── Delta.jsx             #   signed +/− percentage, the app's only chroma
        │   ├── Segmented.jsx         #   sliding-capsule segmented control (Global/India toggles)
        │   ├── PageHeader.jsx        #   eyebrow → title → lede masthead, shared by every page
        │   ├── TapeRail.jsx          #   live index ticker pinned above the whole app
        │   ├── TickerSearch.jsx      #   company-name → ticker autocomplete
        │   └── InfoTip.jsx           #   tap/hover ⓘ tooltip, edge-aware positioning
        │
        └── pages/
            ├── Dashboard.jsx         #   / — index levels + breadth chart
            ├── Analyze.jsx           #   /analyze/:ticker — chart, score, quick + deep research
            ├── TopPicks.jsx          #   /picks — ranked universe or custom list
            ├── DailyReport.jsx       #   /daily — briefing, movers, news
            ├── Watchlist.jsx         #   /watchlist — tracked symbols
            ├── Portfolio.jsx         #   /portfolio — held positions, live P&L
            └── NotFound.jsx          #   404 page
```

---

## 5. Backend — configuration

Everything the backend needs is one typed `Settings` object, defined in
[`backend/config.py`](backend/config.py) with `pydantic-settings`:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    llm_provider: str = "ollama"
    together_api_key: str = ""
    together_model_quick: str = "openai/gpt-oss-20b"
    # … one block per provider …

    polygon_api_key: str = ""
    fmp_api_key: str = ""
    newsapi_key: str = ""
    # … optional data-provider keys …

    api_access_key: str = ""
    rate_limit_per_min: int = 0
    cors_origins: str = "http://localhost:5173,https://localhost,capacitor://localhost,http://localhost"

settings = Settings()
```

Two things matter about this design:

- **Every field has a safe default.** The app boots and runs with zero configuration —
  market data works with no keys via yfinance, and a missing LLM key surfaces as a clean
  per-request error rather than a startup crash. This is why `LLMClient._get_anthropic()`
  lazily constructs its client instead of doing it in `__init__`.
- **`_ENV_FILE` is resolved relative to the file itself** (`Path(__file__).parent / ".env"`),
  not the process's working directory — so `.env` loads correctly whether you run
  `uvicorn main:app` from `backend/` or launch it from the repo root via `run.ps1`.

`settings` is a module-level singleton imported everywhere (`from config import settings`)
— there's exactly one instance for the life of the process.

---

## 6. Backend — the LLM abstraction layer

[`backend/utils/llm.py`](backend/utils/llm.py) is the single choke point every AI feature
in the app calls through. It solves one problem: **the rest of the codebase should never
know or care which LLM provider is configured.**

### The 3-tier system

Every call site asks for a *tier*, not a model name:

```python
Tier = Literal["quick", "agent", "report"]
```

| Tier | Used for | Reasoning budget needed |
|---|---|---|
| `quick` | Single-asset summaries, score explanations, the daily briefing | Low — a few sentences from structured data |
| `agent` | The 4 deep-research analysts, ranking explanations | Medium — reasoning over several data sources |
| `report` | The final deep-research synthesis + verdict | High — reconciling 4 analyst reports into one coherent call |

`_model_for(tier)` maps a tier to a real model name **per provider**:

```python
def _model_for(self, tier: Tier) -> str:
    if self.provider == "together":
        return {
            "quick": settings.together_model_quick,
            "agent": settings.together_model_agent,
            "report": settings.together_model_report,
        }[tier]
    # … same shape for anthropic / openai_compat / gemini / ollama …
```

This is a deliberate cost lever: cheap models carry the frequent, low-stakes calls, and
the expensive flagship model is reserved for the one call that actually decides the
verdict. On Together AI (the default), the whole tier system costs about **$0.02 per
deep-research run** (5 LLM calls total).

| Tier | Together model | Price /1M tokens |
|---|---|---|
| `quick` | `openai/gpt-oss-20b` | $0.05 / $0.20 |
| `agent` | `deepseek-ai/DeepSeek-V4-Flash-0731` | $0.14 / $0.28 |
| `report` | `deepseek-ai/DeepSeek-V4-Pro` | $1.74 / $3.48 |

### One HTTP helper for four providers

Together, Gemini, Groq/OpenRouter (`openai_compat`) all expose the same
`POST {base_url}/chat/completions` shape. Rather than duplicating request/response
handling four times, `_chat_completion()` is shared:

```python
async def _chat_completion(self, prompt, system, model, max_tokens, temperature, *,
                            base_url, api_key, key_hint) -> str:
    if not api_key:
        raise RuntimeError(f"{key_hint} missing — set it in .env for this provider")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system or "You are a helpful trading analyst."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(f"{base_url.rstrip('/')}/chat/completions",
                               json=payload, headers={"Authorization": f"Bearer {api_key}"})
        r.raise_for_status()
        data = r.json()

    choices = data.get("choices") or []
    if not choices:
        err = data.get("error") or data
        raise RuntimeError(f"LLM returned no choices: {str(err)[:300]}")
    message = choices[0].get("message") or {}
    content = message.get("content") or message.get("reasoning_content") or ""
    content = content.strip()
    if not content:
        raise RuntimeError(f"LLM returned an empty completion "
                            f"(model={model}, finish_reason={choices[0].get('finish_reason')})")
    return content
```

The defensive parsing at the end matters in practice: some providers return **HTTP 200
with an error body** (a bad model name doesn't 4xx), and reasoning-style models sometimes
put their answer in `reasoning_content` while leaving `content: null`. A naive
`data["choices"][0]["message"]["content"].strip()` would raise an opaque `KeyError` or
`AttributeError` for either case. This version raises a message that actually says what
went wrong.

Anthropic (native SDK, synchronous) and Ollama (its own `/api/generate` shape) each get
their own small method, `_anthropic_complete` and `_ollama_complete`.

### Public surface

```python
llm = LLMClient()                                   # module-level singleton, uses settings.llm_provider
await llm.complete("prompt text", system="...", tier="quick")   # -> str
await llm.health()                                   # -> {"provider": ..., "ok": bool, ...}  no key leaked
```

`health()` powers `GET /api/health` — it reports whether a key is configured (`ok: bool`)
and, for Together, the exact model resolved per tier, without ever including the key
itself in the response.

---

## 7. Backend — data layer (MCP servers)

Every external data source is wrapped by a module in `backend/mcp_servers/`. The contract
every module follows: **return a dict/list, never raise past your own boundary** — a bad
symbol or a timed-out provider degrades to `{"error": "..."}` or an empty list, not an
exception that bubbles up and 500s a page.

| Module | Provides | Primary source | Fallback |
|---|---|---|---|
| `market_data_mcp.py` | quotes, OHLCV candles, RSI/MACD/SMA, 52-week range, ticker search | yfinance (free) | Polygon.io if `POLYGON_API_KEY` set (US only) |
| `news_mcp.py` | per-ticker news, region market-news (curated RSS) | NewsAPI if `NEWSAPI_KEY` set | Yahoo Finance RSS |
| `fundamentals_mcp.py` | valuation ratios, income statement, analyst ratings | FMP if `FMP_API_KEY` set | yfinance `.info` |
| `social_sentiment_mcp.py` | Stocktwits bull/bear ratio, Reddit mentions, Fear & Greed index | Stocktwits API (no key), alternative.me | Reddit is a stub pending `REDDIT_CLIENT_ID` |
| `options_flow_mcp.py` | options chain, put/call ratio | yfinance | — |
| `portfolio_mcp.py` | position storage + live valuation | in-memory dict, enriched with `market_data_mcp.get_quote` | — |

### Worked example: `market_data_mcp.get_quote`

This function shows the pattern used throughout: check cache → try the paid provider if
configured → fall back to the free one → normalize the shape → cache the result.

```python
async def get_quote(ticker: str) -> dict[str, Any]:
    key = f"quote:{ticker.upper()}"
    cached = await cache_get(key)
    if cached:
        return cached

    mkt = market_for(ticker)          # exchange/currency/region metadata (utils/markets.py)
    meta = {"exchange": mkt.exchange, "region": mkt.region,
            "currency": mkt.currency, "currency_symbol": mkt.currency_symbol}

    if settings.polygon_api_key and mkt.exchange == "US":
        # … Polygon path, only for US symbols when a key is configured …

    info = await asyncio.to_thread(_fetch_fast_info, ticker)   # yfinance is sync — run off the loop
    result = {"ticker": ticker.upper(), "price": _clean(info["last_price"], 4),
              "previous_close": _clean(info["previous_close"], 4), "source": "yfinance", **meta}
    if result["price"] and result["previous_close"]:
        result["change"] = _clean(result["price"] - result["previous_close"], 4)
        result["change_pct"] = _clean((result["price"] - result["previous_close"])
                                       / result["previous_close"] * 100, 2)
    await cache_set(key, result, ttl=60)
    return result
```

Two details worth calling out:

- **`asyncio.to_thread`** — yfinance is a synchronous library. Every yfinance call in this
  codebase is wrapped this way so it doesn't block FastAPI's single event loop while
  waiting on a network response.
- **`_fetch_fast_info` reads each field defensively.** yfinance's `fast_info` lazily
  parses Yahoo's metadata and can raise `KeyError` for a field like
  `currentTradingPeriod` on indices or non-US tickers with partial payloads. Each attribute
  is read through a `_safe()` helper that swallows the exception, and if both price fields
  come back `None`, it falls back to a 5-day price history instead.

### `curl_cffi` and the 429 problem

`yfinance==1.4.1` is paired with `curl_cffi` in `requirements.txt` specifically because
Yahoo Finance rate-limits (`HTTP 429`) requests that look like a plain Python script.
`curl_cffi` makes yfinance's outbound requests impersonate a real browser's TLS
fingerprint, which is the standard workaround the yfinance community uses. Combined with
caching (below) and the screener's bounded concurrency, this keeps the app usable on the
free tier without a paid data key.

### News: region feeds + an entertainment filter

`news_mcp.py` is the one MCP module with a genuinely interesting filtering problem: RSS
feeds tagged "markets" often leak entertainment content (box-office news, streaming
releases). The filter uses **word-boundary regex**, not substring matching, because
substring matching produced real false positives during development — `"season"` inside
`\bseason\b`-style entertainment terms was blocking headlines like *"Earnings season kicks
off"*:

```python
_BLOCK_PATTERN = re.compile(
    r"\b(web[- ]series|box office|movie review|bollywood|ott|trailer|"
    r"actress|first look|netflix series|release date)\b", re.IGNORECASE)

_FINANCE_PATTERN = re.compile(
    r"\b(stocks?|shares?|markets?|nifty|sensex|earnings|revenue|ipo|"
    r"investors?|rally|index|fed|rbi|inflation|budget|gdp)\b", re.IGNORECASE)

def _is_entertainment(title: str) -> bool:
    if not _BLOCK_PATTERN.search(title):
        return False
    return not _FINANCE_PATTERN.search(title)   # finance vocabulary always wins
```

So *"Netflix series drives Q3 revenue beat"* survives (finance vocabulary present) while
*"New web series trailer drops"* is dropped. Region feeds are curated separately —
Yahoo/CNBC/MarketWatch for global, Economic Times/Moneycontrol/Business Standard for
India — merged, de-duplicated by title, and cached for 15 minutes.

---

## 8. Backend — caching strategy

[`backend/utils/cache.py`](backend/utils/cache.py) is a two-line public API used
everywhere data is fetched:

```python
await cache_get(key)                 # -> value or None
await cache_set(key, value, ttl=60)  # seconds
```

Underneath, it tries Redis first (`REDIS_URL`), and if that's unreachable — no server
running, wrong URL, whatever — it transparently falls back to an in-memory dict, checked
once via a `_get_redis()` helper that caches its own "unavailable" result (`False`) so it
doesn't retry a ping on every single call:

```python
async def _get_redis():
    global _redis
    if _redis is not None or redis_async is None:
        return _redis
    try:
        client = redis_async.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        _redis = client
    except Exception:
        _redis = False          # sentinel: "checked, unavailable"
    return _redis if _redis else None
```

The in-memory fallback needs its own eviction, since it has no TTL enforcement of its own
until read:

```python
_MEM_MAX_KEYS = 500
_SWEEP_EVERY_SECS = 120

def _sweep_mem(now):
    expired = [k for k, (exp, _) in _mem.items() if exp < now]
    for k in expired: _mem.pop(k, None)
    while len(_mem) > _MEM_MAX_KEYS:
        _mem.pop(next(iter(_mem)), None)   # oldest insertion first
```

The sweep is amortized — it only runs when the sweep interval has elapsed *or* the map is
already over its cap — rather than on every write, so cache writes stay cheap.

### TTLs, tuned per data's actual volatility

| Data | TTL | Why |
|---|---|---|
| Live quote | 60s | Prices move; the dashboard also polls every 30s from the frontend |
| Daily OHLCV candles | 3600s (1h) | A daily candle only changes once a day — the screener scans a whole universe and would otherwise hammer yfinance |
| Intraday candles | 300s | More volatile, shorter cache |
| Ticker search results | 300s | Company names don't change; symbols rarely do |
| News (per-ticker & region) | 900s (15m) | Balances freshness against RSS/API load |
| Fundamentals (ratios) | 3600s | Quarterly-ish data, safe to cache for an hour |
| Stocktwits sentiment | 600s | Message volume is bursty but not second-by-second |

---

## 9. Backend — the scoring engine (the math)

[`backend/utils/scoring.py`](backend/utils/scoring.py) is **pure Python — zero LLM calls**
— and it's the source of every number in the Signal Score and trade-math panels. This is
deliberate: the score has to be reproducible and auditable, not a model's opinion.

### Indicators from one price series

`indicators_from_closes()` computes RSI(14), MACD histogram, SMA50, SMA200 from a list of
closing prices, using a hand-rolled EMA:

```python
def _ema(values: list[float], span: int) -> list[float]:
    k = 2 / (span + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out
```

RSI follows the textbook Wilder formula — average gain / average loss over 14 periods,
`RSI = 100 - 100/(1+RS)`. MACD histogram is `EMA12 - EMA26`, minus its own 9-period EMA
signal line.

**Why derive everything from one candle fetch instead of three separate calls?** The
screener scans a whole universe of tickers per request. Fetching a year of daily candles
*once* per ticker and deriving RSI/MACD/SMA/52-week-range/volatility all locally — instead
of hitting yfinance three or four times per symbol — is what keeps the screener under
Yahoo's rate limit.

### Volatility → expected move

```python
def realized_volatility(closes, window=30):
    rets = [(closes[i]-closes[i-1])/closes[i-1] for i in range(1, len(closes))]
    win = rets[-window:]
    mean = sum(win)/len(win)
    var = sum((r-mean)**2 for r in win)/len(win)
    daily_std = math.sqrt(var)
    return round(daily_std * math.sqrt(252) * 100, 2)   # 252 trading days/year

def expected_monthly_move(vol_annual):
    return round(vol_annual / math.sqrt(12), 2)
```

Standard annualization: daily standard deviation of returns × √252 trading days. Dividing
the annual figure by √12 gives the expected ±% swing over roughly one month — this is what
powers the "Expected monthly move: ±X%" figure shown on every ticker.

### Trade math — entry / target / stop / risk-reward

```python
def trade_metrics(price, sma50, sma200, high_52w, low_52w, vol_annual):
    monthly = expected_monthly_move(vol_annual)

    supports = [lvl for lvl in (sma50, sma200, low_52w) if lvl and lvl < price]
    stop = max(supports) if supports else (low_52w or price * 0.92)

    if high_52w and high_52w > price:
        target, target_basis = high_52w, "52-week high (resistance)"
    else:
        bump = (monthly or 8.0) / 100
        target, target_basis = round(price * (1 + bump), 2), "at new highs — projected +1 monthly move"

    upside_pct = round((target - price) / price * 100, 2)
    downside_pct = round((price - stop) / price * 100, 2)
    risk_reward = round(upside_pct / downside_pct, 2) if downside_pct > 0 else None
```

In plain terms:
- **Stop** = the nearest support level *below* the current price, picking the highest of
  SMA50 / SMA200 / 52-week-low that actually sits under it (the closest one, i.e. the
  tightest reasonable invalidation level).
- **Target** = the 52-week high, if price hasn't already broken through it. If price is
  already at new highs (no resistance overhead), the target instead projects one expected
  monthly move higher — the "breakout" case.
- **Risk-reward** = upside% ÷ downside%. A 3:1 reads as "you stand to gain 3× what you're
  risking if the target is hit before the stop."

This whole function returns `{"error": "no price"}` if there's no price at all — every
caller checks for that key before rendering.

### The composite 0–100 score

Four factors, weighted, each with its own reason string:

```python
def score(*, price, rsi, macd_hist, sma50, sma200, risk_reward, stocktwits_ratio):
    components = [
        ("Trend",       *_trend_points(price, sma50, sma200)),        # max 30
        ("Momentum",    *_momentum_points(rsi, macd_hist)),           # max 25
        ("Risk/Reward", *_rr_points(risk_reward)),                    # max 25
        ("Sentiment",   *_sentiment_points(stocktwits_ratio)),        # max 20
    ]
    total = round(sum(c[1] for c in components), 1)
    breakdown = [{"factor": name, "points": pts, "max": mx, "reason": reason}
                 for name, pts, mx, reason in components]
    return {"total": total, "label": _label(total), "breakdown": breakdown}
```

| Factor | Max points | Logic |
|---|---|---|
| **Trend** | 30 | Full points for `price > SMA50 > SMA200` (a clean uptrend); scaled down through "above SMA200 only," "below both" |
| **Momentum** | 25 | RSI (15 pts): 55–68 is the "healthy bullish" sweet spot, >78 is overbought (penalized), <35 is oversold. MACD histogram (10 pts): positive = bullish |
| **Risk/Reward** | 25 | ≥3:1 is excellent (25 pts), ≥2:1 strong (20), ≥1:1 thin (8), <1:1 poor (3) |
| **Sentiment** | 20 | Stocktwits bull:bear ratio — ≥2× is strongly bullish (20 pts), ≤0.5× is bearish crowd (3) |

```python
def _label(total):
    if total >= 75: return "STRONG BUY"
    if total >= 60: return "BUY"
    if total >= 42: return "HOLD"
    if total >= 28: return "SELL"
    return "STRONG SELL"
```

Every one of the four `_*_points()` helper functions returns `(points, max, reason)` —
that reason string is exactly what renders under each bar in the score breakdown UI
(`components/Score.jsx`'s `<Breakdown>`). Nothing in the UI reason text is invented by an
LLM; it's the literal string this function produced (e.g. `"RSI 61.2 healthy-bullish"`).

---

## 10. Backend — services (business logic)

Services sit between routers and the data/scoring layers — this is where multiple MCP
calls and an optional LLM call get composed into one feature response.

### `analysis_service.py` — Quick Analysis

One LLM call (`tier="quick"`) over a quote + indicators + 52-week range + 5 recent
headlines. Output is a structured block the LLM is instructed to always produce:
`SENTIMENT (BULLISH/NEUTRAL/BEARISH)`, `SUMMARY`, `KEY LEVELS`, `WATCHPOINTS`. This is the
"seconds, not minutes" analysis button on the Analyze page — one round trip, no
background job.

### `research_service.py` — deep-research job store

Deep research (the 5-agent crew) takes long enough that it has to run as a background
job the frontend polls, not a request/response. This module is an in-memory job store:

```python
_JOBS: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_MAX_JOBS = 50

def create_job(ticker) -> dict:
    job = _new_job(ticker)          # status="running", one entry per agent, all "pending"
    _JOBS[job["id"]] = job
    _evict_old_jobs()               # drop the oldest job once over 50
    return job

async def run_job(job_id) -> None:
    async def progress_cb(agent_name, status):
        for a in job["agents"]:
            if a["name"] == agent_name:
                a["status"] = status
    result = await run_deep_research(job["ticker"], progress_cb=progress_cb)
    job["report"], job["verdict"], job["sections"], job["status"] = (
        result["report"], result["verdict"], result["sections"], "done")
```

`_MAX_JOBS = 50` matters because each finished job holds the *entire* report plus every
agent's raw gathered data (candles, headlines, ratios) — an unbounded dict here would
slowly leak the container's memory over a long-running deploy. `OrderedDict.popitem(last=False)`
evicts the oldest job first once the cap is hit.

`POST /api/analyze/deep/{ticker}` calls `create_job()` and schedules `run_job()` via
FastAPI's `BackgroundTasks`, returning the job id immediately. `GET
/api/analyze/report/{id}` is what the frontend polls every 1.5s while `status == "running"`.

### `screener_service.py` — Top Picks

This is the most involved service — two layers on purpose, described in its own
docstring: **deterministic math is the auditable evidence; the LLM turns that evidence
into a human-readable reason.** If the LLM is unavailable, a rule-based fallback reason is
built straight from the math instead of failing silently.

```python
async def _compute(ticker) -> dict:
    quote, candles, social, news = await asyncio.gather(
        market_data_mcp.get_quote(ticker),
        market_data_mcp.get_ohlcv(ticker, "1d", 365),   # ONE year fetch, reused for everything
        social_sentiment_mcp.get_stocktwits_sentiment(ticker),
        news_mcp.get_news(ticker, limit=1),
        return_exceptions=True,
    )
    indicators = scoring.indicators_from_closes(closes)
    range52 = scoring.range_52w_from_candles(candles)
    metrics = scoring.trade_metrics(price=..., sma50=..., ...)
    sc = scoring.score(price=..., rsi=..., risk_reward=metrics["risk_reward"], ...)
    return {"ticker": ..., "score": sc["total"], "label": sc["label"],
            "breakdown": sc["breakdown"], "metrics": metrics, ...}
```

`return_exceptions=True` on every `asyncio.gather` in this file is a load-bearing detail:
one rate-limited or bad ticker degrades to an empty dict for that one field, instead of a
single exception killing the entire batch of 10–14 tickers being scored.

**Ranking + explanation** happens in two passes. `rank()` scores every ticker (bounded to
`_MAX_CONCURRENCY = 4` concurrent fetches via a semaphore — another rate-limit guard),
sorts by score, then calls `_rank_reasons()` for **one single LLM call** that explains the
*entire* ranking at once (cheaper than one call per ticker):

```python
prompt = ("Ranked tickers (highest score first):\n" + "\n".join(lines) +
          "\n\nWrite ONE sentence per ticker on why it ranks there vs the others, then a "
          "final summary. Output strictly, one per line:\nTICKER :: reason\n...\nOVERALL :: summary")
```

The response is parsed line-by-line on the `::` delimiter and matched back to tickers by
**whole-token matching**, not substring matching:

```python
tokens = {t.strip("#.,:*()[]") for t in key.split()}
for tok in tokens:
    if tok in by_ticker and tok not in reasons:
        reasons[tok] = val
        break
```

This exists because of a real bug found during development: naive substring matching on
`"V"` (Visa's ticker) matched inside `"NVDA"`, so Visa's row silently displayed NVIDIA's
reasoning. Splitting each line into whitespace tokens and stripping list-marker punctuation
(`#1`, `1.`, etc.) before comparing fixes it.

`top(region, limit)` is the "Top Picks" entry point — it just calls `rank()` against the
built-in `SCREENER_UNIVERSE` for that region (see `utils/markets.py`) instead of a caller-
supplied list.

### `daily_service.py` — Daily Report

Assembles global + India indices, the top 5 gainers/losers (drawn from the index baskets
*plus* any watchlist tickers the caller passes — nothing hardcoded), and global + India
news — all deterministic — then makes exactly **one** LLM call (`tier="quick"`) to write a
5-bullet briefing over that assembled context:

```python
_BRIEFING_SYSTEM = """... MARKET TONE: one line ... Then 5 short bullets covering:
index direction, the standout mover and why, one cross-asset note (gold/crypto/FX),
and one thing to watch. Be factual, cite the numbers you were given, no hype,
no price targets."""
```

If the LLM call fails, the briefing field is replaced with `"(briefing unavailable:
{error})"` rather than failing the whole report — indices, movers and news still render.

---

## 11. Backend — the deep-research agent crew

`backend/agents/` implements the "5-agent deep research" feature: `POST
/api/analyze/deep/{ticker}` → four analysts run **concurrently**, each reasoning over its
own data domain, then a fifth "manager" agent synthesizes their four reports into one
verdict.

```
ResearchAgent   (fundamentals)   ┐
TechnicalAgent  (price/indicators)├─  asyncio.gather — run concurrently
SentimentAgent  (news/social/options)│  (independent data domains)
RiskAgent       (volatility/catalysts)┘
                                        ▼
                              ReportAgent (manager)
                        synthesizes → structured report + VERDICT
```

### Why not CrewAI's autonomous tool-calling

This is explained directly in [`backend/agents/README.md`](backend/agents/README.md), and
it's a real architectural decision worth understanding: MarketMind has to run on **both**
the Claude API and small local Ollama models (`llama3.1:8b`, `qwen2.5:7b`). Small
open-source models have weak, inconsistent function-calling — letting them autonomously
decide which tool to call (CrewAI's default mode) is unreliable on that class of model.

So instead, every agent follows a fixed two-step contract defined in `agents/base.py`:

```python
class Agent:
    async def gather(self, ticker: str) -> dict:
        """Pull the raw data this agent reasons over. Override per agent."""
        return {}

    async def reason(self, ticker: str, data: dict, context: str = "") -> str:
        """Send gathered data (+ optional upstream context) to the LLM."""
        blocks = "\n\n".join(f"{k.upper()}:\n{v}" for k, v in data.items())
        prompt = (f"Ticker under analysis: {ticker.upper()}\n\nDATA PROVIDED:\n{blocks}\n\n"
                  f"Produce your section now. Be specific, cite the numbers above, "
                  f"and do not invent data you were not given.")
        return await llm.complete(prompt, system=self.system_prompt, tier=self.tier,
                                   max_tokens=900, temperature=0.3)

    async def run(self, ticker, context="") -> dict:
        data = await self.gather(ticker)
        output = await self.reason(ticker, data, context)
        return {"agent": self.name, "role": self.role, "output": output, "data": data}
```

`gather()` is deterministic Python — it calls MCP servers directly, no LLM involved in
deciding *what* to fetch. `reason()` is the only LLM call, and it's given exactly the data
`gather()` collected, with an explicit instruction not to invent numbers it wasn't given.
This is robust on every provider (including 8B local models) while still producing the
same 5-role structure the original design called for. Swapping to real autonomous
CrewAI tool-calling later would only touch these files — nothing upstream changes.

### The four analysts

| Agent | Data it gathers (`gather()`) | What it's asked to produce |
|---|---|---|
| **ResearchAgent** | `fundamentals_mcp`: valuation ratios, 4-year income statement, analyst ratings | What the company does, competitive moat, financial performance trend, key business risks |
| **TechnicalAgent** | `market_data_mcp`: quote, RSI/MACD/SMA, 52-week range, 30 days of recent closes | Primary trend with evidence, support/resistance levels, momentum reading, a suggested entry/stop/target setup |
| **SentimentAgent** | `news_mcp` (8 headlines) + `social_sentiment_mcp` (Stocktwits, Reddit, Fear & Greed) + `options_flow_mcp` (put/call ratio) | News sentiment, social bull/bear ratio, options signal, an overall sentiment verdict |
| **RiskAgent** | `market_data_mcp` (90-day realized volatility, computed via `scoring.realized_volatility`) + `fundamentals_mcp` (beta) + `options_flow_mcp` (put/call ratio) | Upcoming catalysts, macro sensitivity, what the volatility figure implies for expected move, key risk events |

All four run at `tier="agent"`.

### The crew orchestrator

```python
ANALYSTS = [ResearchAgent(), TechnicalAgent(), SentimentAgent(), RiskAgent()]

async def run_deep_research(ticker, progress_cb=None):
    async def _run_analyst(agent):
        await _notify(agent.name, "running")
        try:
            result = await agent.run(ticker)
            await _notify(agent.name, "done")
            return result
        except Exception as e:   # one analyst failing shouldn't kill the whole report
            await _notify(agent.name, "error")
            return {"agent": agent.name, "role": agent.role, "output": f"(unavailable: {e})", "data": {}}

    sections = await asyncio.gather(*(_run_analyst(a) for a in ANALYSTS))
    synthesis = await report_agent.synthesize(ticker, list(sections))
    return {"ticker": ticker.upper(), "sections": list(sections),
            "report": synthesis["report"], "verdict": synthesis["verdict"]}
```

`progress_cb` is what makes the live agent-status UI on the Analyze page possible without
WebSockets — it's just a callback invoked as each agent starts/finishes, which
`research_service.run_job()` uses to mutate the in-memory job record that the frontend
polls.

### The synthesis (`report_agent.py`)

Runs at `tier="report"` — the one expensive call — and is given a strict output contract
so the verdict can be parsed reliably out of free text:

```python
SYSTEM = """... Synthesize their findings into a single coherent report with EXACTLY
these sections: EXECUTIVE SUMMARY, INVESTMENT THESIS, KEY RISKS, TECHNICAL SETUP,
WATCHPOINTS, VERDICT: <STRONG BUY|BUY|HOLD|SELL|STRONG SELL> ..."""

def _parse_verdict(text: str) -> str:
    m = re.search(r"VERDICT:\s*\**\s*(STRONG BUY|STRONG SELL|BUY|SELL|HOLD)", text, re.IGNORECASE)
    if m: return m.group(1).upper()
    upper = text.upper()
    for v in _VERDICTS:
        if v in upper: return v
    return "HOLD"                    # last-resort default if the model ignores the format
```

The regex handles the model wrapping the verdict in markdown bold (`**VERDICT: BUY**`);
the fallback scan handles a model that mentions a verdict word without following the exact
`VERDICT:` prefix. `"HOLD"` as the ultimate fallback is a deliberate choice — better to
default to "no strong call" than to guess bullish or bearish from a parse failure.

---

## 12. Backend — API routers (endpoint reference)

`backend/main.py` mounts every router under one `APIRouter(prefix="/api")`, which is
itself mounted on the FastAPI app. This single decision is why the app can be served from
one origin: without the `/api` prefix, a route like `/portfolio` in the API would collide
with the React page of the same name in single-service deployment.

```python
api = APIRouter(prefix="/api")
api.include_router(health.router)
api.include_router(market.router)
api.include_router(analyze.router)
api.include_router(screener.router)
api.include_router(watchlist.router)
api.include_router(portfolio.router)
app.include_router(api)
```

| Method | Path | Router | Guarded?* | Purpose |
|---|---|---|---|---|
| GET | `/api/health` | `health.py` | no | App + LLM provider status |
| GET | `/api/market/search?q=` | `market.py` | no | Company name/ticker autocomplete |
| GET | `/api/market/indices?region=` | `market.py` | no | Index basket for a region |
| GET | `/api/market/quote/{ticker}` | `market.py` | no | Live quote |
| GET | `/api/market/ohlcv/{ticker}?days=` | `market.py` | no | Candle history |
| GET | `/api/market/indicators/{ticker}` | `market.py` | no | RSI/MACD/SMA |
| GET | `/api/market/52week/{ticker}` | `market.py` | no | 52-week high/low |
| GET | `/api/analyze/quick/{ticker}` | `analyze.py` | **yes** | One-shot AI analysis |
| POST | `/api/analyze/deep/{ticker}` | `analyze.py` | **yes** | Start the 5-agent crew, returns `report_id` |
| GET | `/api/analyze/report/{id}` | `analyze.py` | **yes** | Poll job status / final report |
| POST | `/api/screener/rank` `{tickers}` | `screener.py` | **yes** | Score + rank a custom list |
| GET | `/api/screener/top?region=&limit=` | `screener.py` | **yes** | Top-N from the built-in universe |
| GET | `/api/screener/score/{ticker}?explain=` | `screener.py` | **yes** | Score + trade math (+ optional LLM reason) |
| POST | `/api/daily/report` `{tickers}` | `screener.py` | **yes** | Full daily report |
| GET | `/api/watchlist` | `watchlist.py` | no | List + live-price the watchlist |
| POST/DELETE | `/api/watchlist/{ticker}` | `watchlist.py` | no | Add/remove a symbol |
| GET | `/api/portfolio` | `portfolio.py` | no | Positions with live P&L |
| POST | `/api/portfolio/position` | `portfolio.py` | no | Add/update a position |
| DELETE | `/api/portfolio/position/{ticker}` | `portfolio.py` | no | Remove a position |
| GET | `/api/portfolio/stats` | `portfolio.py` | no | Totals grouped by currency |

\* "Guarded" = carries `Depends(require_key)` + `Depends(rate_limit)` — both are no-ops
unless `API_ACCESS_KEY` / `RATE_LIMIT_PER_MIN` are set (see §13). These are exactly the
routes that spend LLM tokens or fan out to many data calls, which is why they're the ones
worth protecting on a public deploy.

Every router is intentionally thin — a handler unpacks the request, calls exactly one
service or MCP function, and returns its result (or raises `HTTPException` on a genuine
404/500). All the actual logic lives one layer down in `services/` or `mcp_servers/`.

### Serving the built frontend

The bottom of `main.py` handles single-service hosting:

```python
_STATIC = Path(__file__).parent / "static"        # populated by the Docker build

if (_STATIC / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path:
            candidate = (_STATIC / full_path).resolve()
            if candidate.is_file() and candidate.is_relative_to(_STATIC.resolve()):
                return FileResponse(candidate)
        return FileResponse(_STATIC / "index.html")   # client-side routes survive a refresh
```

The `is_relative_to(_STATIC.resolve())` check is a **path-traversal guard** — without it,
a request like `/../../etc/passwd` (resolved against `_STATIC`) could escape the intended
directory. It's tested directly in `test_static_serving.py::test_path_traversal_cannot_escape_static_dir`.

When `backend/static/` doesn't exist (local dev, running tests — the Docker build is what
creates it by copying the React `dist/`), the API simply runs standalone and Vite serves
the UI on its own dev server instead.

---

## 13. Backend — security guards

[`backend/utils/guard.py`](backend/utils/guard.py) — two FastAPI dependencies, both
**off by default** so local development has zero friction:

```python
async def require_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = settings.api_access_key
    if not expected:
        return                                    # no-op unless configured
    if x_api_key != expected:
        raise HTTPException(401, "Invalid or missing X-API-Key")

async def rate_limit(request: Request) -> None:
    limit = settings.rate_limit_per_min
    if limit <= 0:
        return                                    # no-op unless configured
    client = request.client.host if request.client else "unknown"
    window = _hits.setdefault(client, deque())
    while window and time.time() - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(429, "Rate limit exceeded — try again in a minute")
    window.append(time.time())
```

`rate_limit` is a sliding-window counter per client IP, held in a plain dict of deques
(`_MAX_CLIENTS = 1000` caps the dict itself from growing unbounded under a flood of unique
IPs — it's cleared wholesale if that cap is hit).

**Why these exist and why they're opt-in:** once the API is public, anyone who finds the
URL can drain your LLM quota and any paid data-provider keys just by hammering
`/api/analyze/deep/*`. `RATE_LIMIT_PER_MIN=20` is the recommended setting for a personal
deploy. `API_ACCESS_KEY` exists for real access control, but note: the browser frontend
never sends this header, so setting it on a deploy that also serves the public web UI
would lock out your own app — it's meant for API-only or trusted-caller scenarios.

---

## 14. Frontend — design system ("Instrument")

The UI follows a single, consistently-applied direction rather than default Tailwind
styling. Every token lives in [`frontend/tailwind.config.js`](frontend/tailwind.config.js)
and the material primitives in [`frontend/src/styles.css`](frontend/src/styles.css).

### The two rules everything follows

1. **Color means direction.** Green is up, red is down (`bull`/`bear`), and *nothing else
   in the interface is allowed a hue* — no brand accent color, no gradients. Emphasis
   (primary buttons, active nav) is bone-on-graphite instead, so a `+0.4%` is never
   competing with decoration for the eye.
2. **Depth is lightness, not borders.** A "raised" surface is a lighter surface with a
   hairline catching light along its top edge, not a drop shadow or a colored border.

### The color ladder

```js
colors: {
  bg: '#0a0a0c', surface: '#131316', elevated: '#1a1a1f', raised: '#24242b',
  border: '#26262d',
  primary: '#f2f2f5',                          // the accent IS light — no brand hue
  bull: '#30d158', bear: '#ff453a', warn: '#ffd426',
  text: { primary: '#f2f2f5', secondary: '#a1a1a9', tertiary: '#7e7e86' },
}
```

Every text step clears WCAG AA contrast against the card surface (`#131316`):
`primary` 16.6:1, `secondary` 7.6:1, `tertiary` 4.6:1 — so even the most recessive text
(section labels, captions) stays legible, not just decorative-looking.

### Type roles carry meaning, not just hierarchy

Three typefaces, and the split between them is a *semantic* convention used consistently
across the whole app:

| Role | Font | CSS class | Used for |
|---|---|---|---|
| Interface + all market figures | **Instrument Sans** (tabular) | `.num` | Prices, percentages, scores — anything the market reported |
| A model's voice | **Instrument Serif** | `.serif` | LLM prose and verdicts — anything a model wrote |
| Dense tabular data | **JetBrains Mono** | `.mono` | Portfolio/watchlist table columns |

This means you can tell "the market said this" from "a model reasoned its way to this"
without reading a single word — just by the typeface. `AiText.jsx` (the LLM-markdown
renderer) sets its whole output in `.serif` for exactly this reason.

### Material primitives (`styles.css`)

```css
.card {
  @apply relative rounded-card p-5 shadow-depth;
  background-color: theme('colors.surface');
  border: 1px solid rgba(255, 255, 255, .06);
}
.card-lift:hover {                    /* an actionable card steps up the lightness ladder */
  background-color: theme('colors.elevated');
  transform: translateY(-2px);
}
.panel {                              /* sunk INTO a card — darker, inset shadow */
  background-color: rgba(0, 0, 0, .28);
}
.material {                           /* sidebar / top bar / tab bar — vibrancy */
  background-color: rgba(19, 19, 22, .72);
  backdrop-filter: blur(28px) saturate(180%);
}
.btn { background-color: theme('colors.primary'); color: theme('colors.bg'); }   /* bone-on-ink */
```

`transitionTimingFunction.spring = cubic-bezier(.32,.72,0,1)` is used for every hover/press
transition — the same curve Apple uses for sheets and segmented controls: fast out of the
gate, long settle, no overshoot.

### The signature element: the Signal Arc

`components/Score.jsx`'s `<SignalArc>` is the one piece of UI the whole visual identity is
built around. It's a single ring, cut into four segments whose **widths are the factor
weights** (Trend 30° worth, Momentum 25°, Risk/Reward 25°, Sentiment 20° — proportional to
the scoring engine's own point allocations), each segment **filled by the fraction of
points that factor actually earned**:

```jsx
const CX = 110, CY = 104, R = 84, STROKE = 13;
const START = 144, SWEEP = 252;    // opening centred on the bottom

let cursor = 0;
const segments = factors.map((f) => {
  const a0 = START + (cursor / total) * SWEEP + GAP / 2;
  cursor += f.max;
  const a1 = START + (cursor / total) * SWEEP - GAP / 2;
  const ratio = f.max ? Math.min(1, Math.max(0, f.points / f.max)) : 0;
  return { ...f, a0, a1, ratio };
});
```

The consequence: **the total filled arc length literally equals the 0–100 score.** A
52-point score fills exactly 52% of the total track — verified directly (filled-arc-degrees
÷ track-arc-degrees = 0.520 for a score of 52). This makes the ring simultaneously the
headline number *and* the breakdown — hovering or tapping a segment swaps the centre
readout from the total score to that factor's own `points/max`.

The fill animation is drawn with `pathLength={1}` (SVG-normalizes every segment to the same
1-unit dash length regardless of its actual pixel length) and a CSS keyframe that only
declares the `from` state:

```css
@keyframes arc-sweep { from { stroke-dashoffset: 1; } }
.arc-sweep { animation: arc-sweep .9s cubic-bezier(.32, .72, 0, 1); }
```

This is a deliberate robustness choice: the element's *resting* `stroke-dashoffset: 0` is
already the fully-drawn state, so if the animation never runs for any reason (a
non-compositing embed, reduced motion, a slow device), the arc simply appears already
drawn instead of rendering invisible.

### Motion

`.stagger > *` + a `--i` custom property staggers each page's top-level sections into view
on load (55ms apart) rather than animating everything at once. `prefers-reduced-motion:
reduce` collapses every transition/animation duration to near-zero globally.

---

## 15. Frontend — app shell & routing

[`frontend/src/App.jsx`](frontend/src/App.jsx) is the shell every page renders inside.

```jsx
const nav = [
  { to: '/', label: 'Dashboard', icon: LineChart },
  { to: '/daily', label: 'Daily Report', icon: Newspaper },
  { to: '/analyze', label: 'Analyze', icon: Search },
  { to: '/picks', label: 'Top Picks', icon: Sparkles },
  { to: '/watchlist', label: 'Watchlist', icon: List },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
];
```

**Responsive without a media-query-per-component approach** — one `<TapeRail>` sits above
everything (live index ticker), then the layout forks at the `md:` breakpoint:

- **Desktop (≥768px):** a fixed 248px sidebar with the full nav + Beginner-mode toggle.
- **Mobile (<768px):** a slim top bar (brand + compact Beginner toggle) and a fixed bottom
  tab bar (icons only, safe-area-aware via `env(safe-area-inset-bottom)` for iOS notches).

```jsx
const isActive = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(to + '/');
```

This is why visiting `/analyze/RELIANCE.NS` still highlights the "Analyze" tab — a plain
`path === to` check would miss every ticker-specific URL.

Routing itself is `react-router-dom`'s `<Routes>`:

```jsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/daily" element={<DailyReport />} />
  <Route path="/analyze" element={<Analyze />} />
  <Route path="/analyze/:ticker" element={<Analyze />} />
  <Route path="/picks" element={<TopPicks />} />
  <Route path="/watchlist" element={<Watchlist />} />
  <Route path="/portfolio" element={<Portfolio />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

A `useEffect` on `loc.pathname` scrolls the `<main>` back to the top on every navigation,
so you don't land mid-scroll on a fresh page after clicking a nav link from far down a
long list.

### `main.jsx` — the provider stack

```jsx
<QueryClientProvider client={queryClient}>
  <BrowserRouter>
    <BeginnerProvider>
      <App />
      <Toaster position="top-right" toastOptions={{ ... }} />
    </BeginnerProvider>
  </BrowserRouter>
</QueryClientProvider>
```

`QueryClient` is configured with `refetchOnWindowFocus: false` (avoids a jarring reload
every time you tab back to the app) and a default `staleTime: 15_000` — most data is
"fresh enough" for 15 seconds before React Query will refetch it on a new subscriber.

The PWA service worker registers here too, gated to production only:

```jsx
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
```

---

## 16. Frontend — shared components

| Component | Purpose | Notable implementation detail |
|---|---|---|
| **`Score.jsx`** | `ScoreBadge` (label+score pill), `SignalArc` (see §14), `Breakdown` (factor bars), `RiskReward` (stop/entry/target drawn to scale) | `RiskReward`'s bar is literally sized by the stop-to-target span, so the red/green split *is* the risk/reward ratio, not just a number next to it |
| **`AiText.jsx`** | Renders LLM markdown as real React nodes — headings, bullets, **bold**, `code`, and a special "VERDICT: BUY" line treatment | No `dangerouslySetInnerHTML` anywhere; hand-parses the specific markdown subset the prompts actually produce (the agents' system prompts are literally designed around what this parser understands) |
| **`Delta.jsx`** | The signed `+1.24%` / `−0.38%` chip | The one place color enters the UI — everywhere else is grayscale |
| **`Segmented.jsx`** | Sliding-capsule toggle (Global/India, etc.) | The capsule is one absolutely-positioned div whose `translateX` moves by `index × 100%` — verified to actually animate (`translateX(0%) → translateX(100%)`) rather than just re-rendering |
| **`PageHeader.jsx`** | eyebrow → title → lede masthead | The exact same three-step shape opens all six pages, so you always know where you are before reading a word |
| **`TapeRail.jsx`** | Live index ticker pinned above the whole app | Reuses the *same* React Query cache keys (`['indices', 'global']` / `['indices', 'india']`) as the Dashboard page, so it costs zero extra network requests beyond what Dashboard already fetches |
| **`TickerSearch.jsx`** | Company-name → ticker autocomplete | 300ms debounce on `GET /api/market/search`; closes on outside click via a `mousedown` listener on `document` |
| **`InfoTip.jsx`** | The ⓘ tooltip system | Tap-*and*-hover (phones have no hover), and flips its anchor (`left`/`right`/`center`) based on the trigger's position relative to viewport edges so a tooltip on the rightmost grid cell doesn't render off-screen |

`InfoTip` content is keyed from [`lib/glossary.js`](frontend/src/lib/glossary.js) — a flat
dictionary of one-sentence, beginner-friendly definitions (`rsi`, `macd`, `risk_reward`,
`Trend`, `Sentiment`, ...) shared by every ⓘ icon in the app, so a term's definition only
needs to be written once.

---

## 17. Frontend — pages, one by one

### `Dashboard.jsx` (`/`)

Global/India toggle (`<Segmented>`) drives one query: `api.indices(region)`, refetched
every 30s. Below the index grid sits `<Breadth>` — a zero-baseline bar chart (bars grow up
for advancers, down for decliners) that's a genuinely different read of the same data than
a list of numbers: a wall of green above the line reads instantly as a different day than
two tall green bars next to eight short red ones.

### `Analyze.jsx` (`/analyze/:ticker`)

The densest page — five independent React Query subscriptions running in parallel:

```jsx
const { data: ohlcv }   = useQuery({ queryKey: ['ohlcv', ticker], queryFn: () => api.ohlcv(ticker, 180) });
const { data: quote }   = useQuery({ queryKey: ['quote', ticker], queryFn: () => api.quote(ticker), refetchInterval: 30_000 });
const { data: scored }  = useQuery({ queryKey: ['score', ticker], queryFn: () => api.scoreTicker(ticker, false), staleTime: 5*60_000 });
const { data: explained } = useQuery({ queryKey: ['score-explain', ticker], enabled: explainFor === ticker, ... });
const { data: report }  = useQuery({ queryKey: ['report', reportId], enabled: !!reportId,
                                      refetchInterval: (q) => q.state.data?.status === 'running' ? 1500 : false });
```

Two are opt-in by design, not just by UI placement: `scoreTicker(ticker, true)` (the AI
explanation) only fires once `explainFor === ticker` — set when the user clicks "Explain
this score" — so simply opening the page never silently spends an LLM call. Likewise
`runDeep()` explicitly `POST`s to start the job; the report query only activates once a
`reportId` exists, and self-polls every 1.5s exactly while `status === "running"`, then
stops.

The candlestick chart (`<Chart>`) wraps `lightweight-charts` in a `useEffect` that creates
the chart on mount and tears it down on unmount/data-change, with a `window.resize`
listener keeping it full-width.

### `TopPicks.jsx` (`/picks`)

Two data sources feeding one list: the auto-scanned universe (`api.topPicks(region, 10)`,
`staleTime: 10 minutes` since a full universe scan is expensive) or a custom ranking
(`api.rankTickers(tickers)`, a mutation) — toggled by a local `source` state
(`'top' | 'custom'`). Each row expands to reveal the `<SignalArc>`, the AI reason, and the
full `<RiskReward>` breakdown — collapsed by default so the list itself stays scannable.

### `DailyReport.jsx` (`/daily`)

Auto-generates on first load via a `useEffect` keyed on the watchlist length (so it waits
for the watchlist to resolve before including those tickers in the movers calculation),
then renders the AI briefing as an "editorial" — wider line length (`max-w-[68ch]`), set
in the serif voice — followed by index strips, gainer/loser lists, and two side-by-side
news columns (Global / India).

### `Watchlist.jsx` (`/watchlist`)

A simple add/remove table backed by `api.addWatch` / `api.removeWatch` mutations that
invalidate the `['watchlist']` query key on success. A "Rank these" shortcut navigates
straight to Top Picks, which picks the watchlist tickers up automatically.

### `Portfolio.jsx` (`/portfolio`)

Two queries: the priced position list (`api.portfolio`) and the currency-grouped totals
(`api.portfolioStats`), both refetched every 60s. The add-position form validates
client-side (`qty > 0`, `avg_price > 0`) before calling the mutation. Totals render one
card *per currency* — never summed together, matching the backend's
`portfolio_mcp.get_portfolio_stats` design (§7).

### `NotFound.jsx`

A plain 404 with a way back to the Dashboard or Analyze — the previous behavior (before
this existed) was an empty `<main>` on any unrecognized URL with no navigation at all.

---

## 18. Frontend — API client & data fetching

[`frontend/src/lib/api.js`](frontend/src/lib/api.js) is the entire HTTP surface — one
function per backend endpoint, all funneling through a single `req()` helper:

```js
const BASE = import.meta.env.VITE_API_URL || '/api';

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export const api = {
  health: () => req('/health'),
  search: (q) => req(`/market/search?q=${enc(q)}`),
  quote: (t) => req(`/market/quote/${enc(t)}`),
  scoreTicker: (t, explain = false) => req(`/screener/score/${enc(t)}?explain=${explain}`),
  deepResearch: (t) => req(`/analyze/deep/${enc(t)}`, { method: 'POST' }),
  // … one line per endpoint …
};
```

`BASE` is the one line that makes the same codebase work in three deployment shapes
without any conditional logic elsewhere:

- **Dev / single-service production:** `VITE_API_URL` unset → `BASE = '/api'`, which hits
  either the Vite dev proxy (`vite.config.js`, forwarding to the local backend) or, in
  production, the same FastAPI process serving both the SPA and `/api/*` — genuinely
  same-origin, no CORS needed.
- **Split deploy (Render + Vercel):** `VITE_API_URL` set at Vercel build time to the
  Render API's absolute URL.
- **Capacitor Android app:** no dev server or same-origin option exists inside a native
  shell, so `VITE_API_URL` is baked in at build time to the deployed backend's absolute
  URL (see `MOBILE.md`).

Every mutation in the app (`add.mutate(...)`, `remove.mutate(...)`, `rankM.mutate(...)`)
is a React Query `useMutation` whose `onSuccess` invalidates the relevant query key so the
UI refetches fresh data — there's no manual cache-patching anywhere in the app.

---

## 19. End-to-end workflows

### Loading the Dashboard

1. `App.jsx` mounts → `<TapeRail>` and `Dashboard.jsx` both fire `useQuery(['indices', 'global'])`.
2. React Query de-dupes: since both components ask for the *same* query key, only **one**
   network request goes out (`GET /api/market/indices?region=global`) despite two
   components subscribing.
3. `routers/market.py::indices` calls `market_data_mcp.get_indices('global')`.
4. That function reads `INDEX_BASKETS['global']` (10 tickers: SPY, QQQ, DIA, ^FTSE, ...)
   and fans out `get_quote()` for each concurrently via `asyncio.gather(..., return_exceptions=True)`.
5. Each `get_quote()` checks the cache first; on a cold cache it calls yfinance
   (`asyncio.to_thread`) and caches the result for 60s.
6. If one symbol fails, it becomes `{"ticker": ..., "price": None}` — the tile renders as
   "unavailable" rather than blanking the whole dashboard.
7. Both `<TapeRail>` and the index grid render from the same response; the grid also feeds
   `<Breadth>`, which recomputes its bar heights client-side from `change_pct`.
8. Every 30 seconds, React Query's `refetchInterval` repeats steps 2–7 automatically.

### Running a Quick Analysis (Analyze page)

1. User loads `/analyze/AAPL`. Chart, quote, and score queries fire immediately (all free
   — market data + pure-Python math, no LLM).
2. User clicks "Run quick read" → `runQuick()` calls `api.quickAnalysis('AAPL')` → `GET
   /api/analyze/quick/AAPL` (a **guarded** route — passes through `require_key` +
   `rate_limit`, both no-ops unless configured).
3. `analysis_service.quick_analysis()` fetches quote + indicators + 52-week range + 5
   headlines (parallel MCP calls), formats them into one prompt, and makes **one**
   `llm.complete(..., tier="quick")` call.
4. The LLM's structured response (`SENTIMENT` / `SUMMARY` / `KEY LEVELS` / `WATCHPOINTS`)
   comes back as plain text and is rendered by `<AiText>`, which parses it into styled
   headings/paragraphs in the serif voice.

### Running Deep Research (5-agent crew)

1. User clicks "Run deep research" → `POST /api/analyze/deep/AAPL`.
2. `research_service.create_job()` makes a job record (`status: "running"`, 5 agents all
   `"pending"`), returns `{report_id}` immediately, and schedules `run_job()` as a FastAPI
   `BackgroundTask` — the HTTP request returns without waiting for any agent.
3. Frontend starts polling `GET /api/analyze/report/{report_id}` every 1.5s.
4. In the background, `run_deep_research()` launches all 4 analysts concurrently via
   `asyncio.gather`. Each one: `gather()`s its own MCP data → `reason()`s over it with one
   `tier="agent"` LLM call → returns `{agent, role, output, data}`. As each finishes (or
   errors), `progress_cb` flips that agent's status in the job record from `pending` →
   `running` → `done`/`error`.
5. The frontend's poll picks up each status flip and updates `<AgentProgress>`'s dot
   colors in near-real-time (bounded by the 1.5s poll interval).
6. Once all 4 finish, `report_agent.synthesize()` runs — one `tier="report"` call over all
   4 analysts' outputs, instructed to produce the fixed 6-section structure and a
   `VERDICT:` line.
7. `_parse_verdict()` extracts the verdict label via regex; the job record flips to
   `status: "done"` with the full report, verdict, and all 4 section outputs attached.
8. The frontend's next poll sees `status: "done"`, stops polling (the `refetchInterval`
   callback returns `false`), and renders the full report plus a collapsible per-analyst
   breakdown.

### Scoring Top Picks

1. User opens `/picks` → `GET /api/screener/top?region=global&limit=10` fires
   automatically (`staleTime: 10 minutes`, since scanning a whole universe is expensive).
2. `screener_service.top()` pulls `SCREENER_UNIVERSE['global']` (14 large-cap tickers) and
   calls `rank()`.
3. `rank()` scores all 14 concurrently but bounded to 4 at a time (`asyncio.Semaphore(4)`)
   — each `_compute()` call fetches one year of candles *once* and derives RSI/MACD/SMA/
   52-week-range/volatility locally from that single fetch (§9), then calls
   `scoring.trade_metrics()` and `scoring.score()` — all pure Python, no LLM yet.
4. Results are sorted by score descending, sliced to the top 10.
5. **One** LLM call (`_rank_reasons`, `tier="agent"`) explains the entire ranking at once —
   the prompt lists all 10 tickers' scores, strongest/weakest factor, and risk/reward, and
   asks for one sentence per ticker plus an overall summary, in a strict `TICKER ::
   reason` format.
6. The response is parsed and matched back to tickers by whole-token matching (the
   Visa/NVDA collision fix, §10) — any ticker the LLM's response skipped gets a
   deterministic fallback reason built straight from its own score breakdown, so every row
   always has *some* reason.
7. Frontend renders the ranked list; each row expands on click to reveal the
   `<SignalArc>`, the AI reason, and the full trade-math breakdown.

### Building the Daily Report

1. `/daily` mounts → waits for the watchlist query to resolve, then auto-fires `POST
   /api/daily/report` with the watchlist's tickers as extra context.
2. `daily_service.build_report()` runs three things concurrently: `_movers()` (global +
   India indices, enriched with watchlist tickers, sorted into top-5 gainers/losers),
   `news_mcp.get_market_news('global')`, and `news_mcp.get_market_news('india')`.
3. All of that assembled context (index moves, movers, 8 headlines) goes into **one**
   `tier="quick"` LLM call for the briefing.
4. Response renders as: an editorial-styled AI briefing, index strips, gainer/loser lists,
   and two news columns — all from one HTTP round trip.

---

## 20. Testing

Run with `pytest` from `backend/` (needs `requirements-dev.txt` installed, which adds
`pytest` on top of the production dependencies). 8 test files, organized by concern:

| File | Covers |
|---|---|
| `test_scoring.py` | Trade-math math (basic case + at-new-highs projection), score labels across the STRONG BUY→STRONG SELL range, indicator derivation from raw closes (including graceful degradation on short history), 52-week range math, expected-move math, and that every breakdown component's points never exceed its stated max |
| `test_markets.py` | Ticker → exchange/currency/region resolution (Indian/US/crypto/other-global), news search term suffix-stripping, index basket structure, and a regression guard that **no individual company ticker is pinned into the dashboard baskets** (they're market-level instruments only) |
| `test_news_filter.py` | The entertainment-filter regex — blocks OTT/movie content, keeps genuine market news, and specifically verifies finance vocabulary isn't accidentally caught by the block list |
| `test_portfolio.py` | Position P&L math, that an unpriced position never fabricates numbers, that totals split correctly by currency, that a mixed priced/unpriced portfolio withholds rather than understates its total, and position removal |
| `test_regressions.py` | Named regression tests for real bugs found during development: the substring ticker-collision fix (V/NVDA), that `get_indices` survives one failing ticker, that daily movers survive a bad watchlist ticker, cache eviction (expiry + hard cap), that research jobs are bounded, and that the score endpoint doesn't spend an LLM call unless `explain=true` is passed |
| `test_llm_providers.py` | Tier→model mapping for Together, that default model IDs are properly namespaced, health reporting without leaking the key, a clean named error on a missing key, rejection of an unknown provider, and — parametrized — that 3 different malformed LLM response shapes (error body, empty choices, null content) all raise readable `RuntimeError`s instead of crashing |
| `test_static_serving.py` | The SPA-serving path: API routes still return JSON when the SPA is mounted, the SPA owns the root and client-side routes, real static files are served, unknown routes fall back to `index.html`, and — parametrized over several attack strings — that path traversal cannot escape the static directory |
| `test_smoke.py` | Basic sanity: the API root responds, `/health` responds, and every route is correctly namespaced under `/api` |

The regression tests in particular are worth reading directly — each one exists because a
real bug shipped once, and the test is the permanent record of what broke and why.

---

## 21. Running locally

**One command** — [`run.ps1`](run.ps1) (Windows) or `run.sh` (macOS/Linux/Git Bash):

```powershell
.\run.ps1
```

What it does, in order:

1. Creates `backend/.venv` if missing, installs `requirements.txt` if the venv doesn't
   already have `fastapi`/`uvicorn`/`yfinance` importable.
2. Copies `backend/.env.example` → `backend/.env` if no `.env` exists yet (market data
   works immediately with zero keys; AI features need one key — see §23).
3. Runs `npm install` in `frontend/` if `node_modules` is missing.
4. **Picks a free port** starting at 8000 (`Get-FreePort`) — so a port clash with another
   local project doesn't crash the launch.
5. Starts the API, then polls `127.0.0.1:<port>` with a raw TCP connect (not an HTTP
   request) until it responds, up to 30 seconds.
6. Sets `VITE_BACKEND_URL` to whatever port the API actually landed on, then starts the
   Vite dev server in the foreground.
7. `Ctrl+C` stops the frontend, and a `finally` block force-kills the background API
   process tree.

**Two Windows-specific fixes baked into this script and `vite.config.js` are worth
knowing about if you ever debug a "won't start" issue:**

- The readiness probe deliberately targets `127.0.0.1`, never `localhost` — Windows/Node
  resolve `localhost` to IPv6 `::1` first, but `uvicorn --port` binds IPv4-only by
  default, so a `localhost` probe hangs and times out on every retry.
- `$ProgressPreference = 'SilentlyContinue'` is set globally — `Invoke-WebRequest`'s
  progress-bar rendering can itself throw under a redirected/non-interactive host (exactly
  what happens when this script is launched from some terminal wrappers), which a global
  `$ErrorActionPreference = 'Stop'` would otherwise turn into a silent script failure even
  after the server already responded 200 OK.

### Manual two-terminal setup

If you'd rather run the two halves yourself:

```powershell
# Terminal 1 — backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env      # then fill in an LLM key
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Frontend on `http://localhost:5173`, backend on `http://localhost:8000` (API docs at
`/docs`). To run the test suite: `pip install -r requirements-dev.txt && pytest` from
`backend/`.

---

## 22. Deployment

Full step-by-step instructions live in **[DEPLOY.md](DEPLOY.md)** — this section explains
the *shape* of the deploy, not the click-by-click steps.

### Primary path: Railway, single service

The [`Dockerfile`](Dockerfile) is a two-stage build:

```dockerfile
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build                          # -> /web/dist

FROM python:3.11-slim AS runtime
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist ./static         # main.py serves this when present
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

One container, one URL, **zero CORS configuration** — because the React app and the API
are genuinely the same origin in this shape, unlike a split deploy. Railway auto-detects
the root `Dockerfile`; the only setup is pasting an LLM key into the service's Variables
tab (`LLM_PROVIDER=together` + `TOGETHER_API_KEY=...`) and generating a public domain.

### Alternative: split Render + Vercel

Still supported via `render.yaml` (API blueprint) + `frontend/vercel.json` (static
frontend), for anyone who wants Render's always-free API tier instead of paying for
compute. The trade-off: Render's free tier sleeps after 15 minutes idle (≈50s cold start
on the next request), and you manage two dashboards instead of one. This path needs
`CORS_ORIGINS` configured on the API side, since the two are now genuinely different
origins — the single-service path needs none of that.

### Mobile

Capacitor wraps the *same* `frontend/dist` build into a native Android APK — no separate
mobile codebase to maintain. The one hard requirement: the APK can't use the `/api` dev
proxy (there's no dev server inside a native shell), so `VITE_API_URL` must be baked in at
build time to point at the deployed backend's absolute URL. Full steps in
**[MOBILE.md](MOBILE.md)**.

---

## 23. Environment variables reference

All defined with defaults in `backend/config.py`; copy `backend/.env.example` →
`backend/.env` to set them locally, or set them in your platform's dashboard for a deploy.

### LLM (pick one provider)

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `together` \| `gemini` \| `openai_compat` \| `anthropic` \| `ollama` |
| `TOGETHER_API_KEY` | _(empty)_ | from [api.together.ai](https://api.together.ai) |
| `TOGETHER_MODEL_QUICK/_AGENT/_REPORT` | see §6 table | override any single tier without touching the provider |
| `GEMINI_API_KEY` | _(empty)_ | free, from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` | Groq's URL / empty | any OpenAI-compatible endpoint — Groq (free), OpenRouter, HF router |
| `ANTHROPIC_API_KEY` | _(empty)_ | Claude API |
| `OLLAMA_HOST` | `http://localhost:11434` | local, needs models pulled first |

### Optional data providers (free fallbacks used if blank)

| Variable | Unlocks |
|---|---|
| `POLYGON_API_KEY` | Real-time US quotes via Polygon instead of yfinance |
| `FMP_API_KEY` | Richer fundamentals/ratios via Financial Modeling Prep |
| `NEWSAPI_KEY` | NewsAPI.org instead of the Yahoo RSS fallback |
| `ALPHA_VANTAGE_KEY` | reserved, not yet wired to a feature |

### Public-deployment guards (both off by default)

| Variable | Effect |
|---|---|
| `API_ACCESS_KEY` | If set, every guarded route requires header `X-API-Key: <value>` |
| `RATE_LIMIT_PER_MIN` | If `>0`, per-IP cap on the LLM/screener routes |

### Infra

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | optional — falls back to in-memory cache if unreachable |
| `CORS_ORIGINS` | localhost + Capacitor origins | only matters for a split deploy; single-service needs none of this |
| `SUPABASE_URL` / `SUPABASE_KEY` | _(empty)_ | optional persistence layer, unused unless you wire it in (§24) |

---

## 24. Known limitations & roadmap

Things that are deliberately simple today, and the path to extending them:

- **In-memory state.** Watchlist, portfolio positions, and deep-research job records all
  live in a plain Python dict/OrderedDict inside the running process. They reset on every
  redeploy or restart. A Postgres schema is ready in `backend/db/schemas.sql` and a lazy
  Supabase client already exists (`backend/db/supabase_client.py`) — swapping the
  in-memory stores for it is the natural next step, and none of the calling code (routers,
  services) would need to change shape, just the storage functions inside the MCP layer.
- **No user accounts.** Every store uses a hardcoded `_user_id() -> "demo-user"`. Wiring
  Supabase Auth would replace that one function everywhere it's called.
- **Reddit sentiment is a stub.** `social_sentiment_mcp.get_reddit_mentions()` returns a
  placeholder until `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are wired to PRAW.
- **Unusual options activity is a stub.** `options_flow_mcp.get_unusual_activity()`
  returns `[]` pending an Unusual Whales API integration.
- **Background jobs run in-process, not on a queue.** Deep research uses FastAPI's
  `BackgroundTasks`, which is fine for a single-instance deploy but won't survive a
  process restart mid-job or scale across multiple instances. `backend/tasks/README.md`
  documents the Celery plan for this (`daily_digest`, `alert_monitor`,
  `watchlist_refresh`, `report_generation` tasks) — Redis-backed, not yet wired in. The
  crew orchestration code itself (`agents/crew.py`) wouldn't change; only where it's
  invoked from would.
- **No price alerts.** The scaffolding (`alert_monitor.py` in the tasks plan) is named but
  not implemented.
- **Single-currency portfolio totals only.** By design, not a bug — see §7/§17. Adding FX
  conversion would need a live rate source and an explicit decision about which currency
  to normalize to.
