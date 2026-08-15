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
    <div className="relative z-30 border-b rule bg-bg">
      <div className="edge-fade no-bar overflow-x-auto">
        <div className="mx-auto flex w-max items-center px-4 sm:px-6">
          {items.map((i) => (
            <Link
              key={i.ticker}
              to={`/analyze/${encodeURIComponent(i.ticker)}`}
              className="group flex items-center gap-2 whitespace-nowrap px-3 py-1.5 first:pl-0
                         transition-colors hover:bg-white/[.03]"
            >
              <span className="text-[11px] text-text-tertiary transition-colors group-hover:text-text-secondary">
                {i.label}
              </span>
              <span className="num text-[11px] font-medium">
                {i.currency_symbol ?? ''}{i.price.toLocaleString()}
              </span>
              <Delta pct={i.change_pct} bare className="text-[11px]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
