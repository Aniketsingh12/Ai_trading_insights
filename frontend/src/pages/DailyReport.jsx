import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowUpRight, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import AiText from '../components/AiText';
import PageHeader from '../components/PageHeader';
import Delta from '../components/Delta';

function MoverRow({ m }) {
  return (
    <Link
      to={`/analyze/${m.ticker}`}
      className="flex items-center justify-between gap-3 border-b rule px-4 py-2 transition-colors last:border-0 hover:bg-white/[.03]"
    >
      <span className="truncate text-[13px]">{m.label || m.ticker}</span>
      <Delta pct={m.change_pct} bare className="shrink-0 text-[13px]" />
    </Link>
  );
}

function MoverCard({ title, items, tone }) {
  return (
    <section className="card p-0">
      <h2 className={`px-4 pb-2 pt-3 text-[13px] font-semibold ${tone}`}>{title}</h2>
      <div className="border-t rule">
        {items?.length
          ? items.map((m) => <MoverRow key={m.ticker} m={m} />)
          : <p className="px-4 py-3 text-[13px] text-text-tertiary">No data</p>}
      </div>
    </section>
  );
}

function NewsList({ region, title, items }) {
  return (
    <section className="card p-0">
      <div className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <span className="eyebrow">{region}</span>
      </div>
      <ul className="border-t rule">
        {items?.length ? items.map((n, i) => (
          <li key={i}>
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2.5 border-b rule px-4 py-2.5 transition-colors last:border-0 hover:bg-white/[.03]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug text-text-secondary transition-colors group-hover:text-text-primary">
                  {n.title}
                </span>
                {n.source && <span className="eyebrow mt-1 block">{n.source}</span>}
              </span>
              <ArrowUpRight
                size={12}
                className="mt-0.5 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
              />
            </a>
          </li>
        )) : <li className="px-4 py-3 text-[13px] text-text-tertiary">No headlines available</li>}
      </ul>
    </section>
  );
}

function IndexStrip({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.ticker} className="panel px-3 py-2">
            <div className="truncate text-[11px] text-text-tertiary">{i.label}</div>
            <div className="num mt-0.5 text-[13px] font-medium">
              {i.price != null ? i.price.toLocaleString() : '—'}
            </div>
            <Delta pct={i.change_pct} bare className="mt-0.5 block text-[11px]" />
          </div>
        ))}
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
  const generated = r?.generated_at
    ? new Date(r.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div className="stagger mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <div style={{ '--i': 0 }}>
        <PageHeader
          eyebrow={generated ? `Filed ${generated}` : 'Compiling'}
          title="Today’s briefing"
          lede="Where the indices closed, what moved most, and the headlines behind it — read back in a paragraph."
        >
          <button
            className="btn-ghost"
            onClick={() => reportM.mutate(watch?.tickers || [])}
            disabled={reportM.isPending}
          >
            <RefreshCw size={12} className={reportM.isPending ? 'animate-spin' : ''} />
            Refresh
          </button>
        </PageHeader>
      </div>

      {reportM.isPending && !r && (
        <div className="space-y-3" style={{ '--i': 1 }}>
          <p className="flex items-center gap-2 text-[13px] text-text-tertiary">
            <Loader2 size={12} className="animate-spin" /> Pulling indices, movers and feeds…
          </p>
          <div className="skeleton h-40" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="skeleton h-52" /><div className="skeleton h-52" />
          </div>
        </div>
      )}

      {r && (
        <>
          {/* The briefing is an editorial — given the measure and the type to read like one. */}
          <article className="card px-5 py-5" style={{ '--i': 1 }}>
            <div className="eyebrow mb-3 flex items-center gap-1">
              <Sparkles size={10} /> The read
            </div>
            <div className="max-w-[66ch]">
              <AiText text={r.briefing} />
            </div>
          </article>

          <section className="card grid gap-5 md:grid-cols-2" style={{ '--i': 2 }}>
            <IndexStrip title="Global" items={r.indices?.global} />
            <IndexStrip title="India" items={r.indices?.india} />
          </section>

          <div className="grid gap-3 md:grid-cols-2" style={{ '--i': 3 }}>
            <MoverCard title="Biggest gainers" items={r.gainers} tone="text-bull" />
            <MoverCard title="Biggest losers" items={r.losers} tone="text-bear" />
          </div>

          <div className="grid gap-3 md:grid-cols-2" style={{ '--i': 4 }}>
            <NewsList region="Global" title="What’s moving world markets" items={r.news_global} />
            <NewsList region="India" title="What’s moving Indian markets" items={r.news_india} />
          </div>

          <p className="text-[11px] text-text-tertiary" style={{ '--i': 5 }}>
            Commentary written by a model from live data. Analysis, not financial advice.
          </p>
        </>
      )}
    </div>
  );
}
