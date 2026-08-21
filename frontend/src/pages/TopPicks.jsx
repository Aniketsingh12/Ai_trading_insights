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
import { isAccessError } from '../lib/auth';

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
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[.03] sm:px-4"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="num w-4 shrink-0 text-right text-[11px] text-text-tertiary">{rank}</span>
        <ChevronRight
          size={13}
          className={`shrink-0 text-text-tertiary transition-transform duration-300 ease-spring ${open ? 'rotate-90' : ''}`}
        />

        <span className="min-w-0 flex-1 sm:w-36 sm:flex-none">
          <span className="block truncate text-[13px] font-medium">{p.ticker}</span>
          <span className="mt-0.5 flex gap-2 truncate text-[11px] text-text-tertiary sm:hidden">
            <span className="num">{sym}{p.price?.toLocaleString()}</span>
            <Delta pct={p.change_pct} bare />
          </span>
          <span className="mt-0.5 hidden truncate text-[11px] text-text-tertiary sm:block">
            {p.name && p.name !== p.ticker ? p.name : p.exchange}
          </span>
        </span>

        <span className="num hidden w-20 shrink-0 text-[13px] sm:block">
          {sym}{p.price?.toLocaleString()}
        </span>
        <span className="hidden w-16 shrink-0 sm:block">
          <Delta pct={p.change_pct} bare className="text-[13px]" />
        </span>
        <span className="num hidden w-12 shrink-0 text-[13px] text-text-tertiary sm:block">
          {p.metrics?.risk_reward ?? '—'}
        </span>
        <span className="hidden flex-1 sm:block" />

        <ScoreBadge label={p.label} score={p.score} />
      </button>

      {open && (
        <div className="border-t rule bg-black/20 px-3 pb-5 pt-4 sm:px-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
            <div>
              <SignalArc score={p.score} label={p.label} items={p.breakdown} />
              <Link to={`/analyze/${p.ticker}`} className="btn-ghost mt-2 w-full">
                Open full analysis
              </Link>
            </div>

            <div className="space-y-5">
              {p.reason && (
                <div className="panel p-3">
                  <div className="eyebrow mb-1.5 flex items-center gap-1">
                    <Sparkles size={10} /> Why it ranks here
                  </div>
                  <AiText text={p.reason} dense />
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="eyebrow mb-2">Trade math</div>
                  <RiskReward metrics={p.metrics} sym={sym} />
                </div>
                {!beginner && (
                  <div>
                    <div className="eyebrow mb-2">Where the points came from</div>
                    <Breakdown items={p.breakdown} />
                  </div>
                )}
              </div>

              {p.headline && (
                <a
                  href={p.headline.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-t rule pt-3 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
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
    // A missing passcode already raised the gate — don't stack a toast on it.
    onError: (e) => { if (!isAccessError(e)) toast.error(e.message); },
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
    <div className="stagger mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <div style={{ '--i': 0 }}>
        <PageHeader
          eyebrow={showTop ? `${region === 'india' ? 'Indian' : 'Global'} large caps · rescanned every 10 min` : 'Your ranking'}
          title="Top picks"
          lede={
            showTop
              ? 'Every symbol scored 0–100 on trend, momentum, risk/reward and sentiment, then ranked. The arithmetic is plain Python; a model explains the ordering afterwards.'
              : 'Your own list, scored on the same four factors. Switch region to return to the automatic top ten.'
          }
        >
          <Segmented options={REGIONS} value={showTop ? region : ''} onChange={pickRegion} />
        </PageHeader>
      </div>

      <div className="flex flex-wrap items-center gap-2" style={{ '--i': 1 }}>
        <form onSubmit={runCustom} className="flex min-w-[260px] flex-1 gap-2">
          <input
            className="input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Rank your own — AAPL, MSFT, RELIANCE.NS, BTC-USD"
          />
          <button className="btn shrink-0" type="submit" disabled={loading}>
            {rankM.isPending ? <><Loader2 size={12} className="animate-spin" /> Scoring…</> : 'Rank'}
          </button>
        </form>
        <button className="btn-ghost" onClick={runWatchlist} disabled={loading}>
          Rank my watchlist
        </button>
      </div>

      {loading && (
        <div className="space-y-2" style={{ '--i': 2 }}>
          <p className="flex items-center gap-2 text-[13px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" />
            Scoring {showTop ? `the ${region} universe` : `${parse(text).length || (watch?.tickers?.length ?? 0)} symbols`} — a year of candles each, then reasons.
          </p>
          <div className="skeleton h-[440px]" />
        </div>
      )}

      {summary && !loading && (
        <section className="card" style={{ '--i': 2 }}>
          <div className="eyebrow mb-2 flex items-center gap-1">
            <Sparkles size={10} /> How this ranking came out
          </div>
          <AiText text={summary} />
        </section>
      )}

      {picks.length > 0 && !loading && (
        <div className="space-y-1.5" style={{ '--i': 3 }}>
          <div className="hidden items-center gap-2.5 px-4 sm:flex">
            <span className="w-4" />
            <span className="w-[13px]" />
            <span className="eyebrow w-36">Symbol</span>
            <span className="eyebrow w-20">Price</span>
            <span className="eyebrow w-16">Today</span>
            <span className="eyebrow w-12">R : R</span>
            <span className="flex-1" />
            <span className="eyebrow">Score</span>
          </div>
          <div className="card overflow-hidden p-0">
            {picks.map((p, i) => <PickRow key={p.ticker} p={p} rank={i + 1} beginner={beginner} />)}
          </div>
        </div>
      )}

      {!loading && data && picks.length === 0 && (
        <div className="card text-[13px] text-text-tertiary" style={{ '--i': 3 }}>
          Nothing came back with usable data. The free price feed rate-limits in bursts — try
          again in a minute.
        </div>
      )}
    </div>
  );
}
