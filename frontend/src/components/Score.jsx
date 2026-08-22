import { useState } from 'react';
import InfoTip from './InfoTip';

const VERDICT_TONE = {
  'STRONG BUY': { text: 'text-bull', fill: 'rgba(48,209,88,.12)', stroke: '#30d158' },
  BUY: { text: 'text-bull', fill: 'rgba(48,209,88,.1)', stroke: '#30d158' },
  HOLD: { text: 'text-warn', fill: 'rgba(255,212,38,.1)', stroke: '#ffd426' },
  SELL: { text: 'text-bear', fill: 'rgba(255,69,58,.1)', stroke: '#ff453a' },
  'STRONG SELL': { text: 'text-bear', fill: 'rgba(255,69,58,.12)', stroke: '#ff453a' },
};
const NEUTRAL = { text: 'text-text-secondary', fill: 'rgba(255,255,255,.06)', stroke: '#8a8a93' };
const toneOf = (label) => VERDICT_TONE[label] || NEUTRAL;

export function ScoreBadge({ label, score }) {
  const tone = toneOf(label);
  return (
    <span
      className={`inline-flex items-baseline gap-1 px-1.5 py-0.5 text-[11px] font-semibold ${tone.text}`}
      style={{ backgroundColor: tone.fill }}
    >
      {label}
      {score != null && <span className="num opacity-70">{score}</span>}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 *  The Signal arc
 *
 *  One ring, cut into four segments whose *widths* are the factor weights
 *  — Trend 30, Momentum 25, Risk/Reward 25, Sentiment 20. Each fills by
 *  the points that factor earned, so the total length of filled arc is
 *  exactly the 0–100 score.
 *
 *  The ring is therefore the total and the breakdown at once.
 * ══════════════════════════════════════════════════════════════════════ */

const CX = 80, CY = 76, R = 62, STROKE = 7;
const START = 144, SWEEP = 252;   // opening centred on the bottom
const GAP = 2.6;                  // degrees between segments

const polar = (deg, r) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

const arcPath = (a0, a1) => {
  const [x0, y0] = polar(a0, R);
  const [x1, y1] = polar(a1, R);
  return `M${x0} ${y0} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

export function SignalArc({ score, label, items, className = '' }) {
  const [focus, setFocus] = useState(null);
  const tone = toneOf(label);

  const factors = items?.length ? items : [];
  const total = factors.reduce((s, f) => s + (f.max || 0), 0) || 100;

  let cursor = 0;
  const segments = factors.map((f) => {
    const a0 = START + (cursor / total) * SWEEP + GAP / 2;
    cursor += f.max || 0;
    const a1 = START + (cursor / total) * SWEEP - GAP / 2;
    const ratio = f.max ? Math.min(1, Math.max(0, f.points / f.max)) : 0;
    return { ...f, a0, a1, ratio };
  });

  const shown = focus != null ? segments[focus] : null;

  return (
    <div className={`relative mx-auto w-full max-w-[180px] ${className}`}>
      <svg
        viewBox="0 0 160 126"
        className="w-full"
        role="img"
        aria-label={`Signal score ${score} out of 100${label ? `, ${label}` : ''}`}
      >
        {segments.length === 0 && (
          <path d={arcPath(START, START + SWEEP)} fill="none" stroke="rgba(255,255,255,.06)"
                strokeWidth={STROKE} strokeLinecap="butt" />
        )}

        {segments.map((s, i) => (
          <path key={`t-${s.factor}`} d={arcPath(s.a0, s.a1)} fill="none"
                strokeWidth={STROKE} strokeLinecap="butt"
                stroke={focus === i ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.06)'}
                className="transition-[stroke] duration-200" />
        ))}

        {segments.map((s, i) => s.ratio > 0.001 && (
          <path
            key={`f-${s.factor}`}
            d={arcPath(s.a0, s.a0 + s.ratio * (s.a1 - s.a0))}
            fill="none"
            stroke={tone.stroke}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            /* pathLength normalises each segment to 1, so one dash rule covers
               them all without measuring geometry. */
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={0}
            opacity={focus == null || focus === i ? 1 : 0.25}
            className="arc-sweep"
            style={{ transition: 'opacity .2s ease' }}
          />
        ))}

        {/* Hit targets sit on top, invisible and thick enough to tap. */}
        {segments.map((s, i) => (
          <path
            key={`h-${s.factor}`}
            d={arcPath(s.a0, s.a1)}
            fill="none"
            stroke="transparent"
            strokeWidth={STROKE + 12}
            className="cursor-pointer"
            onMouseEnter={() => setFocus(i)}
            onMouseLeave={() => setFocus(null)}
            onClick={() => setFocus((f) => (f === i ? null : i))}
          >
            <title>{`${s.factor}: ${s.points} of ${s.max}`}</title>
          </path>
        ))}
      </svg>

      {/* Readout, centred in the ring's opening. Swaps to the factor you point at. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-4 text-center">
        {shown ? (
          <>
            <div className="num text-xl font-semibold">
              {shown.points}<span className="text-sm text-text-tertiary">/{shown.max}</span>
            </div>
            <div className="eyebrow mt-0.5">{shown.factor}</div>
          </>
        ) : (
          <>
            <div className="num text-figure font-semibold">{score ?? '—'}</div>
            {label && <div className={`serif text-sm ${tone.text}`}>{label}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── breakdown ─────────────────────────── */

function barTone(points, max) {
  const r = max ? points / max : 0;
  if (r >= 0.75) return 'bg-bull';
  if (r >= 0.45) return 'bg-warn';
  return 'bg-bear';
}

export function Breakdown({ items }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-3">
      {items.map((b) => (
        <div key={b.factor}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[13px] text-text-primary">
              {b.factor} <InfoTip term={b.factor} />
            </span>
            <span className="num text-[11px] text-text-tertiary">
              <span className="text-text-primary">{b.points}</span>/{b.max}
            </span>
          </div>
          <div className="mt-1 h-[3px] overflow-hidden bg-white/[.06]">
            <div
              className={`h-full ${barTone(b.points, b.max)} transition-[width] duration-700 ease-spring`}
              style={{ width: `${b.max ? (b.points / b.max) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-text-tertiary">{b.reason}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── trade math ─────────────────────────── */

/**
 * Risk and reward drawn to scale.
 *
 * The bar runs stop → target and the colour boundary is the current price, so
 * the red length *is* what you'd lose and the green length *is* what you'd
 * make — the ratio is a comparison of two lengths, not a number to parse.
 */
export function RiskReward({ metrics, sym = '' }) {
  if (!metrics || metrics.error) return null;

  const { entry, target, stop, upside_pct, downside_pct, risk_reward, expected_monthly_move_pct } = metrics;
  const span = target - stop;
  const riskPct = span > 0 ? Math.min(92, Math.max(8, ((entry - stop) / span) * 100)) : 50;

  const rrTone =
    risk_reward == null ? 'text-text-secondary'
      : risk_reward >= 2 ? 'text-bull'
      : risk_reward >= 1 ? 'text-warn'
      : 'text-bear';

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="eyebrow">Risk</span>
          <span className="eyebrow">Reward</span>
        </div>
        <div className="flex h-1 overflow-hidden bg-white/[.06]">
          <div className="bg-bear/60 transition-[width] duration-700 ease-spring" style={{ width: `${riskPct}%` }} />
          <div className="bg-bull/60 transition-[width] duration-700 ease-spring" style={{ width: `${100 - riskPct}%` }} />
        </div>

        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="text-left">
            <div className="num text-[13px]">{sym}{stop}</div>
            <div className="num text-[11px] text-bear">−{downside_pct}%</div>
            <div className="eyebrow mt-0.5 flex items-center gap-1">Stop <InfoTip term="stop" /></div>
          </div>
          <div className="text-center">
            <div className="num text-[13px]">{sym}{entry}</div>
            <div className="text-[11px] text-text-tertiary">now</div>
            <div className="eyebrow mt-0.5 flex items-center justify-center gap-1">Entry <InfoTip term="entry" /></div>
          </div>
          <div className="text-right">
            <div className="num text-[13px]">{sym}{target}</div>
            <div className="num text-[11px] text-bull">+{upside_pct}%</div>
            <div className="eyebrow mt-0.5 flex items-center justify-end gap-1">Target <InfoTip term="target" /></div>
          </div>
        </div>
      </div>

      <dl className="space-y-1.5 border-t rule pt-2.5 text-[13px]">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-text-secondary">
            Risk / reward <InfoTip term="risk_reward" />
          </dt>
          <dd className={`num font-semibold ${rrTone}`}>
            {risk_reward != null ? `${risk_reward} : 1` : '—'}
          </dd>
        </div>
        {expected_monthly_move_pct != null && (
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-text-secondary">
              Expected monthly move <InfoTip term="expected_move" />
            </dt>
            <dd className="num">±{expected_monthly_move_pct}%</dd>
          </div>
        )}
      </dl>

      <p className="text-[11px] leading-relaxed text-text-tertiary">
        Target is {metrics.target_basis}; stop is {metrics.stop_basis}. A scenario from price
        history and volatility — not a forecast.
      </p>
    </div>
  );
}
