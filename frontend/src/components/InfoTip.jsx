import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { GLOSSARY } from '../lib/glossary';

/**
 * Small ⓘ with a plain-English definition. Pass `term` (glossary key) or `text`.
 *
 * Tap-friendly: phones have no hover, so the tip toggles on click/focus as well.
 * It also flips its anchor near the screen edges — a centred tip on the rightmost
 * grid cell would otherwise render past the viewport on a 375px screen.
 */
export default function InfoTip({ term, text, className = '' }) {
  const content = text || GLOSSARY[term] || '';
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('center');
  const ref = useRef(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const { left } = ref.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    setAlign(left < vw * 0.3 ? 'left' : left > vw * 0.7 ? 'right' : 'center');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!content) return null;

  const anchor =
    align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span className={`relative inline-flex ${className}`} ref={ref}>
      <button
        type="button"
        aria-label={term ? `What is ${term}?` : 'More info'}
        aria-expanded={open}
        className="inline-flex items-center text-text-secondary hover:text-primary focus:text-primary focus:outline-none"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <Info size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute ${anchor} bottom-full mb-1.5 z-50
                     w-max max-w-[min(15rem,calc(100vw-2.5rem))]
                     bg-bg border border-border rounded-lg p-2 text-xs font-normal normal-case
                     text-text-primary leading-snug shadow-xl text-left`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
