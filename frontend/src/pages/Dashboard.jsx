import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const REGIONS = [
  { id: 'global', label: 'Global' },
  { id: 'india', label: 'India' },
];

function IndexCard({ item }) {
  const up = (item.change_pct ?? 0) >= 0;
  const sym = item.currency_symbol ?? '';
  return (
    <div className="card">
      <div className="text-text-secondary text-xs truncate">{item.label}</div>
      <div className="num text-xl mt-1">
        {item.price != null ? `${sym}${item.price.toLocaleString()}` : '—'}
      </div>
      <div className={`num text-sm ${up ? 'text-bull' : 'text-bear'}`}>
        {item.change_pct != null ? `${up ? '+' : ''}${item.change_pct.toFixed(2)}%` : '—'}
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
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Market Pulse</h1>
          <p className="text-text-secondary text-sm">
            {region === 'india'
              ? 'Indian indices — Nifty, Sensex, Bank Nifty, India VIX'
              : 'Global indices — US, UK, Germany, Japan, Hong Kong + macro'}{' '}
            · live via yfinance
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                region === r.id ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card num animate-pulse text-text-secondary">…</div>
            ))
          : data?.map((item) => <IndexCard key={item.ticker} item={item} />)}
      </div>

      <div className="card">
        <div className="font-semibold mb-2">AI Market Briefing</div>
        <p className="text-text-secondary text-sm">
          See the <a href="/daily" className="text-primary hover:underline">Daily Report</a> for
          today’s indices, top movers, headlines and an AI briefing. Rank any set of tickers on{' '}
          <a href="/picks" className="text-primary hover:underline">Top Picks</a>, or search a
          symbol like <span className="num text-text-primary">RELIANCE.NS</span> on Analyze for a
          full Deep Research report.
        </p>
      </div>
    </div>
  );
}
