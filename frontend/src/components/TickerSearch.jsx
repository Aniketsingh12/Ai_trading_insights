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
        <ul className="absolute top-full left-0 right-0 mt-1.5 z-50 overflow-hidden rounded-xl
                       border border-border bg-surface/95 backdrop-blur-xl shadow-lift">
          {suggestions.map((s) => (
            <li key={s.ticker}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-elevated"
                onMouseDown={(e) => { e.preventDefault(); pick(s.ticker); }}
              >
                <span className="num font-semibold text-text-primary text-sm w-28 shrink-0 truncate">
                  {s.ticker}
                </span>
                <span className="text-text-secondary text-sm truncate flex-1">{s.name}</span>
                <span className="text-xs text-text-secondary shrink-0 hidden sm:inline">{s.exchange}</span>
                {s.type && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-elevated text-text-secondary shrink-0">
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
