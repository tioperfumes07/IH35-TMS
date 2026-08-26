import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { listAuditEvents, type AuditEventListItem } from "../../api/audit";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

interface UserActivityTabProps {
  operatingCompanyId: string;
  userId: string;
}

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "dispatch", label: "Dispatch" },
  { value: "maint", label: "Maintenance" },
  { value: "accounting", label: "Accounting" },
  { value: "banking", label: "Banking" },
  { value: "safety", label: "Safety" },
  { value: "driver", label: "Driver Hub" },
];

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type EventWithPayload = AuditEventListItem & {
  payload?: { changes?: Record<string, { old: unknown; new: unknown }>; reason?: string };
};

function ChangesDiff({ changes }: { changes?: Record<string, { old: unknown; new: unknown }> }) {
  if (!changes || Object.keys(changes).length === 0) {
    return <span className="text-gray-500 italic">No field changes recorded</span>;
  }

  return (
    <div className="space-y-1">
      {Object.entries(changes).map(([field, vals]) => (
        <div key={field} className="grid grid-cols-3 gap-2 text-xs">
          <span className="font-medium text-gray-700">{field}</span>
          <span className="text-red-600 line-through">{String(vals.old ?? "—")}</span>
          <span className="text-slate-700">{String(vals.new ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}

function payloadDetail(event: EventWithPayload) {
  return (
    <div className="text-xs">
      <div className="font-medium text-gray-700 mb-2">Before → After</div>
      <ChangesDiff changes={event.payload?.changes} />
      {event.payload?.reason ? (
        <div className="mt-2 text-gray-600">
          <span className="font-medium">Reason:</span> {event.payload.reason}
        </div>
      ) : null}
    </div>
  );
}

/** 0441-mod11 — User detail Activity tab wired to audit.audit_events via /api/v1/audit/events-list. */
export function UserActivityTab({ operatingCompanyId, userId }: UserActivityTabProps) {
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [voidsOnly, setVoidsOnly] = useState(false);

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined;

  const auditQuery = useQuery({
    queryKey: [
      "user-activity-audit",
      userId,
      operatingCompanyId,
      eventTypeFilter,
      fromIso,
      toIso,
      sourceFilter,
      voidsOnly,
    ],
    queryFn: () =>
      listAuditEvents({
        operatingCompanyId,
        actor: userId,
        eventType: eventTypeFilter.trim() ? [eventTypeFilter.trim()] : undefined,
        source: sourceFilter.trim() ? [sourceFilter.trim()] : undefined,
        voidsOnly,
        from: fromIso,
        to: toIso,
        limit: 200,
      }),
    enabled: Boolean(userId) && Boolean(operatingCompanyId),
  });

  const events = useMemo(
    () => (auditQuery.isError ? [] : auditQuery.data?.events ?? []),
    [auditQuery.data, auditQuery.isError],
  );

  const exportCSV = () => {
    if (!events.length) return;
    const rows = events.map((e) => ({
      Date: e.created_at,
      Type: e.event_type,
      Summary: e.summary || "—",
      Source: e.source || "—",
    }));
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, string>)[h] ?? "")}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-${userId}-activity.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventTypeOptions = useMemo(() => {
    const unique = new Set(events.map((row) => row.event_type));
    return Array.from(unique).sort();
  }, [events]);

  const columns: Array<ParityColumn<AuditEventListItem>> = useMemo(
    () => [
      {
        key: "created_at",
        label: "When",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        render: (row) => <span className="whitespace-nowrap">{formatWhen(row.created_at)}</span>,
      },
      {
        key: "event_type",
        label: "Action",
        sortable: true,
        render: (row) => (
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
              row.severity === "error"
                ? "bg-red-100 text-red-700"
                : row.severity === "warn"
                  ? "bg-slate-100 text-slate-700"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {row.event_type}
          </span>
        ),
      },
      {
        key: "summary",
        label: "Summary",
        sortable: true,
        render: (row) => <span className="text-gray-600">{row.summary || "—"}</span>,
      },
      {
        key: "source",
        label: "Source",
        sortable: true,
        render: (row) => <span className="text-gray-500">{row.source || "—"}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4" data-testid="user-activity-tab">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-sm border">
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block"
            value={fromDate}
            onChange={(next) => setFromDate(next)}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block"
            value={toDate}
            onChange={(next) => setToDate(next)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Event type
          <select
            className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
          >
            <option value="">All</option>
            {eventTypeOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Source
          <select
            className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setVoidsOnly((v) => !v)}
          className={`text-xs px-2 py-1 rounded border flex items-center gap-1 mt-4 ${
            voidsOnly ? "bg-red-100 border-red-300 text-red-700" : "bg-white hover:bg-gray-100"
          }`}
        >
          <AlertTriangle size={12} />
          Voids & Reversals
        </button>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => void auditQuery.refetch()}>
          Refresh
        </Button>
        <Button size="sm" variant="secondary" onClick={exportCSV} disabled={!events.length}>
          <Download size={14} className="mr-1" />
          Export CSV
        </Button>
      </div>

      {auditQuery.isError ? (
        <ListErrorState
          title="Couldn't load user activity"
          status={0}
          message={(auditQuery.error as Error)?.message ?? "Unable to load user activity."}
          onRetry={() => void auditQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={events}
          columns={columns}
          rowKey={(row) => row.id}
          loading={auditQuery.isLoading}
          storageKey="user-activity-tab"
          emptyText="No audit activity found for this user."
          tableTestId="user-activity-table"
          rowTestId={(row) => `user-activity-row-${row.id}`}
          renderExpanded={(row) => payloadDetail(row as EventWithPayload)}
        />
      )}

      {auditQuery.data && auditQuery.data.total_count > 200 ? (
        <div className="text-xs text-gray-500">
          Showing {events.length} of {auditQuery.data.total_count} events. Refine filters to narrow results.
        </div>
      ) : null}
    </div>
  );
}
