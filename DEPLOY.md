# Deploying MarketMind on the Web (free)

Two services: **backend on Render** (FastAPI) + **frontend on Vercel** (React). LLM runs on
**Groq** (free, hosted) since the server has no GPU for Ollama. Total cost: ₹0.

```
Vercel (frontend)  ──calls──▶  Render (FastAPI)  ──calls──▶  Groq (LLM)
https://…vercel.app            https://…onrender.com          free API
```

---

## 0. Prerequisites
- A **GitHub** account (both hosts deploy from a repo)
- A free **Groq** API key → https://console.groq.com → API Keys → create (`gsk_...`)

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
`.gitignore` already excludes `backend/.env` and other secrets — verify none of your keys
were committed before pushing a public repo. (Rotating the keys currently in `.env` is cheap
insurance since they've been used in dev.)

## 2. Backend → Render
1. https://render.com → **New ▸ Blueprint** → connect the repo. It reads `render.yaml`.
2. When prompted, fill the `sync:false` secrets:
   - `OPENAI_API_KEY` = your Groq key
   - `CORS_ORIGINS` = leave as `https://localhost,capacitor://localhost,http://localhost`
     for now; you'll add the Vercel URL in step 4
   - `NEWSAPI_KEY`, `POLYGON_API_KEY`, `FMP_API_KEY` = optional (paste if you have them)
3. Deploy → you get `https://marketmind-api.onrender.com`.
4. Test: open `…onrender.com/health` → should show `"provider":"openai_compat","ok":true`,
   and `…onrender.com/docs` for the API explorer.

> Free tier sleeps after 15 min idle → the first request wakes it (~50s). Fine for a demo;
> $7/mo removes it.

## 3. Frontend → Vercel
1. https://vercel.com → **Add New ▸ Project** → import the same repo.
2. Set **Root Directory = `frontend`** (Vercel auto-detects Vite; `vercel.json` handles SPA routing).
3. Add an Environment Variable:
   - `VITE_API_URL` = `https://marketmind-api.onrender.com` (your Render URL, no trailing slash)
4. Deploy → you get `https://marketmind.vercel.app`.

## 4. Connect them (CORS)
On **Render → your service → Environment**, set:
```
CORS_ORIGINS=https://marketmind.vercel.app,https://localhost,capacitor://localhost,http://localhost
```
Save → Render redeploys. Now the frontend can call the backend.

## 5. Verify
Open the Vercel URL on desktop and phone:
- Dashboard indices load, Analyze runs a quick analysis, Top Picks scores a universe,
  Daily Report shows news + an AI briefing.
- On a phone browser → **Add to Home Screen** installs the PWA.

---

## Using Google Gemini instead of Groq (also free)
Gemini has its own dedicated provider — you only set a key:
1. Get a free key at https://aistudio.google.com/apikey
2. On Render (or `.env`) set:
   ```
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=<your key>
   ```
   Base URL and models (`gemini-2.0-flash` / `gemini-2.5-flash`) are preset — override
   with `GEMINI_MODEL_QUICK/AGENT/REPORT` if you like.
3. `…onrender.com/health` should show `"provider":"gemini","ok":true`.

## Protecting a public API (recommended)
Your Render URL is public, so anyone who finds it can spend your LLM quota. Two
optional guards (both off by default) are built in — set them in the Render dashboard:
```
RATE_LIMIT_PER_MIN=20     # per-IP cap on the LLM/screener routes
API_ACCESS_KEY=<random>   # requires header  X-API-Key: <value>
```
`RATE_LIMIT_PER_MIN` alone is usually enough for a personal demo. If you set
`API_ACCESS_KEY`, the browser frontend must send that header too — simplest is to
leave it blank and rely on the rate limit unless you need real access control.

## Notes & alternatives
- **Other OpenAI-compatible LLMs** — with `LLM_PROVIDER=openai_compat`, point
  `OPENAI_BASE_URL` + `OPENAI_MODEL_*` at OpenRouter (`https://openrouter.ai/api/v1`,
  `:free` models), Together, or HF's router.
- **Rate limits**: a deep-research run fires 5 LLM calls; free tiers may throttle bursts.
  Groq is fast and usually fine; if you hit limits, use a smaller model for the `AGENT`/`REPORT`
  tiers or space out requests.
- **Data persistence**: watchlist/portfolio are in-memory and reset on restart. To persist,
  wire the Supabase schema in `backend/db/schemas.sql` (keys already in `.env`).
- **Other hosts**: Railway / Fly.io (backend) and Netlify / Cloudflare Pages (frontend) work
  the same way — build command `npm run build`, output `dist`, set `VITE_API_URL`.
- **Mobile APK**: see `MOBILE.md` — it uses this same deployed backend URL.
