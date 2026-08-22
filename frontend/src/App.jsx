import { useEffect, useRef } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { LineChart, Search, List, Briefcase, Sparkles, Newspaper } from 'lucide-react';
import { useBeginner } from './lib/beginner.jsx';
import NavRail from './components/NavRail.jsx';
import TapeRail from './components/TapeRail.jsx';
import VideoStage from './components/VideoStage.jsx';
import AiQuota from './components/AiQuota.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analyze from './pages/Analyze.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Portfolio from './pages/Portfolio.jsx';
import TopPicks from './pages/TopPicks.jsx';
import DailyReport from './pages/DailyReport.jsx';
import NotFound from './pages/NotFound.jsx';

const nav = [
  { to: '/', label: 'Markets', icon: LineChart },
  { to: '/daily', label: 'Daily', icon: Newspaper },
  { to: '/analyze', label: 'Analyze', icon: Search },
  { to: '/picks', label: 'Picks', icon: Sparkles },
  { to: '/watchlist', label: 'Watchlist', icon: List },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
];

// A ticker route like /analyze/RELIANCE.NS should keep the Analyze tab active.
const isActive = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(to + '/');

/** The mark is a miniature of the Signal arc — the app's one idea, at 18px. */
function Mark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <path d="M8.7 30.4A16 16 0 1 1 31.3 30.4" fill="none" stroke="currentColor"
            strokeOpacity=".2" strokeWidth="5" strokeLinecap="round" />
      <path d="M8.7 30.4A16 16 0 0 1 12.9 7.1" fill="none" stroke="currentColor"
            strokeWidth="5" strokeLinecap="round" />
      <path d="M17.4 5.2A16 16 0 0 1 31.3 30.4" fill="none" stroke="currentColor"
            strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Beginner mode switch.
 *
 * The track never fills. A filled track reads as a block of colour sitting in
 * the header — loud as red, still loud as white — and this is a preference, not
 * an action. State is carried by a small knob and by the label brightening,
 * which is as much emphasis as a setting warrants next to a red CTA.
 */
function BeginnerToggle({ beginner, setBeginner }) {
  return (
    <button
      onClick={() => setBeginner(!beginner)}
      aria-pressed={beginner}
      title="Beginner mode — plain-English calls, no raw indicators"
      className="group flex shrink-0 items-center gap-2"
    >
      <span
        className={`eyebrow hidden transition-colors sm:block ${
          beginner ? 'text-text-primary' : 'text-text-tertiary group-hover:text-text-secondary'
        }`}
      >
        Beginner
      </span>
      <span
        className={`relative block h-[16px] w-[30px] shrink-0 border bg-transparent transition-colors duration-300 ease-spring ${
          beginner ? 'border-white/45' : 'border-white/20'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[10px] w-[10px] transition-[transform,background-color] duration-300 ease-spring ${
            beginner ? 'translate-x-[16px] bg-white' : 'translate-x-[2px] bg-white/35'
          }`}
        />
      </span>
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
      <VideoStage />
      <TapeRail />

      {/* One horizontal chrome bar: identity, navigation, mode. */}
      <header className="material sticky top-0 z-40 border-b rule">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-text-primary">
            <Mark />
            <span className="hidden text-[13px] font-semibold tracking-tight sm:block">MarketMind</span>
          </Link>

          <span className="hidden h-4 w-px shrink-0 bg-white/10 sm:block" />

          <div className="min-w-0 flex-1">
            <NavRail items={nav} isActive={isActive} />
          </div>

          <AiQuota />
          <BeginnerToggle beginner={beginner} setBeginner={setBeginner} />
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto">
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

        <footer className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
          <p className="eyebrow border-t rule pt-4">Analysis, not financial advice.</p>
        </footer>
      </main>
    </div>
  );
}
