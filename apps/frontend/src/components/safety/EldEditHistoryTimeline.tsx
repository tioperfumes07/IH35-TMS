import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { formatDateUS, formatDateTimeUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";

export type EldEditHistoryEntry = {
  id: string;
  edited_at: string;
  edited_by: string;
  reason: string;
  field_name: string;
  before_state: string | null;
  after_state: string | null;
};

type EldRecentHistoryResponse = {
  driver_uuid: string;
  driver_name: string | null;
  from: string;
  to: string;
  edits: EldEditHistoryEntry[];
  read_only: true;
};

function formatTimestamp(value: string) {
  // Central Time (CLAUDE.md §8 "Central Time always") — never the reviewing user's browser zone.
  const formatted = formatDateTimeUS(value);
  return formatted ? `${formatted} CT` : value;
}

type EldEditHistoryTimelineProps = {
  driverUuid: string;
  operatingCompanyId: string;
  compact?: boolean;
  // Controlled mode: when `edits` is provided, render it directly instead of self-fetching the
  // hardcoded last-30-days "/recent" endpoint. Without this, a caller with its own date-range-scoped
  // query (e.g. EldAuditTrailViewer's From/To pickers) mounted this component and it silently
  // ignored the selected range, always showing the last 30 days regardless of what was picked —
  // and disagreeing with the range-scoped PDF export built from the same page's query. Passing
  // `edits`/`from`/`to`/`isLoading` keeps the on-screen timeline and the export in sync.
  edits?: EldEditHistoryEntry[];
  from?: string;
  to?: string;
  isLoading?: boolean;
};

export function EldEditHistoryTimeline({
  driverUuid,
  operatingCompanyId,
  compact = false,
  edits: controlledEdits,
  from: controlledFrom,
  to: controlledTo,
  isLoading: controlledIsLoading,
}: EldEditHistoryTimelineProps) {
  const isControlled = controlledEdits !== undefined;
  const historyQuery = useQuery({
    queryKey: ["safety", "eld-audit-trail", "recent", operatingCompanyId, driverUuid],
    enabled: !isControlled && Boolean(driverUuid && operatingCompanyId),
    queryFn: () =>
      apiRequest<EldRecentHistoryResponse>(
        `/api/safety/eld/audit-trail/driver/${encodeURIComponent(driverUuid)}/recent?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  const edits = isControlled ? controlledEdits! : historyQuery.data?.edits ?? [];
  const isLoading = isControlled ? Boolean(controlledIsLoading) : historyQuery.isLoading;
  const from = isControlled ? controlledFrom : historyQuery.data?.from;
  const to = isControlled ? controlledTo : historyQuery.data?.to;

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading ELD edit history…</p>;
  }

  if (!isControlled && historyQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load ELD edit history"
        status={0}
        message={(historyQuery.error as Error)?.message}
        onRetry={() => void historyQuery.refetch()}
      />
    );
  }

  if (edits.length === 0) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        No mirrored Samsara HOS log edits found for this driver {isControlled ? "in the selected date range" : "in the last 30 days"}.
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <p className="text-xs text-gray-600">
          Read-only audit trail from mirrored Samsara HOS log edits ({formatDateUS(from)} to {formatDateUS(to)}).
        </p>
      ) : null}
      <ol className="space-y-2 border-l-2 border-slate-300 pl-4">
        {edits.map((edit) => (
          <li key={edit.id} className="relative rounded-sm border border-gray-200 bg-white p-3 text-sm">
            <span className="absolute left-[-1.15rem] top-4 h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">{edit.field_name}</span>
              <span className="text-xs text-gray-500">{formatTimestamp(edit.edited_at)}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Edited by {edit.edited_by} · Reason: {edit.reason}
            </div>
            <div className="mt-2 grid gap-1 text-xs md:grid-cols-2">
              <div className="rounded-sm bg-slate-50 px-2 py-1 text-slate-500">
                <span className="font-semibold">Before:</span>{" "}
                <span className="line-through">{edit.before_state ?? "—"}</span>
              </div>
              <div className="rounded-sm bg-slate-50 px-2 py-1 text-slate-900">
                <span className="font-semibold">After:</span> <span className="font-medium">{edit.after_state ?? "—"}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
