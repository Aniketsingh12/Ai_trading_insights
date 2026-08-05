# Deploying MarketMind on Railway (free, one service)

**One container serves everything.** The Docker build compiles the React app and hands it
to FastAPI, so the frontend and API live on a single URL — no second platform, and no CORS
configuration at all because they're the same origin.

```
https://marketmind.up.railway.app
  ├─ /            → React app (served by FastAPI from backend/static)
  └─ /api/*       → FastAPI endpoints
                        └─ calls → Gemini (free LLM)
```

---

## 0. Prerequisites
- A **GitHub** account with this project pushed to it
- A free **Gemini** API key → https://aistudio.google.com/apikey → *Create API key*

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
   | `LLM_PROVIDER` | `gemini` |
   | `GEMINI_API_KEY` | *your key from Step 0* |
   | `RATE_LIMIT_PER_MIN` | `20` |
   
   Optional, only if you have them: `NEWSAPI_KEY`, `POLYGON_API_KEY`, `FMP_API_KEY`.
   **`CORS_ORIGINS` is not needed** — same-origin deployment.
4. **Settings ▸ Networking ▸ Generate Domain** to get a public URL.
5. First build takes ~3–5 min (installs npm + pip). Later pushes are faster and deploy
   automatically.

## 3. Verify
| URL | Expect |
|---|---|
| `https://<your-app>.up.railway.app/` | The MarketMind dashboard |
| `…/api/health` | `{"status":"ok","llm":{"provider":"gemini","ok":true}}` |
| `…/docs` | Swagger API explorer |

Then click through: Analyze a ticker → Top Picks → Daily Report → add a Portfolio position
(should show live P&L). On a phone, **Add to Home Screen** installs the PWA.

> **Railway free tier** gives a monthly usage credit rather than a permanently-free service.
> Unlike Render's free tier, it does **not** sleep after idle — so no ~50s cold start.

---

## Switching the LLM
Everything is one env var. In Railway → Variables:

**Groq** (also free, faster):
```
LLM_PROVIDER=openai_compat
OPENAI_API_KEY=<key from console.groq.com>
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL_QUICK=llama-3.1-8b-instant
OPENAI_MODEL_AGENT=llama-3.3-70b-versatile
OPENAI_MODEL_REPORT=llama-3.3-70b-versatile
```
**Anthropic** (paid, best quality): `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=...`

Check `…/api/health` after any change — it reports the active provider.

## Protecting a public API
The URL is public, so anyone who finds it can spend your LLM quota.
`RATE_LIMIT_PER_MIN=20` caps the expensive LLM/screener routes per IP and is usually
enough for a personal demo. An `API_ACCESS_KEY` guard also exists for real access control,
but the browser frontend doesn't send that header, so setting it would lock out your own
UI — leave it unset.

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
