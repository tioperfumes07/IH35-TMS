import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";

type Props = {
  error?: unknown;
  onRetry: () => void;
};

/** Placeholder until P6-T11201 scheduled-reports backend ships. */
export function ScheduledReportsBackendPendingBanner({ error, onRetry }: Props) {
  const status = error instanceof ApiError ? error.status : null;
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm" data-testid="scheduled-reports-backend-pending">
      <p className="font-semibold text-amber-900">Backend not ready — file P6-T11201 backend ticket</p>
      <p className="mt-1 text-amber-800">
        Scheduled report CRUD requires the future `/api/v1/scheduled-reports` service.{status ? ` Last error: HTTP ${status}.` : ""}
      </p>
      <Button className="mt-3" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
