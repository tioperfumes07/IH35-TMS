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

// STALE-BUNDLE KILL SWITCH (office app). Symptom this fixes: the office UI kept showing an OLD build
// even after clearing browser cache in multiple browsers — the classic signature of a leftover service
// worker and/or Cache Storage entry pinning old hashed assets (browser "Clear cache" does NOT always
// evict SW caches). The office app intentionally registers NO service worker, so on every boot we
// proactively unregister any that exist and wipe Cache Storage so a stale SW can never serve old JS.
(function purgeStaleServiceWorkerCaches() {
  if (typeof navigator === "undefined") return;
  try {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistrations?.()
        .then((regs) => {
          for (const reg of regs) void reg.unregister();
        })
        .catch(() => undefined);
    }
    if (typeof caches !== "undefined") {
      void caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => undefined);
    }
  } catch {
    /* never block app boot on cleanup */
  }
})();

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
