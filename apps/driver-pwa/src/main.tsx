import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/Toast";
import { initDriverPwaSentry } from "./observability/sentry-pwa";
import "./i18n";
import "./index.css";

// G10-C3: actually initialize Sentry (the init fn existed but was never called). No-ops when
// VITE_SENTRY_DSN is unset, so local/dev is unaffected.
void initDriverPwaSentry();

const queryClient = new QueryClient();
document.documentElement.style.backgroundColor = "#0F1219";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
