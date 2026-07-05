type SentryLike = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (error: unknown) => void;
  addBreadcrumb: (crumb: Record<string, unknown>) => void;
};

let initialized = false;

function readDsn(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_SENTRY_DSN?.trim() || "";
}

async function loadSentry(): Promise<SentryLike | null> {
  try {
    const mod = await import("@sentry/react");
    return mod as unknown as SentryLike;
  } catch {
    return null;
  }
}

export async function initDriverPwaSentry(): Promise<void> {
  const dsn = readDsn();
  if (!dsn || initialized) return;
  const Sentry = await loadSentry();
  if (!Sentry) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.05,
  });
  initialized = true;
}

export async function capturePwaError(error: unknown, context?: string): Promise<void> {
  const Sentry = await loadSentry();
  if (!Sentry || !readDsn()) return;
  Sentry.addBreadcrumb({ category: "driver-pwa", message: context ?? "unhandled" });
  Sentry.captureException(error);
}

export function sentryPwaReady(): boolean {
  return initialized && Boolean(readDsn());
}

let globalHandlersRegistered = false;

/**
 * G10-C3: route uncaught driver-PWA errors and unhandled promise rejections into Sentry so a bad-signal crash
 * on a driver's phone actually reports somewhere instead of dying silently. Both paths funnel through
 * capturePwaError, which dynamic-imports the Sentry SDK and no-ops when it is unavailable or VITE_SENTRY_DSN is
 * unset — so this adds NO new runtime dependency and is inert in local/dev. Idempotent + SSR-safe.
 */
export function registerPwaGlobalErrorHandlers(): void {
  if (globalHandlersRegistered || typeof window === "undefined") return;
  globalHandlersRegistered = true;
  window.addEventListener("error", (event) => {
    void capturePwaError(event.error ?? event.message, "window.error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    void capturePwaError(event.reason, "unhandledrejection");
  });
}
