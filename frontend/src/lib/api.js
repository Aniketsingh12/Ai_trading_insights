import { AccessError, getKey, requestKey } from './auth';

// Dev/web: '/api' hits the Vite proxy (or same-origin). Production web + the
// Capacitor APK have no proxy, so they call the deployed backend directly via
// VITE_API_URL (e.g. https://marketmind.up.railway.app/api). Set it at build time.
const BASE = import.meta.env.VITE_API_URL || '/api';

/** FastAPI puts the useful message in `detail` — surface that, not "429". */
async function errorMessage(r) {
  try {
    const body = await r.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    /* not JSON — fall through to the status line */
  }
  return `${r.status} ${r.statusText}`;
}

async function req(path, opts = {}) {
  // No model-preset header: which model runs is a backend decision now, set by
  // the TOGETHER_MODEL_* env vars rather than chosen per request in the UI.
  const key = getKey();
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-API-Key': key } : {}),
      ...opts.headers,
    },
  });

  if (r.status === 401) {
    // Raise the passcode prompt, and let the caller show its own message.
    requestKey();
    throw new AccessError('This action needs the access passcode.');
  }
  if (!r.ok) throw new Error(await errorMessage(r));
  return r.json();
}

const enc = encodeURIComponent;

export const api = {
  health: () => req('/health'),
  search: (q) => req(`/market/search?q=${enc(q)}`),
  indices: (region = 'global') => req(`/market/indices?region=${enc(region)}`),
  quote: (t) => req(`/market/quote/${enc(t)}`),
  indicators: (t) => req(`/market/indicators/${enc(t)}`),
  ohlcv: (t, days = 90) => req(`/market/ohlcv/${enc(t)}?days=${days}`),
  quickAnalysis: (t) => req(`/analyze/quick/${enc(t)}`),
  deepResearch: (t) => req(`/analyze/deep/${enc(t)}`, { method: 'POST' }),
  getReport: (id) => req(`/analyze/report/${enc(id)}`),
  // explain=true costs an LLM call — request it only when the user asks.
  scoreTicker: (t, explain = false) => req(`/screener/score/${enc(t)}?explain=${explain}`),
  topPicks: (region = 'global', limit = 10) => req(`/screener/top?region=${enc(region)}&limit=${limit}`),
  rankTickers: (tickers) => req('/screener/rank', { method: 'POST', body: JSON.stringify({ tickers }) }),
  dailyReport: (tickers = []) => req('/daily/report', { method: 'POST', body: JSON.stringify({ tickers }) }),
  watchlist: () => req('/watchlist'),
  addWatch: (t) => req(`/watchlist/${enc(t)}`, { method: 'POST' }),
  removeWatch: (t) => req(`/watchlist/${enc(t)}`, { method: 'DELETE' }),
  portfolio: () => req('/portfolio'),
  portfolioStats: () => req('/portfolio/stats'),
  addPosition: (pos) => req('/portfolio/position', { method: 'POST', body: JSON.stringify(pos) }),
  removePosition: (t) => req(`/portfolio/position/${enc(t)}`, { method: 'DELETE' }),
};
