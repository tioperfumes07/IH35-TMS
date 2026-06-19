import { Component, type ReactNode, type ErrorInfo } from "react";
import { postClientError } from "../api/client-errors";

// Inline, section-scoped error boundary. Unlike the app-level ErrorBoundary (full-screen "Something went
// wrong"), this contains a render error to ONE section so the rest of the page still works, and shows the
// real message inline so the failing section + cause is visible (not swallowed). Also posts to
// /admin/client-errors (audit.web.client_error) like the global one, so the stack is recoverable server-side.
type Props = { name: string; children: ReactNode };
type State = { error: Error | null };

export class SectionErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void postClientError({
      message: `[section:${this.props.name}] ${error.message}`,
      stack: error.stack,
      component_stack: info.componentStack ?? undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
        <div className="font-semibold">This section ({this.props.name}) hit an error and was skipped.</div>
        <div className="mt-1 break-words text-xs text-red-600">{error.message}</div>
        <button
          type="button"
          className="mt-2 rounded border border-red-300 px-2 py-1 text-xs font-medium hover:bg-red-100"
          onClick={() => this.setState({ error: null })}
        >
          Retry section
        </button>
      </div>
    );
  }
}
