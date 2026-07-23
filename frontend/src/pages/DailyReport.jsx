import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Newspaper, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

function MoverPill({ m }) {
  const up = (m.change_pct ?? 0) >= 0;
  return (
    <Link
      to={`/analyze/${m.ticker}`}
      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg/40 hover:bg-border/40 transition"
    >
      <span className="text-sm truncate">{m.label || m.ticker}</span>
      <span className={`num text-sm shrink-0 ${up ? 'text-bull' : 'text-bear'}`}>
        {up ? '+' : ''}{m.change_pct?.toFixed(2)}%
      </span>
    </Link>
  );
}

function NewsList({ title, items }) {
  return (
    <div className="card">
      <div className="font-semibold mb-3">{title}</div>
      <ul className="space-y-2.5">
        {items?.length ? items.map((n, i) => (
          <li key={i} className="text-sm leading-snug">
            <a href={n.url} target="_blank" rel="noreferrer" className="text-text-primary hover:text-primary">
              {n.title}
            </a>
            {n.source && <span className="text-text-secondary text-xs ml-2">· {n.source}</span>}
          </li>
        )) : <li className="text-text-secondary text-sm">No headlines available</li>}
      </ul>
    </div>
  );
}

function IndexStrip({ title, items }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items?.map((i) => {
          const up = (i.change_pct ?? 0) >= 0;
          return (
            <div key={i.ticker} className="bg-bg/40 rounded-lg px-3 py-2">
              <div className="text-xs text-text-secondary truncate">{i.label}</div>
              <div className="num text-sm">{i.price != null ? i.price.toLocaleString() : '—'}</div>
              <div className={`num text-xs ${up ? 'text-bull' : 'text-bear'}`}>
                {i.change_pct != null ? `${up ? '+' : ''}${i.change_pct.toFixed(2)}%` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyReport() {
  const { data: watch } = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const reportM = useMutation({ mutationFn: (tickers) => api.dailyReport(tickers) });

  // Auto-generate on first load (and whenever the watchlist is known).
  useEffect(() => {
    if (!reportM.data && !reportM.isPending) reportM.mutate(watch?.tickers || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch?.tickers?.length]);

  const r = reportM.data;
  const generated = r?.generated_at ? new Date(r.generated_at).toLocaleString() : null;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Newspaper size={20} className="text-primary" /> Daily Market Report
          </h1>
          <p className="text-text-secondary text-sm">
            {generated ? `Generated ${generated}` : 'Today’s indices, movers, news & an AI briefing'}
          </p>
        </div>
        <button
          className="btn-ghost flex items-center gap-2"
          onClick={() => reportM.mutate(watch?.tickers || [])}
          disabled={reportM.isPending}
        >
          <RefreshCw size={15} className={reportM.isPending ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {reportM.isPending && !r && <div className="text-text-secondary">Building today’s report…</div>}

      {r && (
        <>
          {/* AI briefing */}
          <div className="card">
            <div className="font-semibold mb-2 flex items-center gap-2">AI Market Briefing</div>
            <pre className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">{r.briefing}</pre>
          </div>

          {/* Indices */}
          <div className="card grid md:grid-cols-2 gap-5">
            <IndexStrip title="Global indices" items={r.indices?.global} />
            <IndexStrip title="Indian indices" items={r.indices?.india} />
          </div>

          {/* Movers */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card space-y-2">
              <div className="font-semibold text-bull">Top Gainers</div>
              {r.gainers?.length ? r.gainers.map((m) => <MoverPill key={m.ticker} m={m} />)
                : <div className="text-text-secondary text-sm">No data</div>}
            </div>
            <div className="card space-y-2">
              <div className="font-semibold text-bear">Top Losers</div>
              {r.losers?.length ? r.losers.map((m) => <MoverPill key={m.ticker} m={m} />)
                : <div className="text-text-secondary text-sm">No data</div>}
            </div>
          </div>

          {/* News — Global + India */}
          <div className="grid md:grid-cols-2 gap-4">
            <NewsList title="🌐 Global — Important News" items={r.news_global} />
            <NewsList title="🇮🇳 India — Important News" items={r.news_india} />
          </div>

          <p className="text-xs text-text-secondary">
            Market commentary generated by AI from live data. Not financial advice.
          </p>
        </>
      )}
    </div>
  );
}
