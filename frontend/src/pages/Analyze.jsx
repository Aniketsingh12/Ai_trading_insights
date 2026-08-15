import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createChart } from 'lightweight-charts';
import toast from 'react-hot-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { ScoreBadge, SignalArc, Breakdown, RiskReward } from '../components/Score';
import InfoTip from '../components/InfoTip';
import AiText from '../components/AiText';
import TickerSearch from '../components/TickerSearch';
import Delta from '../components/Delta';
import { useBeginner } from '../lib/beginner.jsx';

const VERDICT_TONE = {
  'STRONG BUY': 'text-bull', BUY: 'text-bull', HOLD: 'text-warn',
  SELL: 'text-bear', 'STRONG SELL': 'text-bear',
};

function SentimentBadge({ analysis }) {
  if (!analysis) return null;
  const txt = analysis.toUpperCase();
  let label = 'NEUTRAL', tone = 'text-warn', bg = 'rgba(255,212,38,.12)';
  if (txt.includes('BULLISH')) { label = 'BULLISH'; tone = 'text-bull'; bg = 'rgba(48,209,88,.12)'; }
  else if (txt.includes('BEARISH')) { label = 'BEARISH'; tone = 'text-bear'; bg = 'rgba(255,69,58,.12)'; }
  return (
    <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${tone}`} style={{ backgroundColor: bg }}>
      {label}
    </span>
  );
}

function VerdictBadge({ verdict }) {
  if (!verdict) return null;
  return <span className={`serif text-lg ${VERDICT_TONE[verdict] || 'text-text-secondary'}`}>{verdict}</span>;
}

/** Five analysts working. Status is carried by the dot, not by a word per row. */
function AgentProgress({ agents }) {
  return (
    <ol className="space-y-2.5">
      {agents.map((a) => {
        const done = a.status === 'done';
        const err = a.status === 'error';
        const running = a.status === 'running';
        return (
          <li key={a.name} className="flex items-center gap-2.5 text-sm">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                done ? 'bg-bull' : err ? 'bg-bear' : running ? 'animate-pulse bg-primary' : 'bg-white/20'
              }`}
            />
            <span className={done || running ? 'text-text-primary' : 'text-text-tertiary'}>{a.name}</span>
            {running && <Loader2 size={13} className="ml-auto animate-spin text-text-tertiary" />}
            {done && <span className="ml-auto text-xs text-text-tertiary">done</span>}
            {err && <span className="ml-auto text-xs text-bear">failed</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Chart({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !data?.length) return;
    const chart = createChart(ref.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8a8a93', fontFamily: 'Instrument Sans, sans-serif' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,.05)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: 'rgba(242,242,245,.35)', labelBackgroundColor: '#24242b' },
        horzLine: { color: 'rgba(242,242,245,.35)', labelBackgroundColor: '#24242b' },
      },
      width: ref.current.clientWidth,
      height: 380,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#30d158', downColor: '#ff453a',
      borderUpColor: '#30d158', borderDownColor: '#ff453a',
      wickUpColor: 'rgba(48,209,88,.6)', wickDownColor: 'rgba(255,69,58,.6)',
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
  // Score + trade math are free (pure math) — always load them.
  const { data: scored, isLoading: scoreLoading } = useQuery({
    queryKey: ['score', ticker],
    queryFn: () => api.scoreTicker(ticker, false),
    enabled: !!ticker,
    staleTime: 5 * 60_000,
  });
  // The AI reason costs a token call, so it's opt-in per ticker.
  const [explainFor, setExplainFor] = useState(null);
  const { data: explained, isFetching: explaining } = useQuery({
    queryKey: ['score-explain', ticker],
    queryFn: () => api.scoreTicker(ticker, true),
    enabled: explainFor === ticker,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const reason = explained?.reason;

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
      toast.success('Deep research started — five analysts running');
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

  const sym = quote?.currency_symbol ?? '$';

  return (
    <div className="stagger mx-auto max-w-[1400px] space-y-6 p-5 sm:p-8">
      <form onSubmit={submit} className="flex max-w-2xl gap-2" style={{ '--i': 0 }}>
        <TickerSearch className="flex-1" value={input} onChange={setInput} onSelect={handleSelect} />
        <button className="btn shrink-0" type="submit">Load</button>
      </form>

      {/* Quote header — the symbol, priced, as large as it deserves to be. */}
      <header style={{ '--i': 1 }}>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{ticker}</h1>
          {/* On a lifted chip the eyebrow's own grey drops below AA, so it steps up one. */}
          {quote?.exchange && (
            <span className="eyebrow rounded-pill bg-white/[.06] px-2.5 py-1 text-text-secondary">
              {quote.exchange} · {quote.region}
            </span>
          )}
        </div>
        {quote?.price != null && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="num text-figure font-semibold">{sym}{quote.price.toFixed(2)}</span>
            {quote.change != null && (
              <span className="flex items-baseline gap-2">
                <span className={`num text-lg ${quote.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {quote.change >= 0 ? '+' : '−'}{Math.abs(quote.change).toFixed(2)}
                </span>
                <Delta pct={quote.change_pct} />
              </span>
            )}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" style={{ '--i': 2 }}>
        <div className="card p-3 lg:col-span-2">
          <Chart data={ohlcv} />
        </div>

        <div className="space-y-5">
          {/* Signal score — the arc leads, the numbers follow. */}
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                Signal score <InfoTip text="A 0–100 reading computed in plain Python from price, momentum, trade math and sentiment. No model involved." />
              </h2>
              {scored?.label && <ScoreBadge label={scored.label} score={scored.score} />}
            </div>

            {scoreLoading && <div className="skeleton mt-4 h-44" />}

            {scored?.metrics && !scored.metrics.error && (
              <>
                <SignalArc
                  score={scored.score}
                  label={scored.label}
                  items={scored.breakdown}
                  className="mt-2"
                />

                {reason ? (
                  <div className="panel mt-1 p-3.5">
                    <div className="eyebrow mb-2 flex items-center gap-1.5">
                      <Sparkles size={11} /> Why
                    </div>
                    <AiText text={reason} dense />
                  </div>
                ) : (
                  <button
                    className="btn-ghost mt-1 w-full"
                    disabled={explaining}
                    onClick={() => setExplainFor(ticker)}
                  >
                    {explaining ? <><Loader2 size={14} className="animate-spin" /> Thinking…</> : 'Explain this score'}
                  </button>
                )}

                <div className="mt-5 border-t rule pt-4">
                  <RiskReward metrics={scored.metrics} sym={sym} />
                </div>

                {!beginner && (
                  <details className="group mt-4 border-t rule pt-4">
                    <summary className="cursor-pointer list-none text-sm text-text-secondary transition-colors hover:text-text-primary">
                      <span className="inline-block transition-transform group-open:rotate-90">›</span>{' '}
                      Where the {scored.score} points came from
                    </summary>
                    <div className="mt-4"><Breakdown items={scored.breakdown} /></div>
                  </details>
                )}
              </>
            )}

            {scored?.metrics?.error && (
              <p className="mt-3 text-sm text-text-secondary">No price history to score this symbol.</p>
            )}
          </section>

          {/* Quick analysis */}
          <section className="card space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Quick read</h2>
              <SentimentBadge analysis={result?.analysis} />
            </div>
            <p className="text-xs leading-relaxed text-text-tertiary">
              One model pass over the current indicators. Seconds, not minutes.
            </p>
            <button className="btn w-full" disabled={running} onClick={runQuick}>
              {running ? <><Loader2 size={14} className="animate-spin" /> Reading…</> : 'Run quick read'}
            </button>

            {!beginner && result?.indicators && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t rule pt-3.5 text-xs">
                {[
                  ['RSI', 'rsi', result.indicators.rsi],
                  ['MACD', 'macd', result.indicators.macd],
                  ['SMA 50', 'sma50', result.indicators.sma50],
                  ['SMA 200', 'sma200', result.indicators.sma200],
                ].map(([label, term, value]) => (
                  <div key={term} className="flex items-baseline justify-between gap-2">
                    <dt className="flex items-center gap-1 text-text-secondary">{label} <InfoTip term={term} /></dt>
                    <dd className="num text-text-primary">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            )}

            {result?.analysis && (
              <div className="border-t rule pt-3.5"><AiText text={result.analysis} /></div>
            )}
          </section>

          {/* Deep research */}
          <section className="card space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Deep research</h2>
              {report?.verdict && <VerdictBadge verdict={report.verdict} />}
            </div>
            <p className="text-xs leading-relaxed text-text-tertiary">
              Five analysts — research, technical, sentiment and risk — then a sixth pass that
              reconciles them into one verdict.
            </p>
            <button className="btn w-full" disabled={report?.status === 'running'} onClick={runDeep}>
              {report?.status === 'running'
                ? <><Loader2 size={14} className="animate-spin" /> Analysts working…</>
                : 'Run deep research'}
            </button>
            {report?.agents && (
              <div className="border-t rule pt-3.5"><AgentProgress agents={report.agents} /></div>
            )}
            {report?.status === 'error' && (
              <p className="text-sm text-bear">Failed: {report.error}</p>
            )}
          </section>
        </div>
      </div>

      {/* The finished report */}
      {report?.status === 'done' && report?.report && (
        <div className="space-y-4" style={{ '--i': 3 }}>
          <article className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b rule pb-4">
              <h2 className="text-lg font-semibold">Deep research — {report.ticker}</h2>
              <VerdictBadge verdict={report.verdict} />
            </div>
            <div className="pt-4"><AiText text={report.report} /></div>
            <p className="mt-5 border-t rule pt-4 text-xs text-text-tertiary">
              Written by {report.agents?.length ?? 5} analysts from live market data.
              Informational analysis, not financial advice.
            </p>
          </article>

          {!beginner && report.sections?.length > 0 && (
            <div className="space-y-2">
              <div className="eyebrow px-1">Individual analysts</div>
              {report.sections.map((s) => (
                <details key={s.agent} className="card group overflow-hidden p-0">
                  <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 transition-colors hover:bg-white/[.04]">
                    <span className="text-text-tertiary transition-transform group-open:rotate-90">›</span>
                    <span className="text-sm font-medium">{s.agent}</span>
                    <span className="text-xs text-text-tertiary">{s.role}</span>
                  </summary>
                  <div className="border-t rule px-5 pb-5 pt-4"><AiText text={s.output} /></div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
