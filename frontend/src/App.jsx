import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { LineChart, Search, List, Briefcase, Sparkles, Newspaper, GraduationCap } from 'lucide-react';
import { useBeginner } from './lib/beginner.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analyze from './pages/Analyze.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Portfolio from './pages/Portfolio.jsx';
import TopPicks from './pages/TopPicks.jsx';
import DailyReport from './pages/DailyReport.jsx';

const nav = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LineChart },
  { to: '/daily', label: 'Daily Report', short: 'News', icon: Newspaper },
  { to: '/analyze', label: 'Analyze', short: 'Analyze', icon: Search },
  { to: '/picks', label: 'Top Picks', short: 'Picks', icon: Sparkles },
  { to: '/watchlist', label: 'Watchlist', short: 'Watch', icon: List },
  { to: '/portfolio', label: 'Portfolio', short: 'Folio', icon: Briefcase },
];

// A ticker route like /analyze/RELIANCE.NS should keep the Analyze tab active.
const isActive = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(to + '/');

function BeginnerToggle({ beginner, setBeginner, compact = false }) {
  return (
    <button
      onClick={() => setBeginner(!beginner)}
      className={`flex items-center justify-between gap-2 rounded-lg border border-border hover:bg-border/40 transition ${
        compact ? 'px-2.5 py-1.5' : 'w-full px-3 py-2'
      }`}
      title="Beginner mode hides raw indicators and shows plain-English calls"
    >
      <span className="flex items-center gap-2 text-sm text-text-primary">
        <GraduationCap size={15} /> {compact ? '' : 'Beginner mode'}
      </span>
      <span className={`relative w-9 h-5 rounded-full transition ${beginner ? 'bg-primary' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${beginner ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function App() {
  const loc = useLocation();
  const { beginner, setBeginner } = useBeginner();

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 border-r border-border bg-surface flex-col shrink-0">
        <div className="px-5 py-5 border-b border-border">
          <div className="text-lg font-bold tracking-tight">TradeForge</div>
          <div className="text-xs text-text-secondary">AI Trading Analyst</div>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive(loc.pathname, to) ? 'bg-primary text-white' : 'text-text-secondary hover:bg-border'
              }`}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <BeginnerToggle beginner={beginner} setBeginner={setBeginner} />
          <div className="text-xs text-text-secondary">Not financial advice.</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-surface sticky top-0 z-30">
          <div className="font-bold tracking-tight">TradeForge</div>
          <BeginnerToggle beginner={beginner} setBeginner={setBeginner} compact />
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/daily" element={<DailyReport />} />
            <Route path="/analyze" element={<Analyze />} />
            <Route path="/analyze/:ticker" element={<Analyze />} />
            <Route path="/picks" element={<TopPicks />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/portfolio" element={<Portfolio />} />
          </Routes>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {nav.map(({ to, short, icon: Icon }) => {
            const active = isActive(loc.pathname, to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition ${
                  active ? 'text-primary' : 'text-text-secondary'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                {short}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
