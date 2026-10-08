import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";

type Props = {
  error: unknown;
  onRetry: () => void;
};

export function ReportBlockTPendingBanner({ error, onRetry }: Props) {
  const status = error instanceof ApiError ? error.status : null;
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-xs" data-testid="report-block-t-pending">
      <p className="font-semibold text-[#0F1219]">Backend endpoint pending — Block T (P6-T11197) in flight</p>
      <p className="mt-1 text-[#0F1219]">
        This report API is not available yet or returned an error{status ? ` (HTTP ${status})` : ""}. After Block T deploys,
        refresh to load live data.
      </p>
      <Button className="mt-3" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
