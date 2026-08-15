import { useState } from 'react';
import InfoTip from './InfoTip';

const VERDICT_TONE = {
  'STRONG BUY': { text: 'text-bull', fill: 'rgba(48,209,88,.14)', stroke: '#30d158' },
  BUY: { text: 'text-bull', fill: 'rgba(48,209,88,.12)', stroke: '#30d158' },
  HOLD: { text: 'text-warn', fill: 'rgba(255,212,38,.12)', stroke: '#ffd426' },
  SELL: { text: 'text-bear', fill: 'rgba(255,69,58,.12)', stroke: '#ff453a' },
  'STRONG SELL': { text: 'text-bear', fill: 'rgba(255,69,58,.14)', stroke: '#ff453a' },
};
const NEUTRAL = { text: 'text-text-secondary', fill: 'rgba(255,255,255,.07)', stroke: '#8a8a93' };
const toneOf = (label) => VERDICT_TONE[label] || NEUTRAL;

export function ScoreBadge({ label, score }) {
  const tone = toneOf(label);
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ${tone.text}`}
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
 *  — Trend 30, Momentum 25, Risk/Reward 25, Sentiment 20. Each segment
 *  fills by the points that factor earned, so the total length of filled
 *  arc is exactly the 0–100 score.
 *
 *  The ring is therefore the total and the breakdown at the same time:
 *  a short green sweep with one dark quarter tells you both that the score
 *  is 70 and which factor cost it the other 30.
 * ══════════════════════════════════════════════════════════════════════ */

const CX = 110, CY = 104, R = 84, STROKE = 13;
const START = 144, SWEEP = 252;   // opening centred on the bottom
const GAP = 3.2;                  // degrees of breathing room between segments

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
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 220 178"
        className="w-full"
        role="img"
        aria-label={`Signal score ${score} out of 100${label ? `, ${label}` : ''}`}
      >
        {/* Empty track — the full sweep, so the unearned points stay visible. */}
        {segments.length === 0 && (
          <path d={arcPath(START, START + SWEEP)} fill="none" stroke="rgba(255,255,255,.07)"
                strokeWidth={STROKE} strokeLinecap="round" />
        )}

        {segments.map((s, i) => (
          <path key={`t-${s.factor}`} d={arcPath(s.a0, s.a1)} fill="none"
                strokeWidth={STROKE} strokeLinecap="round"
                stroke={focus === i ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.07)'}
                className="transition-[stroke] duration-200" />
        ))}

        {segments.map((s, i) => s.ratio > 0.001 && (
          <path
            key={`f-${s.factor}`}
            d={arcPath(s.a0, s.a0 + s.ratio * (s.a1 - s.a0))}
            fill="none"
            stroke={tone.stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            /* pathLength normalises every segment to 1, so one dash rule
               covers them all without measuring any geometry.
               The resting state is *drawn* and the sweep animates away from
               it, so the arc is never invisible when the animation doesn't
               run — a background tab, or motion turned off. */
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={0}
            opacity={focus == null || focus === i ? 1 : 0.28}
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
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6 text-center">
        {shown ? (
          <>
            <div className="num text-4xl font-semibold text-text-primary">
              {shown.points}
              <span className="text-xl text-text-tertiary">/{shown.max}</span>
            </div>
            <div className="eyebrow mt-1.5">{shown.factor}</div>
          </>
        ) : (
          <>
            <div className="num text-figure font-semibold text-text-primary">{score ?? '—'}</div>
            {label && <div className={`serif mt-0.5 text-lg ${tone.text}`}>{label}</div>}
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
    <div className="space-y-3.5">
      {items.map((b) => (
        <div key={b.factor}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
              {b.factor} <InfoTip term={b.factor} />
            </span>
            <span className="num text-xs text-text-secondary">
              <span className="text-text-primary">{b.points}</span>/{b.max}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[.07]">
            <div
              className={`h-full rounded-full ${barTone(b.points, b.max)} transition-[width] duration-700 ease-spring`}
              style={{ width: `${b.max ? (b.points / b.max) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs leading-relaxed text-text-secondary">{b.reason}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── trade math ─────────────────────────── */

/**
 * Risk and reward drawn to scale.
 *
 * The bar runs stop → target, and the colour boundary is the current price.
 * So the red length *is* what you'd lose and the green length *is* what you'd
 * make — the ratio you'd otherwise have to read off a number is just the
 * comparison of two lengths.
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
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow">Risk</span>
          <span className="eyebrow">Reward</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[.07]">
          <div className="bg-bear/60 transition-[width] duration-700 ease-spring" style={{ width: `${riskPct}%` }} />
          <div className="bg-bull/60 transition-[width] duration-700 ease-spring" style={{ width: `${100 - riskPct}%` }} />
        </div>

        <div className="mt-2.5 flex items-start justify-between gap-2 text-center">
          <div className="text-left">
            <div className="num text-sm font-medium text-text-primary">{sym}{stop}</div>
            <div className="num text-xs text-bear">−{downside_pct}%</div>
            <div className="eyebrow mt-0.5 flex items-center gap-1">Stop <InfoTip term="stop" /></div>
          </div>
          <div>
            <div className="num text-sm font-medium text-text-primary">{sym}{entry}</div>
            <div className="text-xs text-text-tertiary">now</div>
            <div className="eyebrow mt-0.5 flex items-center justify-center gap-1">Entry <InfoTip term="entry" /></div>
          </div>
          <div className="text-right">
            <div className="num text-sm font-medium text-text-primary">{sym}{target}</div>
            <div className="num text-xs text-bull">+{upside_pct}%</div>
            <div className="eyebrow mt-0.5 flex items-center justify-end gap-1">Target <InfoTip term="target" /></div>
          </div>
        </div>
      </div>

      <dl className="space-y-2 border-t rule pt-3 text-sm">
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
            <dd className="num text-text-primary">±{expected_monthly_move_pct}%</dd>
          </div>
        )}
      </dl>

      <p className="text-xs leading-relaxed text-text-tertiary">
        Target is {metrics.target_basis}; stop is {metrics.stop_basis}. A scenario drawn from price
        history and volatility — not a forecast.
      </p>
    </div>
  );
}
