/**
 * A signed percentage. The one place chroma is allowed to enter the interface,
 * so it always means the same thing wherever it appears.
 *
 * `bare` drops the pill for use inside dense table cells, where a row of
 * filled chips would out-shout the prices they belong to.
 */
export default function Delta({ pct, bare = false, className = '' }) {
  if (pct == null) return <span className="text-text-tertiary">—</span>;

  const up = pct >= 0;
  const text = `${up ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`;

  if (bare) {
    return (
      <span className={`num font-medium ${up ? 'text-bull' : 'text-bear'} ${className}`}>{text}</span>
    );
  }
  return <span className={`delta ${up ? 'delta-up' : 'delta-down'} ${className}`}>{text}</span>;
}
