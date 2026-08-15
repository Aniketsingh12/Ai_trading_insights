import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { BeginnerProvider } from './lib/beginner.jsx';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 15_000 } },
});

// Register the PWA service worker (production only; avoids dev caching headaches).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <BeginnerProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgba(36,36,43,.92)',
                backdropFilter: 'blur(24px) saturate(180%)',
                color: '#f2f2f5',
                border: '1px solid rgba(255,255,255,.09)',
                borderRadius: '14px',
                fontSize: '14px',
                boxShadow: '0 24px 64px -16px rgba(0,0,0,.92)',
              },
              success: { iconTheme: { primary: '#30d158', secondary: '#0a0a0c' } },
              error: { iconTheme: { primary: '#ff453a', secondary: '#0a0a0c' } },
            }}
          />
        </BeginnerProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
