import { Component, type ErrorInfo, type ReactNode } from "react";
import { postClientError } from "../api/client-errors";
import { captureReactError } from "../observability/sentry-client";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

function ErrorFallback({ error, onReload }: { error: Error; onReload: () => void }) {
  const subject = encodeURIComponent("IH35 Dispatch web app error");
  const body = encodeURIComponent(
    [
      `Please describe what you were doing:`,
      "",
      `URL: ${typeof window !== "undefined" ? window.location.href : ""}`,
      `Message: ${error.message}`,
    ].join("\n")
  );
  const mailto = `mailto:support@ih35dispatch.com?subject=${subject}&body=${body}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0F1219] px-4 py-10 text-[#F7F8FA]">
      <div className="w-full max-w-xl rounded-lg border border-white/10 bg-[#0F1219] p-6 shadow-xl">
        <h1 className="text-page-title font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-xs text-[#6B7280]">
          The page hit an unexpected error. You can reload to try again, or email support with the prefilled details below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-[#1F2A44] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F1729]"
            onClick={onReload}
          >
            Reload
          </button>
          <a
            href={mailto}
            className="rounded-md border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            Report issue
          </a>
        </div>
        <details className="mt-6 rounded-md border border-white/10 bg-black/30 p-3 text-xs text-[#E5E7EB]">
          <summary className="cursor-pointer select-none text-xs font-semibold text-white">Technical details</summary>
          <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap wrap-break-word text-xs text-[#E5E7EB]">
            {error.stack ?? error.message}
          </pre>
        </details>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void postClientError({
      message: error.message,
      stack: error.stack,
      component_stack: info.componentStack ?? undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
    // G10-C3: also report to Sentry (no-ops when VITE_SENTRY_DSN is unset).
    void captureReactError(error, info.componentStack ?? undefined);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback error={error} onReload={() => window.location.reload()} />;
  }
}
