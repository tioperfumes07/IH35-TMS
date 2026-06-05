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

export async function initFrontendSentry(): Promise<void> {
  const dsn = readDsn();
  if (!dsn || initialized) return;
  const Sentry = await loadSentry();
  if (!Sentry) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    integrations: [],
  });
  initialized = true;
}

export async function captureReactError(error: unknown, componentStack?: string): Promise<void> {
  const Sentry = await loadSentry();
  if (!Sentry || !readDsn()) return;
  Sentry.addBreadcrumb({ category: "react", message: componentStack ?? "error_boundary" });
  Sentry.captureException(error);
}

export function sentryClientReady(): boolean {
  return initialized && Boolean(readDsn());
}
