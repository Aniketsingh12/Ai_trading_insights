import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

const fmt = (n, d = 2) =>
  n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function Signed({ value, pct, sym = '' }) {
  if (value == null) return <span className="text-text-secondary">—</span>;
  const up = value >= 0;
  return (
    <span className={`num ${up ? 'text-bull' : 'text-bear'}`}>
      {up ? '+' : '−'}{sym}{fmt(Math.abs(value))}
      {pct != null && <span className="opacity-75"> ({up ? '+' : ''}{pct.toFixed(2)}%)</span>}
    </span>
  );
}

/** One summary card per currency — mixing INR and USD into one total would be wrong. */
function TotalCard({ t }) {
  const up = (t.pnl ?? 0) >= 0;
  return (
    <div className={`card card-3d ${t.pnl == null ? '' : up ? 'glow-bull' : 'glow-bear'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-text-secondary">
          {t.currency} · {t.positions} position{t.positions === 1 ? '' : 's'}
        </span>
        {t.pnl != null && (up ? <TrendingUp size={15} className="text-bull" /> : <TrendingDown size={15} className="text-bear" />)}
      </div>
      <div className="num text-2xl mt-1.5">
        {t.currency_symbol}{fmt(t.market_value)}
      </div>
      <div className="text-sm mt-0.5">
        <Signed value={t.pnl} pct={t.pnl_pct} sym={t.currency_symbol} />
        {t.pnl == null && (
          <span className="text-text-secondary text-xs">
            Total hidden — {t.positions - t.priced_positions} position(s) had no live price
          </span>
        )}
      </div>
      <div className="flex justify-between text-xs text-text-secondary mt-2.5 pt-2.5 border-t border-border">
        <span>Cost {t.currency_symbol}{fmt(t.cost_basis)}</span>
        <span>Today <Signed value={t.day_pnl} sym={t.currency_symbol} /></span>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ticker: '', qty: '', avg_price: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: api.portfolio,
    refetchInterval: 60_000,
  });
  const { data: stats } = useQuery({
    queryKey: ['portfolio-stats'],
    queryFn: api.portfolioStats,
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['portfolio'] });
    qc.invalidateQueries({ queryKey: ['portfolio-stats'] });
  };

  const add = useMutation({
    mutationFn: (p) => api.addPosition(p),
    onSuccess: () => { setForm({ ticker: '', qty: '', avg_price: '' }); invalidate(); },
    onError: (e) => toast.error(`Could not add: ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: (t) => api.removePosition(t),
    onSuccess: invalidate,
    onError: (e) => toast.error(`Could not remove: ${e.message}`),
  });

  function submit(e) {
    e.preventDefault();
    const qty = parseFloat(form.qty);
    const avg = parseFloat(form.avg_price);
    if (!form.ticker.trim() || !(qty > 0) || !(avg > 0)) {
      toast.error('Enter a ticker, a quantity and an average price above zero.');
      return;
    }
    add.mutate({ ticker: form.ticker.trim().toUpperCase(), qty, avg_price: avg });
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-rise">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase size={20} className="text-primary" /> Portfolio
        </h1>
        <p className="text-text-secondary text-sm">
          Live market value and unrealised P&amp;L, refreshed every minute. Held in memory —
          positions reset when the server restarts.
        </p>
      </div>

      {stats?.totals?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.totals.map((t) => <TotalCard key={t.currency} t={t} />)}
        </div>
      )}

      <form onSubmit={submit} className="card grid grid-cols-2 sm:flex gap-2 sm:flex-wrap sm:items-end">
        <div>
          <label className="text-xs text-text-secondary block mb-1">Ticker</label>
          <input className="input uppercase w-full sm:w-36" value={form.ticker} placeholder="AAPL"
                 onChange={(e) => setForm({ ...form, ticker: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Quantity</label>
          <input type="number" step="any" min="0" className="input w-full sm:w-28" value={form.qty} placeholder="10"
                 onChange={(e) => setForm({ ...form, qty: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Avg buy price</label>
          <input type="number" step="any" min="0" className="input w-full sm:w-32" value={form.avg_price} placeholder="150"
                 onChange={(e) => setForm({ ...form, avg_price: e.target.value })} required />
        </div>
        <button type="submit" className="btn col-span-2 sm:col-span-1" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add position'}
        </button>
      </form>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14" />)}
        </div>
      ) : !data?.length ? (
        <div className="card text-center py-12 space-y-2">
          <Briefcase size={28} className="mx-auto text-text-secondary" />
          <div className="text-text-primary font-medium">No positions yet</div>
          <p className="text-text-secondary text-sm max-w-sm mx-auto">
            Add a holding above to track live value and profit/loss. Works with any market —
            try <span className="num text-text-primary">AAPL</span> or{' '}
            <span className="num text-text-primary">RELIANCE.NS</span>.
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-secondary border-b border-border">
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Avg</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">P&amp;L</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const sym = p.currency_symbol ?? '';
                return (
                  <tr key={p.ticker} className="border-b border-border/60 last:border-0 hover:bg-elevated/50 transition">
                    <td className="px-4 py-3 font-semibold">
                      <Link className="hover:text-primary transition" to={`/analyze/${p.ticker}`}>{p.ticker}</Link>
                      {p.exchange && <div className="text-xs text-text-secondary font-normal">{p.exchange}</div>}
                    </td>
                    <td className="px-4 py-3 text-right num">{fmt(p.qty, 0)}</td>
                    <td className="px-4 py-3 text-right num text-text-secondary">{sym}{fmt(p.avg_price)}</td>
                    <td className="px-4 py-3 text-right num">
                      {p.priced ? `${sym}${fmt(p.price)}` : <span className="text-text-secondary text-xs">no data</span>}
                    </td>
                    <td className="px-4 py-3 text-right num">{p.priced ? `${sym}${fmt(p.market_value)}` : '—'}</td>
                    <td className="px-4 py-3 text-right"><Signed value={p.pnl} pct={p.pnl_pct} sym={sym} /></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove.mutate(p.ticker)} aria-label={`Remove ${p.ticker}`}
                              className="text-text-secondary hover:text-bear transition p-1">
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
