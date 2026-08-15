/**
 * Segmented control — a track with one capsule that slides between options.
 *
 * The capsule moves rather than fading in/out, so the control reads as one
 * physical switch with a position instead of a row of independent buttons.
 */
export default function Segmented({ options, value, onChange, className = '', size = 'md' }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const pad = size === 'sm' ? 'px-3 py-1' : 'px-4 py-1.5';

  return (
    <div
      role="tablist"
      className={`relative flex rounded-pill p-1 ${className}`}
      style={{ backgroundColor: 'rgba(255,255,255,.06)' }}
    >
      {/* The capsule lives in its own padded box so the percentage maths is exact. */}
      <div className="pointer-events-none absolute inset-1">
        <div
          className="h-full rounded-pill bg-raised shadow-depth transition-transform duration-300 ease-spring"
          style={{ width: `${100 / options.length}%`, transform: `translateX(${idx * 100}%)` }}
        />
      </div>

      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`relative z-10 flex-1 whitespace-nowrap rounded-pill ${pad} text-sm font-medium
                        transition-colors duration-200 ${
                          active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                        }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
