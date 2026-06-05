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
