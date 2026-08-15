import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const TYPE_LABEL = {
  EQUITY: 'Stock', ETF: 'ETF', INDEX: 'Index',
  FUTURE: 'Future', CRYPTOCURRENCY: 'Crypto', MUTUALFUND: 'Fund',
};

/**
 * Company-name → ticker autocomplete, backed by GET /market/search.
 * Shared by Analyze (load a symbol) and Watchlist (add a symbol).
 */
export default function TickerSearch({
  value,
  onChange,
  onSelect,
  placeholder = 'Search — Apple, Reliance, Bitcoin, or type a ticker…',
  className = '',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Debounced lookup — fires 300ms after typing stops.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.search(q);
        setSuggestions(res);
        setOpen(res.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const away = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const pick = (symbol) => {
    onSelect(symbol.toUpperCase());
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      <input
        className="input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck="false"
      />
      {open && suggestions.length > 0 && (
        <ul
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card shadow-pop"
          style={{ backgroundColor: 'rgba(26,26,31,.94)', backdropFilter: 'blur(28px) saturate(180%)' }}
        >
          {suggestions.map((s) => (
            <li key={s.ticker}>
              <button
                type="button"
                className="flex w-full items-center gap-3 border-b rule px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-white/[.07]"
                onMouseDown={(e) => { e.preventDefault(); pick(s.ticker); }}
              >
                <span className="w-24 shrink-0 truncate text-sm font-medium text-text-primary">
                  {s.ticker}
                </span>
                <span className="flex-1 truncate text-sm text-text-secondary">{s.name}</span>
                <span className="hidden shrink-0 text-xs text-text-tertiary sm:inline">{s.exchange}</span>
                {s.type && (
                  <span className="eyebrow shrink-0 rounded-md bg-white/[.07] px-1.5 py-1 text-text-secondary">
                    {TYPE_LABEL[s.type] || s.type}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
