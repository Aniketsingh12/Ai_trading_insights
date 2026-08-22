import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader';
import Segmented from '../components/Segmented';
import Delta from '../components/Delta';

const REGIONS = [
  { id: 'global', label: 'Global' },
  { id: 'india', label: 'India' },
];

/**
 * Breadth — one bar per index, sized by how far it moved and hung off a shared
 * zero line.
 *
 * This is the market's internals, the thing read first: a wall of green above
 * the line is a different day from two tall green bars and eight short red ones,
 * and the shape says so before any number does.
 */
function Breadth({ items }) {
  const [hover, setHover] = useState(null);

  const scored = items.filter((i) => i.change_pct != null);
  if (!scored.length) return null;

  const maxAbs = Math.max(...scored.map((i) => Math.abs(i.change_pct)), 0.01);
  const advancing = scored.filter((i) => i.change_pct >= 0).length;
  const riskOn = advancing * 2 >= scored.length;
  const shown = hover != null ? scored[hover] : null;

  return (
    <section className="card">
      {/* One readout line serves the whole strip, so the bars need no labels. */}
      <div className="flex min-h-[1.25rem] flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {shown ? (
          <>
            <span className="text-[13px]">{shown.label}</span>
            <span className="num text-[13px]">
              <span className="text-text-tertiary">
                {shown.currency_symbol ?? ''}{shown.price?.toLocaleString()}
              </span>
              <Delta pct={shown.change_pct} bare className="ml-2" />
            </span>
          </>
        ) : (
          <>
            <span className="text-[13px] text-text-tertiary">
              <span className={`font-medium ${riskOn ? 'text-bull' : 'text-bear'}`}>
                {riskOn ? 'Risk-on' : 'Risk-off'}
              </span>
              {' · '}
              <span className="num text-text-secondary">{advancing}</span> of{' '}
              <span className="num text-text-secondary">{scored.length}</span> advancing
            </span>
            <span className="eyebrow">Point at a bar</span>
          </>
        )}
      </div>

      <div className="relative mt-3 h-20">
        <div className="absolute inset-x-0 top-1/2 border-t rule" />
        <div className="flex h-full items-stretch gap-1">
          {scored.map((i, n) => {
            const up = i.change_pct >= 0;
            const h = Math.max(2, (Math.abs(i.change_pct) / maxAbs) * 48);
            return (
              <Link
                key={i.ticker}
                to={`/analyze/${encodeURIComponent(i.ticker)}`}
                title={`${i.label} ${i.change_pct >= 0 ? '+' : '−'}${Math.abs(i.change_pct).toFixed(2)}%`}
                className="relative flex-1"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(null)}
              >
                <span
                  className={`absolute inset-x-0 transition-[height,opacity] duration-500 ease-spring ${
                    up ? 'bg-bull' : 'bg-bear'
                  } ${hover == null || hover === n ? 'opacity-100' : 'opacity-25'}`}
                  style={up ? { bottom: '50%', height: `${h}%` } : { top: '50%', height: `${h}%` }}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function IndexCard({ item }) {
  const dead = item.price == null;
  const up = (item.change_pct ?? 0) >= 0;

  return (
    <Link
      to={`/analyze/${encodeURIComponent(item.ticker)}`}
      className={`card card-lift flex flex-col justify-between gap-2 p-3 ${dead ? 'opacity-50' : ''}`}
    >
      <span className="truncate text-[11px] leading-snug text-text-tertiary">{item.label}</span>
      <div>
        <div className="num text-[15px] font-semibold tracking-tight">
          {dead ? '—' : `${item.currency_symbol ?? ''}${item.price.toLocaleString()}`}
        </div>
        {dead ? (
          <div className="mt-0.5 text-[11px] text-text-tertiary">No data</div>
        ) : (
          <div className="mt-1"><Delta pct={item.change_pct} /></div>
        )}
      </div>
      {/* A hairline that takes the direction's colour — the card's only chroma at rest. */}
      <span className={`absolute inset-x-3 bottom-0 h-px ${dead ? 'bg-transparent' : up ? 'bg-bull/35' : 'bg-bear/35'}`} />
    </Link>
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
    <div className="stagger mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <div style={{ '--i': 0 }}>
        <PageHeader
          eyebrow="Live · every 30 seconds"
          title={region === 'india' ? 'Indian markets' : 'Global markets'}
          lede={
            region === 'india'
              ? 'Nifty 50, Sensex, Bank Nifty, Nifty IT, India VIX and the rupee.'
              : 'US, UK, German, Japanese and Hong Kong indices, plus volatility, gold and bitcoin.'
          }
        >
          <Segmented options={REGIONS} value={region} onChange={setRegion} />
        </PageHeader>
      </div>

      {!isLoading && data?.length > 0 && (
        <div style={{ '--i': 1 }}>
          <Breadth items={data} />
        </div>
      )}

      <div style={{ '--i': 2 }} className="space-y-2">
        <div className="eyebrow">{region === 'india' ? 'Indian' : 'Global'} index levels</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-[86px]" />)
            : data?.map((item) => <IndexCard key={item.ticker} item={item} />)}
        </div>
      </div>

      <div style={{ '--i': 3 }} className="flex flex-wrap gap-2">
        <Link to="/daily" className="btn-ghost">Today’s briefing</Link>
        <Link to="/picks" className="btn-ghost">Top picks</Link>
        <Link to="/analyze" className="btn-ghost">Analyze a symbol</Link>
      </div>
    </div>
  );
}
