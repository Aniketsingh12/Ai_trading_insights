/**
 * The masthead every page opens with.
 *
 * Eyebrow → title → lede is a fixed three-step descent in size, weight and
 * colour, so the same shape appears at the top of all six pages and you always
 * know where you are before reading a word.
 */
export default function PageHeader({ eyebrow, title, lede, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-text-primary">{title}</h1>
        {lede && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{lede}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
