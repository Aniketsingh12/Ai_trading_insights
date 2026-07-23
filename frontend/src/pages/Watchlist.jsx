import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api';

export default function Watchlist() {
  const qc = useQueryClient();
  const [ticker, setTicker] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist, refetchInterval: 30_000 });

  const add = useMutation({
    mutationFn: (t) => api.addWatch(t),
    onSuccess: () => { setTicker(''); qc.invalidateQueries({ queryKey: ['watchlist'] }); },
  });
  const remove = useMutation({
    mutationFn: (t) => api.removeWatch(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Watchlist</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); if (ticker.trim()) add.mutate(ticker.trim().toUpperCase()); }}
        className="flex gap-2 max-w-md"
      >
        <input className="input flex-1 uppercase" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Add ticker" />
        <button className="btn" type="submit">Add</button>
      </form>
      {isLoading ? <div className="text-text-secondary">Loading…</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-border/40">
              <tr className="text-left">
                <th className="px-4 py-2">Ticker</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Change %</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data?.quotes?.length ? data.quotes.map((q) => {
                const up = (q.change_pct ?? 0) >= 0;
                return (
                  <tr key={q.ticker} className="border-t border-border hover:bg-border/30">
                    <td className="px-4 py-2 font-semibold">
                      <Link className="hover:text-primary" to={`/analyze/${q.ticker}`}>{q.ticker}</Link>
                    </td>
                    <td className="px-4 py-2 text-right num">${q.price?.toFixed(2) ?? '—'}</td>
                    <td className={`px-4 py-2 text-right num ${up ? 'text-bull' : 'text-bear'}`}>
                      {q.change_pct != null ? `${up ? '+' : ''}${q.change_pct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => remove.mutate(q.ticker)} className="text-text-secondary hover:text-bear">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-secondary">No tickers yet. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
