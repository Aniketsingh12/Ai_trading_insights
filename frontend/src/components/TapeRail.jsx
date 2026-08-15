import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Delta from './Delta';

/**
 * The tape — live index levels pinned above everything, global then India.
 *
 * It reuses the Dashboard's exact query keys, so the two share one cache entry
 * per region and the rail costs no extra requests. Scrolls horizontally on
 * narrow screens and fades into its own edges rather than being clipped.
 */
export default function TapeRail() {
  const global = useQuery({ queryKey: ['indices', 'global'], queryFn: () => api.indices('global'), refetchInterval: 30_000 });
  const india = useQuery({ queryKey: ['indices', 'india'], queryFn: () => api.indices('india'), refetchInterval: 30_000 });

  const items = [...(global.data ?? []), ...(india.data ?? [])].filter((i) => i.price != null);
  if (!items.length) return null;

  return (
    <div className="material relative z-40 border-b rule">
      <div className="edge-fade no-bar overflow-x-auto">
        <div className="flex w-max items-stretch px-6">
          {items.map((i) => (
            <Link
              key={i.ticker}
              to={`/analyze/${encodeURIComponent(i.ticker)}`}
              className="group flex items-center gap-2.5 whitespace-nowrap border-r rule py-2 pl-4 pr-4 first:pl-0 last:border-r-0
                         transition-colors hover:bg-white/[.04]"
            >
              <span className="text-xs text-text-secondary transition-colors group-hover:text-text-primary">
                {i.label}
              </span>
              <span className="num text-xs font-semibold text-text-primary">
                {i.currency_symbol ?? ''}{i.price.toLocaleString()}
              </span>
              <Delta pct={i.change_pct} bare className="text-xs" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
