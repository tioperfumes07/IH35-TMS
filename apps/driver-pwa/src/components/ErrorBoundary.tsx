import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
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
