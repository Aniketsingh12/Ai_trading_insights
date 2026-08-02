import { Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  LineChart, Search, List, Briefcase, Sparkles, Newspaper, GraduationCap, BrainCircuit,
} from 'lucide-react';
import { useBeginner } from './lib/beginner.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analyze from './pages/Analyze.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Portfolio from './pages/Portfolio.jsx';
import TopPicks from './pages/TopPicks.jsx';
import DailyReport from './pages/DailyReport.jsx';
import NotFound from './pages/NotFound.jsx';

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

/** Slow-drifting colour blobs behind the glass. Fixed + blurred so it reads as depth. */
function Aurora() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="aurora-layer absolute -top-40 -right-32 h-[38rem] w-[38rem] rounded-full bg-primary/20 blur-[120px] animate-aurora" />
      <div
        className="aurora-layer absolute top-1/3 -left-40 h-[32rem] w-[32rem] rounded-full bg-accent/12 blur-[120px] animate-aurora"
        style={{ animationDelay: '-8s' }}
      />
      <div
        className="aurora-layer absolute -bottom-48 left-1/3 h-[34rem] w-[34rem] rounded-full bg-indigo-500/10 blur-[130px] animate-aurora"
        style={{ animationDelay: '-16s' }}
      />
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow shrink-0">
        <BrainCircuit size={18} className="text-white" />
      </span>
      <span className="leading-tight">
        <span className="block font-bold tracking-tight">MarketMind</span>
        {!compact && (
          <span className="block text-[10px] uppercase tracking-widest text-text-secondary">
            AI Market Intelligence
          </span>
        )}
      </span>
    </div>
  );
}

function BeginnerToggle({ beginner, setBeginner, compact = false }) {
  return (
    <button
      onClick={() => setBeginner(!beginner)}
      aria-pressed={beginner}
      className={`flex items-center justify-between gap-2 rounded-lg border border-border bg-elevated/50
                  hover:border-primary/50 transition ${compact ? 'px-2.5 py-1.5' : 'w-full px-3 py-2'}`}
      title="Beginner mode hides raw indicators and shows plain-English calls"
    >
      <span className="flex items-center gap-2 text-sm text-text-primary">
        <GraduationCap size={15} /> {compact ? '' : 'Beginner mode'}
      </span>
      <span className={`relative w-9 h-5 rounded-full transition ${beginner ? 'bg-primary shadow-glow' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${beginner ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function App() {
  const loc = useLocation();
  const { beginner, setBeginner } = useBeginner();

  return (
    <div className="flex h-full">
      <Aurora />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface/60 backdrop-blur-xl">
        <div className="px-5 py-5 border-b border-border">
          <Brand />
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = isActive(loc.pathname, to);
            return (
              <Link
                key={to}
                to={to}
                className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? 'bg-gradient-to-r from-primary to-primary/80 text-white shadow-glow'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated/70'
                }`}
              >
                <Icon size={16} className={active ? '' : 'group-hover:text-primary transition'} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <BeginnerToggle beginner={beginner} setBeginner={setBeginner} />
          <div className="text-xs text-text-secondary">Not financial advice.</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-border bg-surface/80 backdrop-blur-xl">
          <Brand compact />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-surface/90 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {nav.map(({ to, short, icon: Icon }) => {
            const active = isActive(loc.pathname, to);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition ${
                  active ? 'text-primary' : 'text-text-secondary'
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary shadow-glow" />
                )}
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
