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

MarketMind supports four LLM providers, switchable via `LLM_PROVIDER` env var:

- `gemini` — **Google Gemini, free** via AI Studio. Just set `GEMINI_API_KEY`
  (base URL + models are preset). Great free hosted option.
- `openai_compat` — Any OpenAI-compatible API: **Groq (free)**, OpenRouter, Together,
  HF router. Set `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL_*`.
- `ollama` — Local open-source models (Llama 3, Qwen, etc.). Free, private, needs the
  models pulled locally.
- `anthropic` — Claude API (Haiku/Sonnet/Opus). Best quality; requires `ANTHROPIC_API_KEY`.

Both `gemini` and `openai_compat` need no GPU, so they're ideal for a deployed server.

Missing keys surface as a clean per-request error — the app still boots.

For free local testing:
```powershell
ollama pull llama3.1:8b
ollama pull qwen2.5:7b
```
Then set `LLM_PROVIDER=ollama`. For a **free hosted** setup (e.g. deployment), get a Groq
key at console.groq.com and set `LLM_PROVIDER=openai_compat`.

3-tier model mapping (anthropic / ollama / groq / gemini):
- `quick`  → Haiku / `llama3.1:8b` / `llama-3.1-8b-instant` / `gemini-2.0-flash` (single-asset summaries)
- `agent`  → Sonnet / `qwen2.5:7b` / `llama-3.3-70b-versatile` / `gemini-2.0-flash` (the 4 analyst agents)
- `report` → Opus / `qwen2.5:7b` / `llama-3.3-70b-versatile` / `gemini-2.5-flash` (final synthesis)

See `backend/utils/llm.py` for the abstraction layer.

## Deploy

Deploy free on the web (Render + Vercel + Groq) — see **[DEPLOY.md](DEPLOY.md)**.
Android APK / PWA — see **[MOBILE.md](MOBILE.md)**. Both use the same codebase.

## Deep Research (Phase 2 — 5 agents)

`POST /analyze/deep/{ticker}` runs a 5-agent pipeline and returns a `report_id`;
poll `GET /analyze/report/{report_id}` for live agent progress + the final report
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

- `GET  /screener/top?region=global|india&limit=10` — **Top Picks**: auto-scan a built-in
  large-cap universe and return the top-N with AI reasons
- `GET  /screener/score/{ticker}` — scored breakdown + trade math + reason for one symbol
- `POST /screener/rank` `{tickers:[...]}` — rank your own list / watchlist
- `POST /daily/report` `{tickers:[...]}` — **Daily Report**: indices, movers, region news + briefing

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

`GET /market/search?q=Apple` resolves company names to tickers via Yahoo Finance
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
├── render.yaml         # backend deploy blueprint (Render)
├── DEPLOY.md           # web deploy guide (Render + Vercel, free)
├── MOBILE.md           # PWA + Android APK guide
└── README.md
```

See the original guide for full architecture, phased build plan, and pricing.

**Not financial advice. Pure AI-powered analysis.**
