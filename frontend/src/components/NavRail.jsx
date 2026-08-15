import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Primary navigation — one horizontal rail with a single indicator that slides
 * between items rather than each item lighting up independently.
 *
 * The indicator is measured, not guessed: on every route change it reads the
 * active link's real box and animates a pill to that exact offset and width.
 * That means it stays correct when labels change length, when the webfont swaps
 * in and reflows the text, and at any viewport width — none of which a
 * fixed-width or percentage-based indicator survives.
 */
export default function NavRail({ items, isActive }) {
  const loc = useLocation();
  const railRef = useRef(null);
  const [pill, setPill] = useState({ x: 0, w: 0, shown: false });

  const measure = useCallback(() => {
    const rail = railRef.current;
    const active = rail?.querySelector('[data-active="true"]');
    if (!rail || !active) {
      setPill((p) => ({ ...p, shown: false }));
      return;
    }
    const railBox = rail.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    setPill({
      // scrollLeft matters on mobile, where the rail scrolls horizontally.
      x: box.left - railBox.left + rail.scrollLeft,
      w: box.width,
      shown: true,
    });
  }, []);

  useLayoutEffect(() => { measure(); }, [loc.pathname, measure]);

  useEffect(() => {
    // The webfont swapping in reflows the labels after first paint.
    document.fonts?.ready.then(measure).catch(() => {});

    const ro = new ResizeObserver(measure);
    if (railRef.current) ro.observe(railRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  // Keep the active item in view when the rail scrolls on a narrow screen.
  useEffect(() => {
    railRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [loc.pathname]);

  return (
    <div ref={railRef} className="no-bar relative -mx-1 flex overflow-x-auto px-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1 rounded-ctl bg-white/[.07]"
        style={{
          transform: `translateX(${pill.x}px)`,
          width: pill.w,
          opacity: pill.shown ? 1 : 0,
          transition: 'transform .38s cubic-bezier(.32,.72,0,1), width .38s cubic-bezier(.32,.72,0,1), opacity .2s',
        }}
      />
      {items.map(({ to, label, icon: Icon }) => {
        const active = isActive(loc.pathname, to);
        return (
          <Link
            key={to}
            to={to}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className={`relative z-10 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctl px-3 py-1.5
                        text-[13px] transition-colors duration-200 ${
                          active ? 'font-medium text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                        }`}
          >
            <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
