import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { capturePwaError } from "../observability/sentry-pwa";
import { PwaButton } from "./PwaButton";

type ErrorBoundaryProps = {
  children: ReactNode;
} & WithTranslation;

type ErrorBoundaryState = {
  hasError: boolean;
};

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PWA ErrorBoundary caught component error", error, info);
    // G10-C3: report to Sentry (no-ops when VITE_SENTRY_DSN is unset), not just console.
    void capturePwaError(error, info.componentStack ?? "error_boundary");
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-hos-violation/40 bg-hos-violation/10 p-3 text-sm text-pwa-text-primary">
          <p>{this.props.t("error_boundary.message")}</p>
          <div className="mt-2">
            <PwaButton
              type="button"
              variant="secondary"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              {this.props.t("common.retry")}
            </PwaButton>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
