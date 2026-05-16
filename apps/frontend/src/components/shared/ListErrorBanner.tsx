import { Button } from "../Button";

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function ListErrorBanner({ message = "Failed to load. Try refreshing.", onRetry }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{message}</span>
      {onRetry ? (
        <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
          Refresh
        </Button>
      ) : null}
    </div>
  );
}
