import { Component, type ErrorInfo, type ReactNode } from "react";
import { PwaButton } from "./PwaButton";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PWA ErrorBoundary caught component error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-hos-violation/40 bg-hos-violation/10 p-3 text-sm text-pwa-text-primary">
          <p>Documents temporarily unavailable. Please refresh.</p>
          <div className="mt-2">
            <PwaButton
              type="button"
              variant="secondary"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              Retry
            </PwaButton>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
