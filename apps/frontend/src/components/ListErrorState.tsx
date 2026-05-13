import { AlertCircle } from "lucide-react";
import { Button } from "./Button";

type Props = {
  title?: string;
  status: number;
  message?: string;
  onRetry: () => void;
  className?: string;
};

export function ListErrorState({ title = "Couldn't load list", status, message, onRetry, className }: Props) {
  const detail =
    message && message.trim().length > 0
      ? `${status > 0 ? `HTTP ${status}` : "Error"}: ${message}`
      : status > 0
        ? `HTTP ${status}`
        : "Request failed";

  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-4 py-8 text-center sm:px-8 ${className ?? ""}`}>
      <AlertCircle className="h-8 w-8 shrink-0 text-amber-600" aria-hidden />
      <div className="space-y-1">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="max-w-md text-xs text-slate-600 break-words">{detail}</div>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
