/**
 * The masthead every page opens with.
 *
 * Eyebrow → title → lede is a fixed three-step descent in size, weight and
 * colour, so the same shape appears at the top of all six pages and you know
 * where you are before reading a word.
 */
export default function PageHeader({ eyebrow, title, lede, children }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="display">{title}</h1>
        {lede && <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-text-tertiary">{lede}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
