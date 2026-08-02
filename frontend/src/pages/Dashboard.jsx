import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../lib/api';

const REGIONS = [
  { id: 'global', label: 'Global' },
  { id: 'india', label: 'India' },
];

function IndexCard({ item }) {
  const pct = item.change_pct;
  const up = (pct ?? 0) >= 0;
  const sym = item.currency_symbol ?? '';
  const dead = item.price == null;
  return (
    <Link
      to={`/analyze/${encodeURIComponent(item.ticker)}`}
      className={`card card-3d block ${dead ? 'opacity-60' : up ? 'hover:glow-bull' : 'hover:glow-bear'}`}
    >
      <div className="text-text-secondary text-xs truncate">{item.label}</div>
      <div className="num text-xl mt-1">{dead ? '—' : `${sym}${item.price.toLocaleString()}`}</div>
      {dead ? (
        <div className="text-xs text-text-secondary">unavailable</div>
      ) : (
        <div className={`num text-sm flex items-center gap-1 ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {pct != null ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '—'}
        </div>
      )}
    </Link>
  );
}

/** Real movers computed from the live basket — replaces the old hardcoded blurb. */
function PulseSummary({ items }) {
  const scored = (items || []).filter((i) => i.change_pct != null);
  if (!scored.length) return null;
  const sorted = [...scored].sort((a, b) => b.change_pct - a.change_pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const advancing = scored.filter((i) => i.change_pct >= 0).length;
  const breadthPct = Math.round((advancing / scored.length) * 100);
  const riskOn = advancing * 2 >= scored.length;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold flex items-center gap-2">
          <Activity size={16} className="text-primary" /> Market Pulse
        </div>
        <span className={`text-xs px-2 py-1 rounded-md ${riskOn ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'}`}>
          {riskOn ? 'Risk-on' : 'Risk-off'} · {advancing}/{scored.length} advancing
        </span>
      </div>

      <div className="h-2 rounded-full bg-bear/25 overflow-hidden" title={`${breadthPct}% advancing`}>
        <div className="h-full bg-bull transition-all duration-500" style={{ width: `${breadthPct}%` }} />
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <div className="panel p-3">
          <div className="text-xs text-text-secondary">Leading</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">{best.label}</span>
            <span className="num text-bull shrink-0">+{best.change_pct.toFixed(2)}%</span>
          </div>
        </div>
        <div className="panel p-3">
          <div className="text-xs text-text-secondary">Lagging</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">{worst.label}</span>
            <span className={`num shrink-0 ${worst.change_pct >= 0 ? 'text-bull' : 'text-bear'}`}>
              {worst.change_pct >= 0 ? '+' : ''}{worst.change_pct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link to="/daily" className="btn-ghost text-sm flex items-center gap-1.5">
          Full briefing &amp; news <ArrowRight size={14} />
        </Link>
        <Link to="/picks" className="btn-ghost text-sm flex items-center gap-1.5">
          Top Picks <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [region, setRegion] = useState('global');
  const { data, isLoading } = useQuery({
    queryKey: ['indices', region],
    queryFn: () => api.indices(region),
    refetchInterval: 30_000,
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-rise">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Market Pulse</h1>
          <p className="text-text-secondary text-sm">
            {region === 'india'
              ? 'Indian indices — Nifty, Sensex, Bank Nifty, India VIX'
              : 'Global indices — US, UK, Germany, Japan, Hong Kong + macro'}{' '}
            · live, refreshed every 30s
          </p>
        </div>
        <div className="flex gap-1 bg-elevated/60 border border-border rounded-lg p-1">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                region === r.id
                  ? 'bg-primary text-white shadow-glow'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-[86px]" />)
          : data?.map((item) => <IndexCard key={item.ticker} item={item} />)}
      </div>

      {!isLoading && <PulseSummary items={data} />}
    </div>
  );
}
