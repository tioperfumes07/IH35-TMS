import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

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
    console.error("ErrorBoundary caught component error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Documents temporarily unavailable. Please refresh.</p>
          <div className="mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
