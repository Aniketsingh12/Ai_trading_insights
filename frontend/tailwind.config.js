/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Graphite ladder ──────────────────────────────────────────
        // Depth is expressed as lightness, not as borders.
        bg: '#0a0a0c',
        surface: '#121215',
        elevated: '#18181c',
        raised: '#212127',
        border: '#232329',

        // The accent is light — no brand hue competes with the data.
        primary: '#f2f2f5',

        // Data colour — the only chroma in the app.
        bull: '#30d158',
        bear: '#ff453a',
        warn: '#ffd426',

        // Three steps, all clearing WCAG AA on the card surface.
        text: {
          primary: '#f2f2f5',   // 16.6:1
          secondary: '#a1a1a9', // 7.2:1
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
        micro: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.1em' }],
        // Restrained display sizes. These are capped low on purpose: a page
        // title is a label, not a billboard, and the data is the loud part.
        display: ['clamp(1.125rem, 1rem + 0.5vw, 1.375rem)', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        figure: ['clamp(1.5rem, 1.25rem + 1vw, 2rem)', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        card: '0.625rem',
        ctl: '0.5rem',
        pill: '980px',
      },
      boxShadow: {
        depth: 'inset 0 1px 0 rgba(255,255,255,.04)',
        lift: 'inset 0 1px 0 rgba(255,255,255,.07), 0 8px 24px -10px rgba(0,0,0,.85)',
        pop: '0 18px 48px -14px rgba(0,0,0,.92), 0 0 0 1px rgba(255,255,255,.07)',
        well: 'inset 0 1px 2px rgba(0,0,0,.4)',
      },
      transitionTimingFunction: {
        // Fast out of the gate, long settle, no overshoot.
        spring: 'cubic-bezier(.32,.72,0,1)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        rise: 'rise .4s cubic-bezier(.32,.72,0,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
