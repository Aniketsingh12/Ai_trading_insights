# Deploying MarketMind on Railway (free, one service)

**One container serves everything.** The Docker build compiles the React app and hands it
to FastAPI, so the frontend and API live on a single URL — no second platform, and no CORS
configuration at all because they're the same origin.

```
https://marketmind.up.railway.app
  ├─ /            → React app (served by FastAPI from backend/static)
  └─ /api/*       → FastAPI endpoints
                        └─ calls → Together AI (LLM)
```

---

## 0. Prerequisites
- A **GitHub** account with this project pushed to it
- A **Together AI** API key → https://api.together.ai → *API Keys*
  *(or a free Gemini key from https://aistudio.google.com/apikey — see "Switching the LLM")*

## 1. Push to GitHub
```powershell
cd E:\tradeforge
git init
git add .
git commit -m "MarketMind"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/marketmind.git
git branch -M main
git push -u origin main
```
`.gitignore` excludes `backend/.env` and all secrets. Sanity check before pushing publicly —
this should list only `*.env.example` files:
```bash
git ls-files | grep -i env
```

## 2. Deploy on Railway
1. https://railway.app → **New Project ▸ Deploy from GitHub repo** → pick your repo.
2. Railway detects the root `Dockerfile` automatically. **No build/start command to set** —
   the Dockerfile handles both stages and reads Railway's `$PORT`.
3. Open the service → **Variables** tab → add:
   | Variable | Value |
   |---|---|
   | `LLM_PROVIDER` | `together` |
   | `TOGETHER_API_KEY` | *your key from Step 0* |
   | `RATE_LIMIT_PER_MIN` | `20` |
   
   The three `TOGETHER_MODEL_*` vars are optional — sensible defaults are baked in
   (see the tier table in the README). Optional data keys, only if you have them:
   `NEWSAPI_KEY`, `POLYGON_API_KEY`, `FMP_API_KEY`.
   **`CORS_ORIGINS` is not needed** — same-origin deployment.
4. **Settings ▸ Networking ▸ Generate Domain** to get a public URL.
5. First build takes ~3–5 min (installs npm + pip). Later pushes are faster and deploy
   automatically.

## 3. Verify
| URL | Expect |
|---|---|
| `https://<your-app>.up.railway.app/` | The MarketMind dashboard |
| `…/api/health` | `{"status":"ok","llm":{"provider":"together","ok":true,…}}` |
| `…/docs` | Swagger API explorer |

Then click through: Analyze a ticker → Top Picks → Daily Report → add a Portfolio position
(should show live P&L). On a phone, **Add to Home Screen** installs the PWA.

> **Railway free tier** gives a monthly usage credit rather than a permanently-free service.
> Unlike Render's free tier, it does **not** sleep after idle — so no ~50s cold start.

---

## Switching the LLM
Everything is one env var. In Railway → Variables:

**Gemini** (free tier): `LLM_PROVIDER=gemini` + `GEMINI_API_KEY=<key from aistudio.google.com/apikey>`

**Groq** (free, fast):
```
LLM_PROVIDER=openai_compat
OPENAI_API_KEY=<key from console.groq.com>
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL_QUICK=llama-3.1-8b-instant
OPENAI_MODEL_AGENT=llama-3.3-70b-versatile
OPENAI_MODEL_REPORT=llama-3.3-70b-versatile
```
**Anthropic** (paid, best quality): `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=...`

To change just one Together tier — e.g. a cheaper final synthesis — override
`TOGETHER_MODEL_REPORT` without touching the provider.

Check `…/api/health` after any change — it reports the active provider and, for
Together, the exact model resolved for each tier.

## Running it as a public demo

This is a portfolio project, so the goal is the opposite of a lock: a visitor must be
able to actually run the AI features, or the best part of the app is invisible. Nobody
signs up to look at a demo, so there is **no login** — instead every visitor gets a
metered free trial, with a hard ceiling on what the whole thing can ever cost.

Railway → Variables:

| Variable | Suggested | What it does |
|---|---|---|
| `VISITOR_LLM_LIMIT` | `10` | AI runs one visitor gets per day |
| `DAILY_LLM_LIMIT` | `60` | Ceiling across **all** visitors — this is what bounds your bill |
| `API_ACCESS_KEY` | a long random string | Your own passcode; bypasses both limits |
| `RATE_LIMIT_PER_MIN` | `30` | Per-IP burst cap (data routes get 8× automatically) |

**Only AI calls are metered.** Prices, charts, the 0–100 scoring maths, watchlist and
portfolio are free to serve and stay unlimited — so even a visitor with nothing left
still sees a working app rather than a wall.

### What it costs you

One deep-research run is 5 units (five model calls, ~$0.01–0.02 on the Together
defaults); everything else is 1 unit. So `DAILY_LLM_LIMIT` translates directly into a
worst-case bill:

| `DAILY_LLM_LIMIT` | Deep runs/day | Worst case |
|---|---|---|
| `30` | 6 | ~$0.12/day · **~$3.60/mo** |
| `60` | 12 | ~$0.24/day · **~$7.20/mo** |
| `120` | 24 | ~$0.48/day · **~$14.40/mo** |

That is the *maximum*, not the expected spend — it only bills if the allowance is
actually used every single day.

### Cutting the cost per run (do this before raising the limits)

The five calls in a run are not equal. Four analysts run on the cheap `agent` tier; the
fifth — the synthesis that produces the verdict — reads all four analyst outputs as
input. That one call is roughly **85% of what a run costs**.

The `report` tier default has already been moved off the flagship model:

| Model | Price /1M | Cost of the report call | |
|---|---|---|---|
| `deepseek-ai/DeepSeek-V4-Pro` | $1.74 / $3.48 | ~$0.0091 | previous default |
| `Qwen/Qwen3.7-Plus` | $0.32 / $1.28 | ~$0.0024 | 3.8× cheaper |
| **`openai/gpt-oss-120b`** | **$0.15 / $0.60** | **~$0.0011** | **current default, 8.2× cheaper** |
| `deepseek-ai/DeepSeek-V4-Flash-0731` | $0.14 / $0.28 | ~$0.0007 | 12×, but claims no structured output |
| `Prism-ML/Ternary-Bonsai-27B` | free | $0 | free tier, reduced rate limits |

`gpt-oss-120b` was chosen because it is the same family as the `quick` tier already
producing sectioned output reliably in this app, so the format adherence the report
parser depends on is a known quantity — while still cutting that call ~8×.

**Check before going cheaper still.** The report call is the only one whose output is
parsed — six section headings and a literal `VERDICT:` line. A weaker model that stops
emitting them doesn't raise an error; it degrades every report to the `HOLD` fallback.
The app now logs a warning and flags such a report in the UI when that happens, but the
cheap way to find out is to measure first:

```bash
cd backend && .venv/Scripts/python.exe scripts/eval_report_model.py
```

That runs the real synthesis prompt against each candidate on identical input and reports
whether the verdict parsed, whether all six sections survived, and the cost per call. Then
set the winner:

```
TOGETHER_MODEL_REPORT=<the model the script recommends>
```

Cheaper models don't replace the caps — free endpoints are rate-limited and will fail
under load, and the total still needs bounding. They make the same cap go much further.

> **Keep `VISITOR_LLM_LIMIT` at 5 or above.** Deep research costs 5 units, so anything
> lower makes your showpiece feature permanently refuse for every visitor — with no error
> at deploy time. The app logs a warning at startup if you set it too low.

### When the budget runs out

Deep research degrades instead of failing: the API hands back a real report from an
earlier run, flagged as a saved sample, and the UI labels it as such. A visitor who
arrives after the day's budget is spent still sees what the feature produces, rather than
a red error on the most impressive part of the project.

### Your own access

Enter `API_ACCESS_KEY` once via the AI chip in the header and that browser is unmetered —
visitors can never exhaust the demo and lock you out of your own project.

### Notes

- Visitor quota is keyed on `X-Forwarded-For`, which is spoofable. That makes it a
  fairness mechanism, not a security boundary — `DAILY_LLM_LIMIT` is the layer that
  actually guarantees the cap, and it cannot be side-stepped.
- Counters are in memory and reset at 00:00 UTC, and also on redeploy.
- A failed model call still draws from the allowance. Deliberate: the counter is a spend
  ceiling, and erring toward under-spending is the safe direction.
- `…/api/health` reports the caller's remaining allowance — never any key.

---

## Alternative: split across Render + Vercel
The repo still supports this (`render.yaml` + `frontend/vercel.json`) if you'd rather use
Render's always-free tier for the API:

1. **Render** → *New ▸ Blueprint* → pick the repo (reads `render.yaml`) → set `GEMINI_API_KEY`.
2. **Vercel** → import the repo → **Root Directory = `frontend`** → set
   `VITE_API_URL=https://<your-render-url>/api` *(note the `/api` suffix — the API is
   namespaced)*.
3. On Render, append your Vercel URL to `CORS_ORIGINS` — required for the split setup,
   since the two are now different origins.

Trade-off: Render's free tier sleeps after 15 min idle (~50s first request), and you manage
two dashboards instead of one.

## Notes
- **Local dev is unchanged** — `.\run.ps1` still runs Vite + uvicorn separately, and the
  Vite proxy forwards `/api` to the backend using the same URLs production uses.
- **Data persistence**: watchlist/portfolio are in-memory and reset on redeploy. To persist,
  wire the Supabase schema in `backend/db/schemas.sql`.
- **Mobile APK**: see `MOBILE.md`. Set `VITE_API_URL=https://<your-app>.up.railway.app/api`
  before building, and add `capacitor://localhost` to `CORS_ORIGINS` (the APK *is* a
  different origin, unlike the web build).
