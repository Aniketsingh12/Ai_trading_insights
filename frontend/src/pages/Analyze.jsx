import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createChart } from 'lightweight-charts';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { ScoreBadge, Breakdown, RiskReward } from '../components/Score';
import InfoTip from '../components/InfoTip';
import { useBeginner } from '../lib/beginner.jsx';

function SentimentBadge({ analysis }) {
  if (!analysis) return null;
  const txt = analysis.toUpperCase();
  let label = 'NEUTRAL', cls = 'bg-warn/20 text-warn';
  if (txt.includes('BULLISH')) { label = 'BULLISH'; cls = 'bg-bull/20 text-bull'; }
  else if (txt.includes('BEARISH')) { label = 'BEARISH'; cls = 'bg-bear/20 text-bear'; }
  return <span className={`px-2 py-1 rounded text-xs font-semibold ${cls}`}>{label}</span>;
}

const VERDICT_STYLES = {
  'STRONG BUY': 'bg-bull/25 text-bull',
  BUY: 'bg-bull/20 text-bull',
  HOLD: 'bg-warn/20 text-warn',
  SELL: 'bg-bear/20 text-bear',
  'STRONG SELL': 'bg-bear/25 text-bear',
};

function VerdictBadge({ verdict }) {
  if (!verdict) return null;
  const cls = VERDICT_STYLES[verdict] || 'bg-border text-text-secondary';
  return <span className={`px-3 py-1 rounded-md text-sm font-bold ${cls}`}>{verdict}</span>;
}

const AGENT_ICON = { pending: '○', running: '◉', done: '✓', error: '✕' };
const AGENT_COLOR = { pending: 'text-text-secondary', running: 'text-primary', done: 'text-bull', error: 'text-bear' };

function AgentProgress({ agents }) {
  return (
    <div className="space-y-1.5 text-sm">
      {agents.map((a) => (
        <div key={a.name} className="flex items-center gap-2">
          <span className={`num ${AGENT_COLOR[a.status]} ${a.status === 'running' ? 'animate-pulse' : ''}`}>
            {AGENT_ICON[a.status]}
          </span>
          <span className="text-text-primary">{a.name}</span>
          <span className="text-text-secondary text-xs ml-auto capitalize">{a.status}</span>
        </div>
      ))}
    </div>
  );
}

const TYPE_LABEL = {
  EQUITY: 'Stock', ETF: 'ETF', INDEX: 'Index',
  FUTURE: 'Future', CRYPTOCURRENCY: 'Crypto', MUTUALFUND: 'Fund',
};

