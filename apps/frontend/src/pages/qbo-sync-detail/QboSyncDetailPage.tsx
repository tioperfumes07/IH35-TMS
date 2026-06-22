import { Fragment, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  listQboSyncEventLog,
  type QboSyncEventKind,
  type QboSyncEventLogRecord,
  type QboSyncEventSeverity,
} from "../../api/qbo-integration";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";

const KIND_OPTIONS: Array<{ value: "all" | QboSyncEventKind; label: string }> = [
  { value: "all", label: "All kinds" },
  { value: "run", label: "Runs" },
  { value: "alert", label: "Alerts" },
  { value: "outbox", label: "Outbox" },
];

const SEVERITY_OPTIONS: Array<{ value: "all" | QboSyncEventSeverity; label: string }> = [
  { value: "all", label: "All severities" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

function kindPillClass(kind: QboSyncEventKind) {
  if (kind === "run") return "border-slate-300 bg-slate-100 text-slate-700";
  if (kind === "alert") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function severityPillClass(severity: QboSyncEventSeverity) {
  if (severity === "error") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function QboSyncDetailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [kind, setKind] = useState<"all" | QboSyncEventKind>("all");
  const [severity, setSeverity] = useState<"all" | QboSyncEventSeverity>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());

  const eventLogQuery = useInfiniteQuery({
    queryKey: ["qbo-sync-event-log", companyId, kind, severity],
    queryFn: ({ pageParam }) =>
      listQboSyncEventLog({
        operating_company_id: companyId,
        limit: 50,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        kind: kind === "all" ? undefined : kind,
        severity: severity === "all" ? undefined : severity,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(companyId),
    retry: false,
  });

  const events = useMemo(
    () => eventLogQuery.data?.pages.flatMap((page) => page.events ?? []) ?? [],
    [eventLogQuery.data?.pages],
  );
  const totalEstimated = eventLogQuery.data?.pages[0]?.total_estimated ?? 0;

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="QBO Sync Event Log" subtitle="Read-only tenant-scoped observability across runs, alerts, and outbox events" />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {eventLogQuery.isError ? <ReportBlockVPendingBanner error={eventLogQuery.error} onRetry={() => void eventLogQuery.refetch()} /> : null}

      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Filter by kind</div>
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                kind === opt.value ? "border-slate-300 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setKind(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600">Filter by severity</div>
        <div className="flex flex-wrap gap-2">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                severity === opt.value
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setSeverity(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
          Showing {events.length} of about {totalEstimated} events
        </div>

        {eventLogQuery.isLoading ? <div className="p-3 text-sm text-slate-500">Loading QBO sync events…</div> : null}
        {!eventLogQuery.isLoading && events.length === 0 ? (
          <div className="p-3 text-sm text-slate-500">No QBO sync events match the selected filters.</div>
        ) : null}

        {events.length > 0 ? (
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row: QboSyncEventLogRecord) => (
                <Fragment key={row.id}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() =>
                      setExpandedRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatTimestamp(row.occurred_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${kindPillClass(row.kind)}`}>{row.kind}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${severityPillClass(row.severity)}`}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-800">{row.summary}</td>
                  </tr>
                  {expandedRows.has(row.id) ? (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={4} className="px-3 py-2">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Detail</div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                          {JSON.stringify(row.detail ?? {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : null}

        {eventLogQuery.hasNextPage ? (
          <div className="border-t border-slate-200 px-3 py-2">
            <Button onClick={() => void eventLogQuery.fetchNextPage()} loading={eventLogQuery.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
