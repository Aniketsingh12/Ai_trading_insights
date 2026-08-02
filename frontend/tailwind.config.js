/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#07070c',
        surface: '#101019',
        // Slightly lifted surface for nested panels — reads as "closer to the light".
        elevated: '#161624',
        border: '#232338',
        primary: '#6366f1',
        accent: '#22d3ee',
        bull: '#22c55e',
        bear: '#ef4444',
        warn: '#eab308',
        text: { primary: '#f1f5f9', secondary: '#94a3b8' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Multi-layer shadows: a tight contact shadow plus a wide ambient one is
        // what actually reads as physical depth (a single blur looks flat).
        depth: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px -8px rgba(0,0,0,.65)',
        lift: '0 2px 4px rgba(0,0,0,.4), 0 18px 40px -12px rgba(0,0,0,.8)',
        glow: '0 0 0 1px rgba(99,102,241,.35), 0 12px 32px -12px rgba(99,102,241,.55)',
        'glow-bull': '0 0 0 1px rgba(34,197,94,.35), 0 12px 32px -12px rgba(34,197,94,.5)',
        'glow-bear': '0 0 0 1px rgba(239,68,68,.35), 0 12px 32px -12px rgba(239,68,68,.5)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.06)',
      },
      backgroundImage: {
        'sheen': 'linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 40%)',
      },
      keyframes: {
        aurora: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(4%,-3%,0) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%,3%,0) scale(.95)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        aurora: 'aurora 24s ease-in-out infinite',
        rise: 'rise .35s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
