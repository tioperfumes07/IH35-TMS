import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type EldEditHistoryTimelineProps = {
  driverUuid: string;
  operatingCompanyId: string;
  compact?: boolean;
};

export function EldEditHistoryTimeline({ driverUuid, operatingCompanyId, compact = false }: EldEditHistoryTimelineProps) {
  const historyQuery = useQuery({
    queryKey: ["safety", "eld-audit-trail", "recent", operatingCompanyId, driverUuid],
    enabled: Boolean(driverUuid && operatingCompanyId),
    queryFn: () =>
      apiRequest<EldRecentHistoryResponse>(
        `/api/safety/eld/audit-trail/driver/${encodeURIComponent(driverUuid)}/recent?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  const edits = historyQuery.data?.edits ?? [];

  if (historyQuery.isLoading) {
    return <p className="text-sm text-gray-500">Loading ELD edit history…</p>;
  }

  if (edits.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        No mirrored Samsara HOS log edits found for this driver in the last 30 days.
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <p className="text-xs text-gray-600">
          Read-only audit trail from mirrored Samsara HOS log edits ({historyQuery.data?.from} to {historyQuery.data?.to}).
        </p>
      ) : null}
      <ol className="space-y-2 border-l-2 border-blue-200 pl-4">
        {edits.map((edit) => (
          <li key={edit.id} className="relative rounded border border-gray-200 bg-white p-3 text-sm">
            <span className="absolute -left-[1.15rem] top-4 h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">{edit.field_name}</span>
              <span className="text-xs text-gray-500">{formatTimestamp(edit.edited_at)}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Edited by {edit.edited_by} · Reason: {edit.reason}
            </div>
            <div className="mt-2 grid gap-1 text-xs md:grid-cols-2">
              <div className="rounded bg-red-50 px-2 py-1 text-red-800">
                <span className="font-semibold">Before:</span> {edit.before_state ?? "—"}
              </div>
              <div className="rounded bg-green-50 px-2 py-1 text-green-800">
                <span className="font-semibold">After:</span> {edit.after_state ?? "—"}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
