import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { ScoreBadge, Breakdown, RiskReward } from '../components/Score';
import { useBeginner } from '../lib/beginner.jsx';

function PickRow({ p, beginner, rank }) {
  const [open, setOpen] = useState(false);
  const up = (p.change_pct ?? 0) >= 0;
  const sym = p.currency_symbol ?? '';
  return (
    <div className="card p-0 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-border/30 text-left transition"
        onClick={() => setOpen((o) => !o)}
      >
        {rank != null && (
          <span className="num text-sm text-text-secondary w-5 shrink-0 text-right">{rank}</span>
        )}
        {open ? <ChevronDown size={16} className="text-text-secondary shrink-0" />
              : <ChevronRight size={16} className="text-text-secondary shrink-0" />}
        <div className="min-w-0 flex-1 sm:flex-none sm:w-32 sm:shrink-0">
          <div className="font-semibold num truncate">{p.ticker}</div>
          {/* mobile: show price + change here; desktop: show exchange */}
          <div className="text-xs text-text-secondary flex gap-2 sm:hidden">
            <span className="num">{sym}{p.price?.toLocaleString()}</span>
            <span className={`num ${up ? 'text-bull' : 'text-bear'}`}>
              {p.change_pct != null ? `${up ? '+' : ''}${p.change_pct.toFixed(2)}%` : '—'}
            </span>
          </div>
          <div className="text-xs text-text-secondary hidden sm:block">{p.exchange}</div>
        </div>
        {/* desktop-only columns */}
        <div className="hidden sm:block num text-sm w-24 shrink-0">{sym}{p.price?.toLocaleString()}</div>
        <div className={`hidden sm:block num text-sm w-20 shrink-0 ${up ? 'text-bull' : 'text-bear'}`}>
          {p.change_pct != null ? `${up ? '+' : ''}${p.change_pct.toFixed(2)}%` : '—'}
        </div>
        <div className="hidden sm:block num text-sm w-24 shrink-0 text-text-secondary">
          R:R {p.metrics?.risk_reward ?? '—'}
        </div>
        <div className="hidden sm:block flex-1" />
        <ScoreBadge label={p.label} score={p.score} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
          {p.reason && (
            <div className="bg-bg/40 rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">
                AI reasoning — why it ranks here
              </div>
              <p className="text-sm text-text-primary leading-relaxed">{p.reason}</p>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-5">
          {!beginner && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-text-secondary">Why this score</div>
              <Breakdown items={p.breakdown} />
            </div>
          )}
          <div className={`space-y-3 ${beginner ? 'md:col-span-2' : ''}`}>
            <div className="text-xs uppercase tracking-wide text-text-secondary">Trade math</div>
            <RiskReward metrics={p.metrics} sym={sym} />
            {p.headline && (
              <a href={p.headline.url} target="_blank" rel="noreferrer"
                 className="block text-xs text-primary hover:underline mt-2">
                📰 {p.headline.title}
              </a>
            )}
            <Link to={`/analyze/${p.ticker}`} className="text-xs text-text-secondary hover:text-primary">
              Open full analysis →
            </Link>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

const REGIONS = [
  { id: 'global', label: 'Global' },
  { id: 'india', label: 'India' },
];

export default function TopPicks() {
  const [text, setText] = useState('');
  const [region, setRegion] = useState('global');
  const [source, setSource] = useState('top'); // 'top' = built-in universe, 'custom' = typed/watchlist
  const { beginner } = useBeginner();
  const { data: watch } = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });

  // Auto-scan the built-in universe for the selected region → top 10.
  const topQ = useQuery({
    queryKey: ['toppicks', region],
    queryFn: () => api.topPicks(region, 10),
  });

  const rankM = useMutation({
    mutationFn: (tickers) => api.rankTickers(tickers),
    onSuccess: () => setSource('custom'),
    onError: (e) => toast.error(`Ranking failed: ${e.message}`),
  });

  const parse = (s) => s.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);

  function runCustom(e) {
    e.preventDefault();
    const tickers = parse(text);
    if (tickers.length) rankM.mutate(tickers);
  }

  function runWatchlist() {
    const tickers = watch?.tickers || [];
    if (!tickers.length) { toast('Your watchlist is empty — add tickers or type some below.'); return; }
    rankM.mutate(tickers);
  }

  function pickRegion(id) {
    setRegion(id);
    setSource('top');
  }

  const showTop = source === 'top';
  const data = showTop ? topQ.data : rankM.data;
  const loading = showTop ? topQ.isLoading || topQ.isFetching : rankM.isPending;
  const picks = data?.picks || [];
  const summary = data?.summary || '';

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles size={20} className="text-primary" /> Top Picks
          </h1>
          <p className="text-text-secondary text-sm">
            {showTop
              ? `Top 10 from the ${region === 'india' ? 'Indian' : 'global'} large-cap universe, ranked by a 0–100 score (Trend · Momentum · Risk/Reward · Sentiment) with AI reasons. Not advice.`
              : 'Your custom ranking. Switch a region below to return to the auto Top 10.'}
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => pickRegion(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                showTop && region === r.id ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <form onSubmit={runCustom} className="flex gap-2 flex-1 min-w-[280px]">
          <input
            className="input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or rank your own — AAPL, MSFT, RELIANCE.NS, BTC-USD"
          />
          <button className="btn" type="submit" disabled={loading}>
            {rankM.isPending ? 'Scoring…' : 'Rank'}
          </button>
        </form>
        <button className="btn-ghost" onClick={runWatchlist} disabled={loading}>
          Rank my watchlist
        </button>
      </div>

      {loading && (
        <div className="text-text-secondary text-sm">
          Scoring {showTop ? `the ${region} universe` : `${parse(text).length || (watch?.tickers?.length ?? 0)} tickers`}… (gathering data + AI reasons)
        </div>
      )}

      {summary && !loading && (
        <div className="card bg-primary/5 border-primary/30">
          <div className="text-xs uppercase tracking-wide text-primary mb-1">AI ranking summary</div>
          <p className="text-sm text-text-primary leading-relaxed">{summary}</p>
        </div>
      )}

      {picks.length > 0 && (
        <div className="space-y-2">
          <div className="hidden sm:flex items-center gap-3 px-4 text-xs uppercase tracking-wide text-text-secondary">
            <span className="w-4" /><span className="w-4" /><span className="w-32">Ticker</span>
            <span className="w-24">Price</span><span className="w-20">Today</span>
            <span className="w-24">Risk/Rew</span><span className="flex-1" /><span>Score</span>
          </div>
          {picks.map((p, i) => <PickRow key={p.ticker} p={p} rank={i + 1} beginner={beginner} />)}
        </div>
      )}

      {!loading && data && picks.length === 0 && (
        <div className="card text-text-secondary text-sm">
          No valid data right now (the free data source may be rate-limited — try again shortly).
        </div>
      )}
    </div>
  );
}
