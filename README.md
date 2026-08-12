# MarketMind

AI-powered trading analysis platform. Multi-agent research, real-time market data, MCP-connected tool ecosystem.

## Quickstart

**One command runs everything** (creates the venv, installs deps, writes `backend/.env`,
picks free ports, starts API + web app):

```powershell
.\run.ps1
```
Git Bash / macOS / Linux: `./run.sh`

Then open the printed URL (usually http://localhost:5173). Ctrl+C stops both.
Market data works with no API keys; AI features need one free key — see *LLM Backends*.

<details>
<summary>Manual setup (if you prefer running the two halves yourself)</summary>

### Prereqs
- Python 3.11+
- Node.js 20+
- Redis (optional, for caching/Celery — local install or Upstash)
- Ollama (optional, for open-source LLM — https://ollama.com)

### Backend
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env   # creates backend\.env — then fill in keys
uvicorn main:app --reload --port 8000
```

`requirements.txt` is the lean production set. For running the test suite locally,
install `requirements-dev.txt` instead (adds pytest).

Technical indicators (RSI/MACD/SMA) are computed in pure pandas, so no native
TA library is required to run.

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

Frontend on http://localhost:5173, backend on http://localhost:8000.

</details>

## LLM Backends

MarketMind supports five LLM providers, switchable via `LLM_PROVIDER` env var:

- `together` — **Together AI** (default). Wide open-model catalogue with per-tier
  model choice. Just set `TOGETHER_API_KEY`; base URL + models are preset.
- `gemini` — **Google Gemini, free** via AI Studio. Just set `GEMINI_API_KEY`.
- `openai_compat` — Any other OpenAI-compatible API: **Groq (free)**, OpenRouter,
  HF router. Set `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL_*`.
- `ollama` — Local open-source models (Llama 3, Qwen, etc.). Free, private, needs the
  models pulled locally.
- `anthropic` — Claude API (Haiku/Sonnet/Opus). Requires `ANTHROPIC_API_KEY`.

Every provider except `ollama` needs no GPU, so they're all fine for a deployed server.

Missing keys surface as a clean per-request error — the app still boots.

For free local testing:
```powershell
ollama pull llama3.1:8b
ollama pull qwen2.5:7b
```
Then set `LLM_PROVIDER=ollama`. For a hosted setup, get a key at
[api.together.ai](https://api.together.ai) and set `LLM_PROVIDER=together` — or use
Gemini's free tier with `LLM_PROVIDER=gemini`.

**3-tier model mapping.** Cost scales with how much reasoning a call actually needs —
cheap models carry the frequent calls, and the flagship is reserved for the single
synthesis that decides the verdict.

| Tier | Used by | Together (default) | Gemini | Anthropic | Ollama |
|------|---------|--------------------|--------|-----------|--------|
| `quick` | single-asset summaries, score explanations | `openai/gpt-oss-20b` | `gemini-2.0-flash` | Haiku | `llama3.1:8b` |
| `agent` | the 4 analyst agents, Top Picks ranking | `deepseek-ai/DeepSeek-V4-Flash-0731` | `gemini-2.0-flash` | Sonnet | `qwen2.5:7b` |
| `report` | final synthesis + verdict | `deepseek-ai/DeepSeek-V4-Pro` | `gemini-2.5-flash` | Opus | `qwen2.5:7b` |

On Together that works out to roughly **$0.02 per deep-research run** (5 LLM calls).
Override any tier with `TOGETHER_MODEL_QUICK` / `_AGENT` / `_REPORT`.

See `backend/utils/llm.py` for the abstraction layer.

## Deploy

Deploy as **one service on Railway** (Docker builds the React app and FastAPI serves it,
so there's a single URL and no CORS setup) — see **[DEPLOY.md](DEPLOY.md)**. A split
Render + Vercel setup is documented there too.
Android APK / PWA — see **[MOBILE.md](MOBILE.md)**. Both use the same codebase.

## Deep Research (Phase 2 — 5 agents)

`POST /api/analyze/deep/{ticker}` runs a 5-agent pipeline and returns a `report_id`;
poll `GET /api/analyze/report/{report_id}` for live agent progress + the final report
with a verdict (STRONG BUY … STRONG SELL). Works on both Ollama and Claude.

```
Research + Technical + Sentiment + Risk  (run concurrently)
        → ReportAgent synthesizes → verdict
```

Agents live in `backend/agents/`. It deliberately uses deterministic Python tool
calls + role-specialised LLM reasoning (not CrewAI autonomous tool-calling) so it's
reliable on small OSS models — see `backend/agents/README.md` for the rationale.

## Signal Score, Risk/Reward & Top Picks

Every analysis carries a transparent **0–100 score** computed in pure Python
(`backend/utils/scoring.py`) — no LLM, fully reproducible, with the math shown:

| Factor | Max | Based on |
|--------|-----|----------|
| Trend | 30 | price vs SMA50 / SMA200 |
| Momentum | 25 | RSI band + MACD histogram |
| Risk/Reward | 25 | upside-to-target ÷ downside-to-stop |
| Sentiment | 20 | Stocktwits bull/bear ratio |

The score is the auditable evidence; an **LLM layer then explains** why each pick ranks
where it does (top vs low) in plain English, with a deterministic fallback if no LLM is
configured. The **Trade Math** (entry / target / stop / upside% / downside% / R:R /
expected monthly move) comes from support-resistance levels and realized volatility —
scenarios, not promises (informational, not advice).

- `GET  /api/screener/top?region=global|india&limit=10` — **Top Picks**: auto-scan a built-in
  large-cap universe and return the top-N with AI reasons
- `GET  /api/screener/score/{ticker}` — scored breakdown + trade math + reason for one symbol
- `POST /api/screener/rank` `{tickers:[...]}` — rank your own list / watchlist
- `POST /api/daily/report` `{tickers:[...]}` — **Daily Report**: indices, movers, region news + briefing

UI: **Top Picks** page auto-loads the top 10 for a Global/India toggle (or rank your own
tickers/watchlist), each row expandable for the math + AI reason; **Daily Report** page
(briefing + separate Global / India news); Risk/Reward card on every Analyze page. The
screener fetches one year of candles per ticker *once*, derives all indicators locally,
and bounds concurrency to stay under data-provider rate limits. A **Beginner mode** toggle
(sidebar) hides raw indicators and shows only the plain-English call + reason, and ⓘ
tooltips explain every term inline.

## News

The Daily Report pulls **region-specific market news** from curated RSS feeds
(`backend/mcp_servers/news_mcp.py` → `get_market_news`): Yahoo Finance / CNBC / MarketWatch
for **Global**, Economic Times / Moneycontrol / Business Standard for **India**. Feeds are
merged, de-duplicated, and run through an **entertainment filter** that drops OTT / movie /
web-series content so you only see market news.

## Search by company name

`GET /api/market/search?q=Apple` resolves company names to tickers via Yahoo Finance
(no key). The Analyze page input is an autocomplete — type "Reliance" → pick
`RELIANCE.NS`, type "Bitcoin" → `BTC-USD`.

## Markets — Global + India

Enter any symbol on the **Analyze** page; the **Dashboard** has a Global / India toggle.
Both toggle baskets are market-level only (indices/ETFs/FX/commodities) — no company
tickers pinned to the dashboard, enforced by a test in `backend/tests/test_markets.py`.

| Market | Ticker format | Example |
|--------|---------------|---------|
| US | plain | `AAPL`, `NVDA` |
| India NSE | `.NS` suffix | `RELIANCE.NS`, `TCS.NS`, `INFY.NS` |
| India BSE | `.BO` suffix | `TCS.BO` |
| Crypto | `-USD` | `BTC-USD` |
| UK / Germany / Japan / Hong Kong / AU / others | `.L` / `.DE` / `.T` / `.HK` / `.AX` / … | `VOD.L`, `BHP.AX` |

Indian quotes show ₹ and the NSE/BSE badge; news search auto-strips the suffix.

- **Global dashboard basket**: S&P 500, NASDAQ 100, Dow Jones, FTSE 100, DAX, Nikkei 225,
  Hang Seng, VIX, Bitcoin, Gold
- **India dashboard basket**: Nifty 50 (`^NSEI`), Sensex (`^BSESN`), Bank Nifty, Nifty IT,
  India VIX, USD/INR

Exchange/currency/region logic lives in `backend/utils/markets.py`.

## Mobile

The frontend is one responsive codebase for web, installable PWA, and Android APK:

- **Phone browser**: sidebar becomes a top bar + bottom tab nav automatically (<768px)
- **PWA**: "Add to Home Screen" installs it full-screen with an icon (manifest + service
  worker already wired up, `frontend/public/`)
- **Android APK**: Capacitor wraps the same `dist/` build — no separate mobile codebase.
  See **[MOBILE.md](MOBILE.md)** for the exact build steps (`npx cap add android`, …)

## Production hardening

Two guards exist for a public deployment, both **off by default** so local dev has zero
friction (`backend/utils/guard.py`):

```
RATE_LIMIT_PER_MIN=20     # per-IP cap on the LLM/screener routes
API_ACCESS_KEY=<random>   # requires header  X-API-Key: <value>  if set
```

Every external data/LLM call is wrapped so one failing ticker or rate-limited request
degrades gracefully (a null tile, a fallback reason) instead of 500-ing the whole page —
see `backend/tests/test_regressions.py` for the covered failure modes. In-memory stores
(watchlist, portfolio, deep-research jobs) are capped and reset on restart; a Postgres
schema is ready in `backend/db/schemas.sql` if you want persistence instead.

## Structure

```
marketmind/
├── backend/
│   ├── agents/        # Phase 2 deep-research crew (5 agents, no CrewAI runtime dep)
│   ├── mcp_servers/    # market data / news / fundamentals / social / options / portfolio
│   ├── routers/        # FastAPI endpoints (analyze, market, screener, watchlist, portfolio)
│   ├── services/       # research jobs, quick analysis, screener ranking, daily report
│   ├── utils/          # llm.py (4 providers), markets.py, scoring.py, cache.py, guard.py
│   ├── db/             # Postgres schema + Supabase client (optional persistence)
│   ├── tests/          # pytest — scoring, markets, news filter, regressions
│   └── .env.example
├── frontend/
│   ├── src/pages/       # Dashboard, Analyze, TopPicks, DailyReport, Watchlist, Portfolio
│   ├── src/components/  # Score.jsx (badge/breakdown/risk-reward), InfoTip.jsx
│   ├── src/lib/         # api.js, beginner.jsx (mode toggle), glossary.js
│   ├── public/          # PWA manifest, service worker, icons
│   └── capacitor.config.json
├── run.ps1 / run.sh    # single-command launcher (setup + start both, picks free ports)
├── render.yaml         # optional: split-deploy blueprint (Render)
├── Dockerfile          # single-service image (React build + FastAPI)
├── DEPLOY.md           # deploy guide (Railway single-service; Render+Vercel alt)
├── MOBILE.md           # PWA + Android APK guide
└── README.md
```

See the original guide for full architecture, phased build plan, and pricing.

**Not financial advice. Pure AI-powered analysis.**
