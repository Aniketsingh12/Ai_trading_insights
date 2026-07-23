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
          <Toaster position="top-right" toastOptions={{ style: { background: '#12121a', color: '#f1f5f9' } }} />
        </BeginnerProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
