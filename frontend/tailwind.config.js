/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Graphite ladder ──────────────────────────────────────────
        // Depth is expressed as lightness, not as borders. Each step up the
        // ladder is a surface nearer the light; hairlines only separate
        // things the ladder can't.
        bg: '#0a0a0c',        // the ground
        surface: '#131316',   // page chrome, sidebar, floating material
        elevated: '#1a1a1f',  // a raised card
        raised: '#24242b',    // the top of the stack — chips, thumbs, tracks
        border: '#26262d',

        // ── The accent is light ──────────────────────────────────────
        // No brand hue. Emphasis is bone-on-graphite, so the only colour
        // left in the interface is the market's own.
        primary: '#f2f2f5',

        // ── Data colour — the only chroma in the app ─────────────────
        // Tuned for dark backgrounds (Tailwind's greens/reds go muddy on
        // near-black), so a +0.4% and a −0.4% read at equal weight.
        bull: '#30d158',
        bear: '#ff453a',
        warn: '#ffd426',

        // Three steps, and all three clear WCAG AA on the card surface — the
        // quietest one still carries section labels and captions, so it can be
        // recessive without being unreadable.
        text: {
          primary: '#f2f2f5',   // 16.6:1
          secondary: '#a1a1a9', // 7.6:1
          tertiary: '#7e7e86',  // 4.6:1
        },
      },
      fontFamily: {
        sans: ['Instrument Sans', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Engraved bezel markings — small, wide-tracked, never bold.
        micro: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.12em' }],
        // Display sizes tighten as they grow, the way optical sizing works.
        display: ['clamp(2rem, 1.4rem + 2.4vw, 3rem)', { lineHeight: '1.04', letterSpacing: '-0.033em' }],
        figure: ['clamp(2.25rem, 1.5rem + 3vw, 3.75rem)', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        // Generous, continuous-feeling corners. Controls sit one step
        // tighter than the cards that contain them.
        card: '1.125rem',
        ctl: '0.75rem',
        pill: '980px',
      },
      boxShadow: {
        // Resting cards barely cast — they're lit from above by an inset
        // hairline instead. Only things that genuinely float get a shadow.
        depth: 'inset 0 1px 0 rgba(255,255,255,.055), 0 1px 2px rgba(0,0,0,.5)',
        lift: 'inset 0 1px 0 rgba(255,255,255,.09), 0 12px 32px -12px rgba(0,0,0,.9)',
        pop: '0 24px 64px -16px rgba(0,0,0,.92), 0 0 0 1px rgba(255,255,255,.07)',
        well: 'inset 0 1px 3px rgba(0,0,0,.5)',
      },
      transitionTimingFunction: {
        // The spring curve Apple uses for sheets and segmented controls:
        // fast out of the gate, long settle, no overshoot.
        spring: 'cubic-bezier(.32,.72,0,1)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        rise: 'rise .5s cubic-bezier(.32,.72,0,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
