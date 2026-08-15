import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader';

const fmt = (n, d = 2) =>
  n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function Signed({ value, pct, sym = '', className = '' }) {
  if (value == null) return <span className="text-text-tertiary">—</span>;
  const up = value >= 0;
  return (
    <span className={`num ${up ? 'text-bull' : 'text-bear'} ${className}`}>
      {up ? '+' : '−'}{sym}{fmt(Math.abs(value))}
      {pct != null && <span className="opacity-65"> ({up ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)</span>}
    </span>
  );
}

/**
 * One card per currency. Rupees and dollars are never added together — there's
 * no FX layer here, so a combined total would be a number that means nothing.
 */
function TotalCard({ t }) {
  const up = (t.pnl ?? 0) >= 0;
  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{t.currency}</span>
        <span className="eyebrow">{t.positions} position{t.positions === 1 ? '' : 's'}</span>
      </div>

      <div className="num mt-3 text-3xl font-semibold tracking-tight">
        {t.currency_symbol}{fmt(t.market_value)}
      </div>

      <div className="mt-1.5 text-sm">
        {t.pnl != null ? (
          <Signed value={t.pnl} pct={t.pnl_pct} sym={t.currency_symbol} className="font-medium" />
        ) : (
          <span className="text-xs leading-snug text-text-tertiary">
            Total withheld — {t.positions - t.priced_positions} position(s) had no live price, so
            this would understate the real figure.
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-t rule pt-3 text-xs">
        <span className="text-text-tertiary">
          Cost <span className="num text-text-secondary">{t.currency_symbol}{fmt(t.cost_basis)}</span>
        </span>
        <span className="text-text-tertiary">
          Today <Signed value={t.day_pnl} sym={t.currency_symbol} />
        </span>
      </div>

      {/* Direction hairline, the same device the index cards use. */}
      <span
        className={`absolute inset-x-5 bottom-0 h-px ${t.pnl == null ? 'bg-transparent' : up ? 'bg-bull/40' : 'bg-bear/40'}`}
      />
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
      toast.error('Enter a symbol, a quantity and an average price above zero.');
      return;
    }
    add.mutate({ ticker: form.ticker.trim().toUpperCase(), qty, avg_price: avg });
  }

  return (
    <div className="stagger mx-auto max-w-[1400px] space-y-7 p-5 sm:p-8">
      <div style={{ '--i': 0 }}>
        <PageHeader
          eyebrow="Repriced every minute"
          title="Portfolio"
          lede="Live market value and unrealised profit and loss. Positions are held in memory and clear when the server restarts."
        />
      </div>

      {stats?.totals?.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ '--i': 1 }}>
          {stats.totals.map((t) => <TotalCard key={t.currency} t={t} />)}
        </div>
      )}

      <form onSubmit={submit} className="card flex flex-wrap items-end gap-3" style={{ '--i': 2 }}>
        <div className="min-w-0 flex-1 basis-32">
          <label htmlFor="p-ticker" className="eyebrow mb-1.5 block">Symbol</label>
          <input id="p-ticker" className="input uppercase" value={form.ticker} placeholder="AAPL"
                 onChange={(e) => setForm({ ...form, ticker: e.target.value })} required />
        </div>
        <div className="min-w-0 flex-1 basis-24">
          <label htmlFor="p-qty" className="eyebrow mb-1.5 block">Quantity</label>
          <input id="p-qty" type="number" step="any" min="0" className="input" value={form.qty} placeholder="10"
                 onChange={(e) => setForm({ ...form, qty: e.target.value })} required />
        </div>
        <div className="min-w-0 flex-1 basis-28">
          <label htmlFor="p-avg" className="eyebrow mb-1.5 block">Average buy price</label>
          <input id="p-avg" type="number" step="any" min="0" className="input" value={form.avg_price} placeholder="150"
                 onChange={(e) => setForm({ ...form, avg_price: e.target.value })} required />
        </div>
        <button type="submit" className="btn basis-full sm:basis-auto" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add position'}
        </button>
      </form>

      <div style={{ '--i': 3 }}>
        {isLoading ? (
          <div className="skeleton h-64" />
        ) : !data?.length ? (
          <div className="card px-6 py-14 text-center">
            <Briefcase size={26} className="mx-auto text-text-tertiary" strokeWidth={1.5} />
            <h2 className="mt-4 font-medium">No positions yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">
              Add a holding above to track its value and P&amp;L live. Any market works — try{' '}
              <span className="mono text-text-primary">AAPL</span> or{' '}
              <span className="mono text-text-primary">RELIANCE.NS</span>.
            </p>
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b rule text-left">
                  <th className="eyebrow px-5 py-3 font-medium">Symbol</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">Qty</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">Average</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">Price</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">Value</th>
                  <th className="eyebrow px-5 py-3 text-right font-medium">P&amp;L</th>
                  <th className="w-12 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.map((p) => {
                  const sym = p.currency_symbol ?? '';
                  return (
                    <tr key={p.ticker} className="border-b rule transition-colors last:border-0 hover:bg-white/[.04]">
                      <td className="px-5 py-3.5">
                        <Link className="font-medium transition-colors hover:text-text-secondary" to={`/analyze/${p.ticker}`}>
                          {p.ticker}
                        </Link>
                        {p.exchange && <div className="eyebrow mt-1">{p.exchange}</div>}
                      </td>
                      <td className="mono px-5 py-3.5 text-right">{fmt(p.qty, 0)}</td>
                      <td className="mono px-5 py-3.5 text-right text-text-secondary">{sym}{fmt(p.avg_price)}</td>
                      <td className="mono px-5 py-3.5 text-right">
                        {p.priced ? `${sym}${fmt(p.price)}` : <span className="text-xs text-text-tertiary">no data</span>}
                      </td>
                      <td className="mono px-5 py-3.5 text-right">{p.priced ? `${sym}${fmt(p.market_value)}` : '—'}</td>
                      <td className="px-5 py-3.5 text-right"><Signed value={p.pnl} pct={p.pnl_pct} sym={sym} /></td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => remove.mutate(p.ticker)}
                          aria-label={`Remove ${p.ticker}`}
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
