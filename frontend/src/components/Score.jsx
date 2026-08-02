import InfoTip from './InfoTip';

const VERDICT_STYLES = {
  'STRONG BUY': 'bg-bull/25 text-bull',
  BUY: 'bg-bull/20 text-bull',
  HOLD: 'bg-warn/20 text-warn',
  SELL: 'bg-bear/20 text-bear',
  'STRONG SELL': 'bg-bear/25 text-bear',
};

export function ScoreBadge({ label, score }) {
  const cls = VERDICT_STYLES[label] || 'bg-border text-text-secondary';
  return (
    <span className={`px-2.5 py-1 rounded-md text-sm font-bold ${cls}`}>
      {label}
      {score != null && <span className="num font-semibold opacity-80 ml-1.5">{score}</span>}
    </span>
  );
}

// Color the score bar by where the points landed vs the max.
function barColor(points, max) {
  const r = max ? points / max : 0;
  if (r >= 0.75) return 'bg-bull';
  if (r >= 0.45) return 'bg-warn';
  return 'bg-bear';
}

export function Breakdown({ items }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2.5">
      {items.map((b) => (
        <div key={b.factor}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-text-primary flex items-center gap-1">
              {b.factor} <InfoTip term={b.factor} />
            </span>
            <span className="num text-text-secondary text-xs">
              {b.points}/{b.max}
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor(b.points, b.max)}`}
              style={{ width: `${b.max ? (b.points / b.max) * 100 : 0}%` }}
            />
          </div>
          <div className="text-xs text-text-secondary mt-1">{b.reason}</div>
        </div>
      ))}
    </div>
  );
}

export function RiskReward({ metrics, sym = '' }) {
  if (!metrics || metrics.error) return null;
  const { entry, target, stop, upside_pct, downside_pct, risk_reward, expected_monthly_move_pct } = metrics;
  const rrGood = risk_reward != null && risk_reward >= 2;
  const rrOk = risk_reward != null && risk_reward >= 1;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Cell label="Stop" term="stop" value={`${sym}${stop}`} sub={`-${downside_pct}%`} tone="bear" />
        <Cell label="Entry" term="entry" value={`${sym}${entry}`} />
        <Cell label="Target" term="target" value={`${sym}${target}`} sub={`+${upside_pct}%`} tone="bull" />
      </div>
      <div className="flex items-center justify-between text-sm border-t border-border pt-3">
        <span className="text-text-secondary flex items-center gap-1">Risk / Reward <InfoTip term="risk_reward" /></span>
        <span className={`num font-bold ${rrGood ? 'text-bull' : rrOk ? 'text-warn' : 'text-bear'}`}>
          {risk_reward != null ? `${risk_reward} : 1` : '—'}
        </span>
      </div>
      {expected_monthly_move_pct != null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary flex items-center gap-1">Expected monthly move <InfoTip term="expected_move" /></span>
          <span className="num text-text-primary">±{expected_monthly_move_pct}%</span>
        </div>
      )}
      <p className="text-xs text-text-secondary leading-relaxed">
        Target = {metrics.target_basis}. Stop = {metrics.stop_basis}. Scenario based on
        price history &amp; volatility — not a guarantee.
      </p>
    </div>
  );
}

function Cell({ label, value, sub, tone, term }) {
  const toneCls = tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-text-primary';
  return (
    <div className="panel py-2">
      <div className="text-xs text-text-secondary flex items-center justify-center gap-1">
        {label} {term && <InfoTip term={term} />}
      </div>
      <div className="num font-semibold text-text-primary">{value}</div>
      {sub && <div className={`num text-xs ${toneCls}`}>{sub}</div>}
    </div>
  );
}