function TickerSearch({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Debounced search — fires 300 ms after typing stops
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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (!containerRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative flex-1 max-w-md" ref={containerRef}>
      <input
        className="input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Search — Apple, Reliance, Bitcoin, or type a ticker…"
        autoComplete="off"
        spellCheck="false"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.ticker}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-border text-left transition"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus
                  onSelect(s.ticker.toUpperCase());
                  setOpen(false);
                  setSuggestions([]);
                }}
              >
                <span className="num font-semibold text-text-primary text-sm w-28 shrink-0 truncate">
                  {s.ticker}
                </span>
                <span className="text-text-secondary text-sm truncate flex-1">{s.name}</span>
                <span className="text-xs text-text-secondary shrink-0">{s.exchange}</span>
                {s.type && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-border text-text-secondary shrink-0">
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

function Chart({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !data?.length) return;
    const chart = createChart(ref.current, {
      layout: { background: { color: '#12121a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e1e2e' }, horzLines: { color: '#1e1e2e' } },
      width: ref.current.clientWidth,
      height: 360,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    series.setData(data.map((c) => ({
      time: c.date.slice(0, 10),
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    chart.timeScale().fitContent();
    const handleResize = () => chart.applyOptions({ width: ref.current.clientWidth });
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [data]);
  return <div ref={ref} className="w-full" />;
}

export default function Analyze() {
  const { ticker: paramTicker } = useParams();
  const { beginner } = useBeginner();
  const [ticker, setTicker] = useState(paramTicker || 'AAPL');
  const [input, setInput] = useState(ticker);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [reportId, setReportId] = useState(null);

  const { data: ohlcv } = useQuery({
    queryKey: ['ohlcv', ticker],
    queryFn: () => api.ohlcv(ticker, 180),
    enabled: !!ticker,
  });
  const { data: quote } = useQuery({
    queryKey: ['quote', ticker],
    queryFn: () => api.quote(ticker),
    enabled: !!ticker,
    refetchInterval: 30_000,
  });
  const { data: scored, isLoading: scoreLoading } = useQuery({
    queryKey: ['score', ticker],
    queryFn: () => api.scoreTicker(ticker),
    enabled: !!ticker,
  });

  // Poll the deep-research job while it's running.
  const { data: report } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => api.getReport(reportId),
    enabled: !!reportId,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  });

  async function runQuick() {
    setRunning(true);
    setResult(null);
    try {
      setResult(await api.quickAnalysis(ticker));
    } catch (e) {
      toast.error(`Analysis failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runDeep() {
    try {
      const { report_id } = await api.deepResearch(ticker);
      setReportId(report_id);
      toast.success('Deep research started — 5 agents running');
    } catch (e) {
      toast.error(`Could not start: ${e.message}`);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (input.trim()) {
      setTicker(input.trim().toUpperCase());
      setInput(input.trim().toUpperCase());
      setReportId(null);
      setResult(null);
    }
  }

  const handleSelect = useCallback((symbol) => {
    setInput(symbol);
    setTicker(symbol);
    setReportId(null);
    setResult(null);
  }, []);

  const up = (quote?.change_pct ?? 0) >= 0;
  const sym = quote?.currency_symbol ?? '$';

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <TickerSearch
          value={input}
          onChange={setInput}
          onSelect={handleSelect}
        />
        <button className="btn" type="submit">Load</button>
      </form>

      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">{ticker}</h1>
        {quote?.exchange && (
          <span className="text-xs px-2 py-0.5 rounded bg-border text-text-secondary">
            {quote.exchange} · {quote.region}
          </span>
        )}
        {quote?.price != null && (
          <>
            <span className="num text-2xl">{sym}{quote.price.toFixed(2)}</span>
            {quote.change != null && (
              <span className={`num ${up ? 'text-bull' : 'text-bear'}`}>
                {up ? '+' : ''}{quote.change.toFixed(2)} ({quote.change_pct?.toFixed(2)}%)
              </span>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-2">
          <Chart data={ohlcv} />
        </div>

        <div className="space-y-4">
          {/* Score + Risk/Reward */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Signal Score &amp; Trade Math</div>
              {scored?.label && <ScoreBadge label={scored.label} score={scored.score} />}
            </div>
            {scoreLoading && <div className="text-text-secondary text-sm">Scoring…</div>}
            {scored?.metrics && !scored.metrics.error && (
              <>
                {scored.reason && (
                  <div className="bg-bg/40 rounded-lg p-3">
                    <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">AI reasoning</div>
                    <p className="text-sm text-text-primary leading-relaxed">{scored.reason}</p>
                  </div>
                )}
                <RiskReward metrics={scored.metrics} sym={sym} />
                {!beginner && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-text-secondary">Why this score ({scored.score}/100)</summary>
                    <div className="mt-3"><Breakdown items={scored.breakdown} /></div>
                  </details>
                )}
              </>
            )}
            {scored && scored.metrics?.error && (
              <div className="text-text-secondary text-sm">No price data to score this symbol.</div>
            )}
          </div>

          {/* Quick analysis */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">AI Quick Analysis</div>
              <SentimentBadge analysis={result?.analysis} />
            </div>
            <button className="btn w-full" disabled={running} onClick={runQuick}>
              {running ? 'Analyzing…' : 'Run Quick Analysis'}
            </button>
            {!beginner && result?.indicators && (
              <div className="text-xs grid grid-cols-2 gap-2 num">
                <div className="flex items-center gap-1">RSI <InfoTip term="rsi" />: <span className="text-text-primary">{result.indicators.rsi ?? '—'}</span></div>
                <div className="flex items-center gap-1">MACD <InfoTip term="macd" />: <span className="text-text-primary">{result.indicators.macd ?? '—'}</span></div>
                <div className="flex items-center gap-1">SMA50 <InfoTip term="sma50" />: <span className="text-text-primary">{result.indicators.sma50 ?? '—'}</span></div>
                <div className="flex items-center gap-1">SMA200 <InfoTip term="sma200" />: <span className="text-text-primary">{result.indicators.sma200 ?? '—'}</span></div>
              </div>
            )}
            {result?.analysis && (
              <pre className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">{result.analysis}</pre>
            )}
          </div>

          {/* Deep research */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Deep Research (5 agents)</div>
              {report?.verdict && <VerdictBadge verdict={report.verdict} />}
            </div>
            <button
              className="btn w-full"
              disabled={report?.status === 'running'}
              onClick={runDeep}
            >
              {report?.status === 'running' ? 'Agents running…' : 'Run Deep Research'}
            </button>
            {report?.agents && <AgentProgress agents={report.agents} />}
            {report?.status === 'error' && (
              <div className="text-bear text-sm">Failed: {report.error}</div>
            )}
          </div>
        </div>
      </div>

      {/* Full report */}
      {report?.status === 'done' && report?.report && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Deep Research Report — {report.ticker}</h2>
            <VerdictBadge verdict={report.verdict} />
          </div>
          <pre className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">{report.report}</pre>
          {!beginner && (
            <details className="text-sm">
              <summary className="cursor-pointer text-text-secondary">Per-agent breakdown</summary>
              <div className="mt-3 space-y-4">
                {report.sections?.map((s) => (
                  <div key={s.agent}>
                    <div className="font-semibold text-primary">{s.agent} · {s.role}</div>
                    <pre className="whitespace-pre-wrap text-text-secondary leading-relaxed mt-1">{s.output}</pre>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
