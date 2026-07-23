import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function Portfolio() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ticker: '', qty: '', avg_price: '' });
  const { data, isLoading } = useQuery({ queryKey: ['portfolio'], queryFn: api.portfolio });

  const add = useMutation({
    mutationFn: (p) => api.addPosition(p),
    onSuccess: () => { setForm({ ticker: '', qty: '', avg_price: '' }); qc.invalidateQueries({ queryKey: ['portfolio'] }); },
  });

  function submit(e) {
    e.preventDefault();
    add.mutate({ ticker: form.ticker.toUpperCase(), qty: parseFloat(form.qty), avg_price: parseFloat(form.avg_price) });
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Portfolio</h1>
      <form onSubmit={submit} className="card grid grid-cols-2 sm:flex gap-2 sm:flex-wrap sm:items-end">
        <div>
          <label className="text-xs text-text-secondary block">Ticker</label>
          <input className="input uppercase w-full sm:w-32" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs text-text-secondary block">Quantity</label>
          <input type="number" step="any" className="input w-full sm:w-32" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs text-text-secondary block">Avg Price</label>
          <input type="number" step="any" className="input w-full sm:w-32" value={form.avg_price} onChange={(e) => setForm({ ...form, avg_price: e.target.value })} required />
        </div>
        <button type="submit" className="btn col-span-2 sm:col-span-1">Add Position</button>
      </form>

      {isLoading ? <div className="text-text-secondary">Loading…</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-border/40">
              <tr className="text-left">
                <th className="px-4 py-2">Ticker</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Avg Price</th>
                <th className="px-4 py-2 text-right">Cost Basis</th>
              </tr>
            </thead>
            <tbody>
              {data?.length ? data.map((p) => (
                <tr key={p.ticker} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold">{p.ticker}</td>
                  <td className="px-4 py-2 text-right num">{p.qty}</td>
                  <td className="px-4 py-2 text-right num">${p.avg_price.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right num">${(p.qty * p.avg_price).toFixed(2)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-secondary">No positions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
