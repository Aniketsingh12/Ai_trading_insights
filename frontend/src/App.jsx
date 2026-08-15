import { useEffect, useRef } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { LineChart, Search, List, Briefcase, Sparkles, Newspaper } from 'lucide-react';
import { useBeginner } from './lib/beginner.jsx';
import TapeRail from './components/TapeRail.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analyze from './pages/Analyze.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Portfolio from './pages/Portfolio.jsx';
import TopPicks from './pages/TopPicks.jsx';
import DailyReport from './pages/DailyReport.jsx';
import NotFound from './pages/NotFound.jsx';

const nav = [
  { to: '/', label: 'Dashboard', short: 'Markets', icon: LineChart },
  { to: '/daily', label: 'Daily Report', short: 'Daily', icon: Newspaper },
  { to: '/analyze', label: 'Analyze', short: 'Analyze', icon: Search },
  { to: '/picks', label: 'Top Picks', short: 'Picks', icon: Sparkles },
  { to: '/watchlist', label: 'Watchlist', short: 'Watch', icon: List },
  { to: '/portfolio', label: 'Portfolio', short: 'Folio', icon: Briefcase },
];

// A ticker route like /analyze/RELIANCE.NS should keep the Analyze tab active.
const isActive = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(to + '/');

/**
 * The mark is a miniature of the Signal arc — the same 252° sweep, filled to
 * roughly the same place. The app's one idea, at 20px.
 */
function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <path d="M8.7 30.4A16 16 0 1 1 31.3 30.4" fill="none" stroke="currentColor"
            strokeOpacity=".22" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M8.7 30.4A16 16 0 0 1 12.9 7.1" fill="none" stroke="currentColor"
            strokeWidth="4.5" strokeLinecap="round" />
      <path d="M17.4 5.2A16 16 0 0 1 31.3 30.4" fill="none" stroke="currentColor"
            strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

function Brand({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-text-primary">
      <Mark size={compact ? 22 : 26} />
      <span className="leading-none">
        <span className="block font-semibold tracking-tight">MarketMind</span>
        {!compact && <span className="eyebrow mt-1 block">Market intelligence</span>}
      </span>
    </Link>
  );
}

/** iOS-style switch. On is bone, because bone is the only emphasis in the system. */
function BeginnerToggle({ beginner, setBeginner, compact = false }) {
  const track = (
    <span
      className={`relative block h-[26px] w-[44px] shrink-0 rounded-pill transition-colors duration-300 ease-spring ${
        beginner ? 'bg-primary' : 'bg-white/[.14]'
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-depth transition-transform duration-300 ease-spring ${
          beginner ? 'translate-x-[21px] bg-bg' : 'translate-x-[3px]'
        }`}
      />
    </span>
  );

  if (compact) {
    return (
      <button
        onClick={() => setBeginner(!beginner)}
        aria-pressed={beginner}
        aria-label="Beginner mode"
        title="Beginner mode — plain-English calls, no raw indicators"
        className="flex items-center gap-2"
      >
        <span className="eyebrow">Beginner</span>
        {track}
      </button>
    );
  }

  return (
    <button
      onClick={() => setBeginner(!beginner)}
      aria-pressed={beginner}
      className="flex w-full items-center justify-between gap-3 rounded-ctl px-3 py-2.5 text-left transition-colors hover:bg-white/[.05]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">Beginner mode</span>
        <span className="mt-0.5 block text-xs leading-snug text-text-tertiary">
          Plain-English calls, no raw indicators
        </span>
      </span>
      {track}
    </button>
  );
}

export default function App() {
  const loc = useLocation();
  const { beginner, setBeginner } = useBeginner();
  const mainRef = useRef(null);

  // Land at the top of each page rather than mid-scroll from the last one.
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [loc.pathname]);

  return (
    <div className="flex h-full flex-col">
      <TapeRail />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="material hidden w-[248px] shrink-0 flex-col border-r rule md:flex">
          <div className="px-5 py-5">
            <Brand />
          </div>

          <nav className="flex-1 space-y-0.5 px-3">
            {nav.map(({ to, label, icon: Icon }) => {
              const active = isActive(loc.pathname, to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-ctl px-3 py-2.5 text-sm transition-colors duration-200 ${
                    active
                      ? 'bg-raised font-medium text-text-primary shadow-depth'
                      : 'text-text-secondary hover:bg-white/[.05] hover:text-text-primary'
                  }`}
                >
                  <Icon size={17} strokeWidth={active ? 2.1 : 1.7} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t rule p-3">
            <BeginnerToggle beginner={beginner} setBeginner={setBeginner} />
            <p className="px-3 pb-1 text-xs text-text-tertiary">Analysis, not financial advice.</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="material sticky top-0 z-30 flex h-14 items-center justify-between border-b rule px-4 md:hidden">
            <Brand compact />
            <BeginnerToggle beginner={beginner} setBeginner={setBeginner} compact />
          </header>

          <main ref={mainRef} className="flex-1 overflow-y-auto pb-24 md:pb-0">
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

          {/* Mobile tab bar */}
          <nav
            className="material fixed inset-x-0 bottom-0 z-30 flex border-t rule md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {nav.map(({ to, short, icon: Icon }) => {
              const active = isActive(loc.pathname, to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                    active ? 'text-text-primary' : 'text-text-tertiary'
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                  {short}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
