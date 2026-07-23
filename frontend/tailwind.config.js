/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        surface: '#12121a',
        border: '#1e1e2e',
        primary: '#6366f1',
        bull: '#22c55e',
        bear: '#ef4444',
        warn: '#eab308',
        text: { primary: '#f1f5f9', secondary: '#94a3b8' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
