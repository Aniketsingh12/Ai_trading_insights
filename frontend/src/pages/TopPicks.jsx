import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { ScoreBadge, SignalArc, Breakdown, RiskReward } from '../components/Score';
import { useBeginner } from '../lib/beginner.jsx';
import AiText from '../components/AiText';
import PageHeader from '../components/PageHeader';
import Segmented from '../components/Segmented';
import Delta from '../components/Delta';

/**
 * One row of the ranking. Rank numbers are load-bearing here — the list is an
 * ordering, so the numeral is information rather than decoration.
 */
function PickRow({ p, beginner, rank }) {
  const [open, setOpen] = useState(false);
  const sym = p.currency_symbol ?? '';

  return (
    <div className="border-b rule last:border-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[.04] sm:px-5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="num w-6 shrink-0 text-right text-sm text-text-tertiary">{rank}</span>
        <ChevronRight
          size={15}
          className={`shrink-0 text-text-tertiary transition-transform duration-300 ease-spring ${open ? 'rotate-90' : ''}`}
        />

        <span className="min-w-0 flex-1 sm:w-40 sm:flex-none">
          <span className="block truncate text-sm font-medium">{p.ticker}</span>
          <span className="mt-0.5 flex gap-2 truncate text-xs text-text-tertiary sm:hidden">
            <span className="num">{sym}{p.price?.toLocaleString()}</span>
            <Delta pct={p.change_pct} bare />
          </span>
          <span className="mt-0.5 hidden truncate text-xs text-text-tertiary sm:block">
            {p.name && p.name !== p.ticker ? p.name : p.exchange}
          </span>
        </span>

        <span className="num hidden w-24 shrink-0 text-sm sm:block">
          {sym}{p.price?.toLocaleString()}
        </span>
        <span className="hidden w-20 shrink-0 sm:block">
          <Delta pct={p.change_pct} bare className="text-sm" />
        </span>
        <span className="num hidden w-16 shrink-0 text-sm text-text-secondary sm:block">
          {p.metrics?.risk_reward ?? '—'}
        </span>
        <span className="hidden flex-1 sm:block" />

        <ScoreBadge label={p.label} score={p.score} />
      </button>

      {open && (
        <div className="border-t rule bg-black/20 px-4 pb-6 pt-5 sm:px-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div>
              <SignalArc score={p.score} label={p.label} items={p.breakdown} />
              <Link
                to={`/analyze/${p.ticker}`}
                className="btn-ghost mt-2 w-full text-xs"
              >
                Open full analysis
              </Link>
            </div>

            <div className="space-y-6">
              {p.reason && (
                <div className="panel p-4">
                  <div className="eyebrow mb-2 flex items-center gap-1.5">
                    <Sparkles size={11} /> Why it ranks here
                  </div>
                  <AiText text={p.reason} dense />
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="eyebrow mb-3">Trade math</div>
                  <RiskReward metrics={p.metrics} sym={sym} />
                </div>
                {!beginner && (
                  <div>
                    <div className="eyebrow mb-3">Where the points came from</div>
                    <Breakdown items={p.breakdown} />
                  </div>
                )}
              </div>

              {p.headline && (
                <a
                  href={p.headline.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-t rule pt-4 text-sm text-text-secondary transition-colors hover:text-text-primary"
                >
                  <span className="eyebrow mb-1 block">Latest headline</span>
                  {p.headline.title}
                </a>
              )}
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
  // Each run scans a whole universe (many data calls + an LLM call), so keep
  // results fresh for a while instead of refetching on every visit.
  const topQ = useQuery({
    queryKey: ['toppicks', region],
    queryFn: () => api.topPicks(region, 10),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
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
    if (!tickers.length) { toast('Your watchlist is empty — add symbols, or type some below.'); return; }
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
    <div className="stagger mx-auto max-w-[1400px] space-y-7 p-5 sm:p-8">
      <div style={{ '--i': 0 }}>
        <PageHeader
          eyebrow={showTop ? `${region === 'india' ? 'Indian' : 'Global'} large caps · rescanned every 10 minutes` : 'Your ranking'}
          title="Top picks"
          lede={
            showTop
              ? 'Every symbol in the universe scored 0–100 on trend, momentum, risk/reward and sentiment, then ranked. The arithmetic is plain Python; a model explains the ordering afterwards.'
              : 'Your own list, scored on the same four factors. Switch region to return to the automatic top ten.'
          }
        >
          <Segmented options={REGIONS} value={showTop ? region : ''} onChange={pickRegion} />
        </PageHeader>
      </div>

      <div className="flex flex-wrap items-center gap-2" style={{ '--i': 1 }}>
        <form onSubmit={runCustom} className="flex min-w-[280px] flex-1 gap-2">
          <input
            className="input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Rank your own — AAPL, MSFT, RELIANCE.NS, BTC-USD"
          />
          <button className="btn shrink-0" type="submit" disabled={loading}>
            {rankM.isPending ? <><Loader2 size={14} className="animate-spin" /> Scoring…</> : 'Rank'}
          </button>
        </form>
        <button className="btn-ghost" onClick={runWatchlist} disabled={loading}>
          Rank my watchlist
        </button>
      </div>

      {loading && (
        <div className="space-y-2" style={{ '--i': 2 }}>
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 size={14} className="animate-spin" />
            Scoring {showTop ? `the ${region} universe` : `${parse(text).length || (watch?.tickers?.length ?? 0)} symbols`} — pulling a year of candles, then asking for reasons.
          </p>
          <div className="skeleton h-[560px]" />
        </div>
      )}

      {summary && !loading && (
        <section className="card" style={{ '--i': 2 }}>
          <div className="eyebrow mb-2.5 flex items-center gap-1.5">
            <Sparkles size={11} /> How this ranking came out
          </div>
          <AiText text={summary} />
        </section>
      )}

      {picks.length > 0 && !loading && (
        <div className="space-y-2" style={{ '--i': 3 }}>
          <div className="hidden items-center gap-3 px-5 sm:flex">
            <span className="w-6" />
            <span className="w-[15px]" />
            <span className="eyebrow w-40">Symbol</span>
            <span className="eyebrow w-24">Price</span>
            <span className="eyebrow w-20">Today</span>
            <span className="eyebrow w-16">R : R</span>
            <span className="flex-1" />
            <span className="eyebrow">Score</span>
          </div>
          <div className="card overflow-hidden p-0">
            {picks.map((p, i) => <PickRow key={p.ticker} p={p} rank={i + 1} beginner={beginner} />)}
          </div>
        </div>
      )}

      {!loading && data && picks.length === 0 && (
        <div className="card text-sm text-text-secondary" style={{ '--i': 3 }}>
          Nothing came back with usable data. The free price feed rate-limits in bursts — try again
          in a minute.
        </div>
      )}
    </div>
  );
}
