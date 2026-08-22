import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createChart } from 'lightweight-charts';
import toast from 'react-hot-toast';
import { Archive, Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { ScoreBadge, SignalArc, Breakdown, RiskReward } from '../components/Score';
import InfoTip from '../components/InfoTip';
import AiText from '../components/AiText';
import TickerSearch from '../components/TickerSearch';
import Delta from '../components/Delta';
import { isAccessError } from '../lib/auth';
import { useBeginner } from '../lib/beginner.jsx';

const VERDICT_TONE = {
  'STRONG BUY': 'text-bull', BUY: 'text-bull', HOLD: 'text-warn',
  SELL: 'text-bear', 'STRONG SELL': 'text-bear',
};

function SentimentBadge({ analysis }) {
  if (!analysis) return null;
  const txt = analysis.toUpperCase();
  let label = 'NEUTRAL', tone = 'text-warn', bg = 'rgba(255,212,38,.1)';
  if (txt.includes('BULLISH')) { label = 'BULLISH'; tone = 'text-bull'; bg = 'rgba(48,209,88,.1)'; }
  else if (txt.includes('BEARISH')) { label = 'BEARISH'; tone = 'text-bear'; bg = 'rgba(255,69,58,.1)'; }
  return (
    <span className={`px-1.5 py-0.5 text-[11px] font-semibold ${tone}`} style={{ backgroundColor: bg }}>
      {label}
    </span>
  );
}

function VerdictBadge({ verdict }) {
  if (!verdict) return null;
  return <span className={`serif text-sm ${VERDICT_TONE[verdict] || 'text-text-secondary'}`}>{verdict}</span>;
}

/** Five analysts working. Status is carried by the dot, not a word per row. */
function AgentProgress({ agents }) {
  return (
    <ol className="space-y-2">
      {agents.map((a) => {
        const done = a.status === 'done';
        const err = a.status === 'error';
        const running = a.status === 'running';
        return (
          <li key={a.name} className="flex items-center gap-2 text-[13px]">
            <span
              className={`h-1 w-1 shrink-0 rounded-full ${
                // White for in-progress: red here reads as a failed analyst.
                done ? 'bg-bull' : err ? 'bg-bear' : running ? 'animate-pulse bg-white' : 'bg-white/20'
              }`}
            />
            <span className={done || running ? 'text-text-secondary' : 'text-text-tertiary'}>{a.name}</span>
            {running && <Loader2 size={12} className="ml-auto animate-spin text-text-tertiary" />}
            {err && <span className="ml-auto text-[11px] text-bear">failed</span>}
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
      layout: { background: { color: 'transparent' }, textColor: '#7e7e86', fontFamily: 'JB, JetBrains Mono, monospace', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,.04)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: 'rgba(242,242,245,.3)', labelBackgroundColor: '#212127' },
        horzLine: { color: 'rgba(242,242,245,.3)', labelBackgroundColor: '#212127' },
      },
      width: ref.current.clientWidth,
      height: 320,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#30d158', downColor: '#ff453a',
      borderUpColor: '#30d158', borderDownColor: '#ff453a',
      wickUpColor: 'rgba(48,209,88,.5)', wickDownColor: 'rgba(255,69,58,.5)',
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
  // Set when the day's AI budget is spent and the API handed back an earlier run.
  const [sampleNote, setSampleNote] = useState(null);
  const qc = useQueryClient();
  // Every AI action changes the remaining-runs count in the header.
  const refreshQuota = () => qc.invalidateQueries({ queryKey: ['health'] });

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
      // A missing passcode already raised the gate — don't stack a toast on it.
      if (!isAccessError(e)) toast.error(e.message);
    } finally {
      setRunning(false);
      refreshQuota();
    }
  }

  async function runDeep() {
    try {
      const res = await api.deepResearch(ticker);
      setReportId(res.report_id);
      // The API degrades rather than refusing when the budget is gone: it hands
      // back a real run from earlier so the demo still shows what this produces.
      setSampleNote(res.sample ? res.sample_reason : null);
      toast.success(res.sample ? 'Showing a saved run' : 'Deep research started');
    } catch (e) {
      if (!isAccessError(e)) toast.error(e.message);
    } finally {
      refreshQuota();
    }
  }

  function submit(e) {
    e.preventDefault();
    if (input.trim()) {
      setTicker(input.trim().toUpperCase());
      setInput(input.trim().toUpperCase());
      setReportId(null);
      setResult(null);
      setSampleNote(null);
    }
  }

  const handleSelect = useCallback((symbol) => {
    setInput(symbol);
    setTicker(symbol);
    setReportId(null);
    setResult(null);
    setSampleNote(null);
  }, []);

  const sym = quote?.currency_symbol ?? '$';

  return (
    <div className="stagger mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      {/*
        z-30 is load-bearing. `.stagger > *` animates with a transform, which makes
        every section its own stacking context — so the autocomplete's own z-index
        cannot lift it over a later sibling. Raising this whole section does.
      */}
      <div style={{ '--i': 0 }} className="z-30 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">{ticker}</h1>
            {quote?.exchange && (
              <span className="eyebrow bg-white/[.05] px-1.5 py-0.5 text-text-secondary">
                {quote.exchange} · {quote.region}
              </span>
            )}
          </div>
          {quote?.price != null && (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="num text-figure font-semibold">{sym}{quote.price.toFixed(2)}</span>
              {quote.change != null && (
                <span className={`num text-[13px] ${quote.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {quote.change >= 0 ? '+' : '−'}{Math.abs(quote.change).toFixed(2)}
                </span>
              )}
              <Delta pct={quote.change_pct} />
            </div>
          )}
        </div>

        <form onSubmit={submit} className="flex w-full gap-2 sm:w-auto">
          <TickerSearch className="flex-1 sm:w-64" value={input} onChange={setInput} onSelect={handleSelect} />
          <button className="btn shrink-0" type="submit">Load</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" style={{ '--i': 1 }}>
        <div className="card p-2 lg:col-span-2">
          <Chart data={ohlcv} />
        </div>

        <div className="space-y-4">
          {/* Signal score — the arc leads, the numbers follow. */}
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold">
                Signal score <InfoTip text="A 0–100 reading computed in plain Python from price, momentum, trade math and sentiment. No model involved." />
              </h2>
              {scored?.label && <ScoreBadge label={scored.label} score={scored.score} />}
            </div>

            {scoreLoading && <div className="skeleton mt-3 h-32" />}

            {scored?.metrics && !scored.metrics.error && (
              <>
                <SignalArc score={scored.score} label={scored.label} items={scored.breakdown} className="mt-1" />

                {reason ? (
                  <div className="panel p-3">
                    <div className="eyebrow mb-1.5 flex items-center gap-1">
                      <Sparkles size={10} /> Why
                    </div>
                    <AiText text={reason} dense />
                  </div>
                ) : (
                  <button className="btn-ghost w-full" disabled={explaining} onClick={() => setExplainFor(ticker)}>
                    {explaining ? <><Loader2 size={12} className="animate-spin" /> Thinking…</> : 'Explain this score'}
                  </button>
                )}

                <div className="mt-4 border-t rule pt-3">
                  <RiskReward metrics={scored.metrics} sym={sym} />
                </div>

                {!beginner && (
                  <details className="group mt-3 border-t rule pt-3">
                    <summary className="cursor-pointer list-none text-[13px] text-text-tertiary transition-colors hover:text-text-primary">
                      <span className="inline-block transition-transform group-open:rotate-90">›</span>{' '}
                      Where the {scored.score} points came from
                    </summary>
                    <div className="mt-3"><Breakdown items={scored.breakdown} /></div>
                  </details>
                )}
              </>
            )}

            {scored?.metrics?.error && (
              <p className="mt-2 text-[13px] text-text-tertiary">No price history to score this symbol.</p>
            )}
          </section>

          {/* Quick analysis */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold">Quick read</h2>
              <SentimentBadge analysis={result?.analysis} />
            </div>
            <p className="text-[11px] leading-relaxed text-text-tertiary">
              One model pass over the current indicators. Seconds, not minutes.
            </p>
            <button className="btn w-full" disabled={running} onClick={runQuick}>
              {running ? <><Loader2 size={12} className="animate-spin" /> Reading…</> : 'Run quick read'}
            </button>

            {!beginner && result?.indicators && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t rule pt-3 text-[12px]">
                {[
                  ['RSI', 'rsi', result.indicators.rsi],
                  ['MACD', 'macd', result.indicators.macd],
                  ['SMA 50', 'sma50', result.indicators.sma50],
                  ['SMA 200', 'sma200', result.indicators.sma200],
                ].map(([label, term, value]) => (
                  <div key={term} className="flex items-baseline justify-between gap-2">
                    <dt className="flex items-center gap-1 text-text-tertiary">{label} <InfoTip term={term} /></dt>
                    <dd className="num">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            )}

            {result?.analysis && (
              <div className="border-t rule pt-3"><AiText text={result.analysis} /></div>
            )}
          </section>

          {/* Deep research */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold">Deep research</h2>
              {report?.verdict && <VerdictBadge verdict={report.verdict} />}
            </div>
            <p className="text-[11px] leading-relaxed text-text-tertiary">
              Five analysts — research, technical, sentiment and risk — then a pass that
              reconciles them into one verdict.
            </p>
            <button className="btn w-full" disabled={report?.status === 'running'} onClick={runDeep}>
              {report?.status === 'running'
                ? <><Loader2 size={12} className="animate-spin" /> Working…</>
                : 'Run deep research'}
            </button>
            {sampleNote && (
              <div className="panel flex items-start gap-2 p-2.5">
                <Archive size={12} className="mt-0.5 shrink-0 text-warn" />
                <p className="text-[11px] leading-relaxed text-text-tertiary">
                  <span className="text-warn">Saved run.</span> {sampleNote} This is a real report
                  produced earlier, so you can still see the output.
                </p>
              </div>
            )}
            {report?.agents && !sampleNote && (
              <div className="border-t rule pt-3"><AgentProgress agents={report.agents} /></div>
            )}
            {report?.status === 'error' && <p className="text-[13px] text-bear">Failed: {report.error}</p>}
          </section>
        </div>
      </div>

      {/* The finished report */}
      {report?.status === 'done' && report?.report && (
        <div className="space-y-3" style={{ '--i': 2 }}>
          <article className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b rule pb-3">
              <h2 className="text-[13px] font-semibold">Deep research — {report.ticker}</h2>
              <VerdictBadge verdict={report.verdict} />
            </div>
            <div className="pt-3"><AiText text={report.report} /></div>

            {/*
              The model was asked for a literal "VERDICT:" line. When it didn't
              give one, the parser defaults to HOLD — say so rather than let a
              formatting failure read as a considered neutral call.
            */}
            {report.verdict_source && report.verdict_source !== 'explicit' && (
              <p className="mt-3 text-[11px] leading-relaxed text-warn">
                The model didn’t state a verdict in the expected format, so this one was
                {report.verdict_source === 'scanned' ? ' inferred from the text' : ' defaulted to HOLD'}.
                Read the reasoning above rather than the label.
              </p>
            )}

            <p className="mt-4 border-t rule pt-3 text-[11px] text-text-tertiary">
              Written by {report.agents?.length ?? 5} analysts from live market data.
              Informational analysis, not financial advice.
            </p>
          </article>

          {!beginner && report.sections?.length > 0 && (
            <div className="space-y-1.5">
              <div className="eyebrow px-1">Individual analysts</div>
              {report.sections.map((s) => (
                <details key={s.agent} className="card group overflow-hidden p-0">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 transition-colors hover:bg-white/[.03]">
                    <span className="text-text-tertiary transition-transform group-open:rotate-90">›</span>
                    <span className="text-[13px] font-medium">{s.agent}</span>
                    <span className="text-[11px] text-text-tertiary">{s.role}</span>
                  </summary>
                  <div className="border-t rule px-4 pb-4 pt-3"><AiText text={s.output} /></div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
