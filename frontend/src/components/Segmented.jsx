/**
 * Segmented control — a track with one capsule that slides between options.
 *
 * The capsule moves rather than fading in and out, so the control reads as one
 * switch with a position instead of a row of independent buttons.
 */
export default function Segmented({ options, value, onChange, className = '' }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));

  return (
    <div
      role="tablist"
      className={`relative flex rounded-ctl p-0.5 ${className}`}
      style={{ backgroundColor: 'rgba(255,255,255,.05)' }}
    >
      {/* The capsule lives in its own padded box so the percentage maths is exact. */}
      <div className="pointer-events-none absolute inset-0.5">
        <div
          className="h-full bg-white/[.09] transition-transform duration-300 ease-spring"
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
            className={`relative z-10 flex-1 whitespace-nowrap px-3 py-1 text-[12px]
                        transition-colors duration-200 ${
                          active ? 'font-medium text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                        }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
