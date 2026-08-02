import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// run.ps1 / run.sh pick a free backend port and pass it via VITE_BACKEND_URL,
// so a port clash with another local project doesn't break the dev proxy.
// Default to 127.0.0.1 rather than localhost: Node 17+ resolves localhost to ::1
// first, but uvicorn binds IPv4-only, which makes the proxy hang.
const backend = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
