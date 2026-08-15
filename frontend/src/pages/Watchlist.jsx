import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, List, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import TickerSearch from '../components/TickerSearch';
import PageHeader from '../components/PageHeader';
import Delta from '../components/Delta';

export default function Watchlist() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ticker, setTicker] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: api.watchlist,
    refetchInterval: 30_000,
  });

  const add = useMutation({
    mutationFn: (t) => api.addWatch(t),
    onSuccess: () => { setTicker(''); qc.invalidateQueries({ queryKey: ['watchlist'] }); },
    onError: (e) => toast.error(`Could not add: ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: (t) => api.removeWatch(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
    onError: (e) => toast.error(`Could not remove: ${e.message}`),
  });

  const quotes = data?.quotes ?? [];
  const priced = quotes.filter((q) => q.change_pct != null);
  const advancing = priced.filter((q) => q.change_pct >= 0).length;

  const submit = (e) => {
    e.preventDefault();
    if (ticker.trim()) add.mutate(ticker.trim().toUpperCase());
  };

  return (
    <div className="stagger mx-auto max-w-[1400px] space-y-7 p-5 sm:p-8">
      <div style={{ '--i': 0 }}>
        <PageHeader
          eyebrow={
            priced.length > 0
              ? `${advancing} of ${priced.length} advancing · every 30 seconds`
              : 'Refreshed every 30 seconds'
          }
          title="Watchlist"
          lede="The symbols you're following, repriced live. Score the whole list together on Top Picks."
        >
          {quotes.length > 0 && (
            <button className="btn-ghost" onClick={() => navigate('/picks')}>
              <Sparkles size={14} /> Rank these
            </button>
          )}
        </PageHeader>
      </div>

      <form onSubmit={submit} className="flex max-w-xl gap-2" style={{ '--i': 1 }}>
        <TickerSearch
          className="flex-1"
          value={ticker}
          onChange={setTicker}
          onSelect={(sym) => add.mutate(sym)}
          placeholder="Search a company or symbol to add…"
        />
        <button className="btn shrink-0" type="submit" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      <div style={{ '--i': 2 }}>
        {isLoading ? (
          <div className="skeleton h-64" />
        ) : !quotes.length ? (
          <div className="card px-6 py-14 text-center">
            <List size={26} className="mx-auto text-text-tertiary" strokeWidth={1.5} />
            <h2 className="mt-4 font-medium">Nothing on the list yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">
              Search above — try <span className="mono text-text-primary">AAPL</span>,{' '}
              <span className="mono text-text-primary">RELIANCE.NS</span> or{' '}
              <span className="mono text-text-primary">BTC-USD</span>. Saved symbols can be scored
              together on <Link to="/picks" className="text-text-primary underline underline-offset-4">Top Picks</Link>.
            </p>
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-b rule text-left">
                  <th className="eyebrow px-5 py-3 font-medium">Symbol</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">Price</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">Today</th>
                  <th className="w-12 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  // Use the quote's own symbol — hardcoding "$" showed ₹ stocks as dollars.
                  const sym = q.currency_symbol ?? '';
                  return (
                    <tr key={q.ticker} className="border-b rule transition-colors last:border-0 hover:bg-white/[.04]">
                      <td className="px-5 py-3.5">
                        <Link className="font-medium transition-colors hover:text-text-secondary" to={`/analyze/${q.ticker}`}>
                          {q.ticker}
                        </Link>
                        {q.exchange && <div className="eyebrow mt-1">{q.exchange}</div>}
                      </td>
                      <td className="mono px-5 py-3.5 text-right">
                        {q.price != null
                          ? `${sym}${q.price.toLocaleString()}`
                          : <span className="text-xs text-text-tertiary">no data</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right"><Delta pct={q.change_pct} bare /></td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => remove.mutate(q.ticker)}
                          aria-label={`Remove ${q.ticker}`}
                          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-bear/15 hover:text-bear"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
