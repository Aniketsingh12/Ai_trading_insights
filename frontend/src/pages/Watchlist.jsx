import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, List, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import TickerSearch from '../components/TickerSearch';

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
    <div className="p-4 sm:p-6 space-y-5 animate-rise">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <List size={20} className="text-primary" /> Watchlist
          </h1>
          <p className="text-text-secondary text-sm">
            {priced.length > 0
              ? `${advancing} of ${priced.length} advancing · refreshed every 30s`
              : 'Track symbols and rank them together — refreshed every 30s'}
          </p>
        </div>
        {quotes.length > 0 && (
          <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => navigate('/picks')}>
            <Sparkles size={14} /> Rank these on Top Picks
          </button>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2 max-w-xl">
        <TickerSearch
          className="flex-1"
          value={ticker}
          onChange={setTicker}
          onSelect={(sym) => add.mutate(sym)}
          placeholder="Search a company or ticker to add…"
        />
        <button className="btn" type="submit" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-14" />)}
        </div>
      ) : !quotes.length ? (
        <div className="card text-center py-12 space-y-2">
          <List size={28} className="mx-auto text-text-secondary" />
          <div className="text-text-primary font-medium">Your watchlist is empty</div>
          <p className="text-text-secondary text-sm max-w-sm mx-auto">
            Search above — try <span className="num text-text-primary">AAPL</span>,{' '}
            <span className="num text-text-primary">RELIANCE.NS</span> or{' '}
            <span className="num text-text-primary">BTC-USD</span>. Saved tickers can be
            scored together on <Link to="/picks" className="text-primary hover:underline">Top Picks</Link>.
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Change</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const up = (q.change_pct ?? 0) >= 0;
                // Use the quote's own symbol — hardcoding "$" showed ₹ stocks as dollars.
                const sym = q.currency_symbol ?? '';
                return (
                  <tr key={q.ticker} className="border-b border-border/60 last:border-0 hover:bg-elevated/50 transition">
                    <td className="px-4 py-3 font-semibold">
                      <Link className="hover:text-primary transition" to={`/analyze/${q.ticker}`}>{q.ticker}</Link>
                      {q.exchange && <div className="text-xs text-text-secondary font-normal">{q.exchange}</div>}
                    </td>
                    <td className="px-4 py-3 text-right num">
                      {q.price != null ? `${sym}${q.price.toLocaleString()}` : <span className="text-text-secondary text-xs">no data</span>}
                    </td>
                    <td className={`px-4 py-3 text-right num ${up ? 'text-bull' : 'text-bear'}`}>
                      {q.change_pct != null ? (
                        <span className="inline-flex items-center gap-1">
                          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {up ? '+' : ''}{q.change_pct.toFixed(2)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove.mutate(q.ticker)}
                        aria-label={`Remove ${q.ticker}`}
                        className="text-text-secondary hover:text-bear transition p-1"
                      >
                        <Trash2 size={16} />
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
  );
}
