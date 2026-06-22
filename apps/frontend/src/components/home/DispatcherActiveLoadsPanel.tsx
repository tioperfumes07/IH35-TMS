import { Link } from "react-router-dom";

export type DispatcherActiveLoadRow = {
  id: string;
  load_number: string;
  status: string;
  customer_name: string;
  pickup_city: string | null;
  delivery_city: string | null;
  is_late: boolean;
  detention_expected: boolean;
};

type DispatcherActiveLoadsPanelProps = {
  rows: DispatcherActiveLoadRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

function badgeClass(isLate: boolean, detentionExpected: boolean) {
  if (isLate) return "bg-red-100 text-red-800";
  if (detentionExpected) return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

function badgeLabel(isLate: boolean, detentionExpected: boolean) {
  if (isLate) return "Delayed";
  if (detentionExpected) return "Watch";
  return "On track";
}

export function DispatcherActiveLoadsPanel({ rows, isLoading, isError, onRetry }: DispatcherActiveLoadsPanelProps) {
  return (
    <section data-testid="dispatcher-active-loads-panel" className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Active loads</div>
      {isLoading ? (
        <div className="space-y-2 p-3">
          <div className="h-8 animate-pulse rounded bg-slate-100" />
          <div className="h-8 animate-pulse rounded bg-slate-100" />
          <div className="h-8 animate-pulse rounded bg-slate-100" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-red-700">
          <span>Failed to load active loads.</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-3 text-sm text-slate-500">No active loads assigned.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 font-mono text-xs text-slate-600">{row.load_number}</span>
              <span className="min-w-40 flex-1 truncate text-slate-900">{row.customer_name}</span>
              <span className="min-w-0 truncate text-xs text-slate-500">
                {row.pickup_city ?? "—"} to {row.delivery_city ?? "—"}
              </span>
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${badgeClass(row.is_late, row.detention_expected)}`}>
                {badgeLabel(row.is_late, row.detention_expected)}
              </span>
              <Link to={`/dispatch?load_id=${encodeURIComponent(row.id)}`} className="text-xs font-medium text-slate-700 hover:underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
