import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import "./index.css";
import i18n from "./i18n";

void i18n;

// GO-LIVE #15 (429): without defaults, every component mount + window-focus refetched, so the same
// provider GETs (sync-health, qbo, preferences, notifications, identity/me) fired many times per load
// and overran the edge per-IP rate limit — a following status-change WRITE then tipped to 429. Sane
// defaults (cache + dedupe identical keys, no refetch-on-focus) cut the volume so writes stay under it.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
