import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState, useMemo } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { listAuditEvents, type AuditEventListItem } from "../../api/audit";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { formatQueryErrorDetail } from "../../lib/tableError";

interface EntityAuditHistoryTabProps {
  operatingCompanyId: string;
  entityType: string;
  entityId: string;
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

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
  { value: "overdue", label: "Overdue" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

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
          <span className="text-green-600">{String(vals.new ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}

type EventWithPayload = AuditEventListItem & {
  payload?: { changes?: Record<string, { old: unknown; new: unknown }>; reason?: string };
};

const COLUMNS: Array<ParityColumn<EventWithPayload>> = [
  {
    key: "created_at",
    label: "When",
    sortable: true,
    sortValue: (row) => new Date(row.created_at).getTime(),
    render: (row) => <span className="whitespace-nowrap">{formatWhen(row.created_at)}</span>,
  },
  {
    key: "actor_email",
    label: "Who",
    sortable: true,
    sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User"),
    render: (row) => <>{entityLabel(row.actor_email, row.actor_user_id, "User") || "—"}</>,
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
              ? "bg-yellow-100 text-yellow-700"
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
    sortValue: (row) => row.summary || "",
    render: (row) => <span className="text-gray-600">{row.summary || "—"}</span>,
  },
  {
    key: "source",
    label: "Source",
    sortable: true,
    sortValue: (row) => row.source || "",
    render: (row) => <span className="text-gray-500">{row.source || "—"}</span>,
  },
];

export function EntityAuditHistoryTab({ operatingCompanyId, entityType, entityId }: EntityAuditHistoryTabProps) {
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [voidsOnly, setVoidsOnly] = useState(false);

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined;

  const auditQuery = useQuery({
    queryKey: [
      "entity-audit-events",
      entityType,
      entityId,
      operatingCompanyId,
      eventTypeFilter,
      fromIso,
      toIso,
      actorFilter,
      statusFilter,
      sourceFilter,
      voidsOnly,
    ],
    queryFn: () =>
      listAuditEvents({
        operatingCompanyId,
        entityType,
        entityId,
        eventType: eventTypeFilter.trim() || undefined,
        actor: actorFilter.trim() || undefined,
        status: statusFilter.trim() || undefined,
        source: sourceFilter.trim() || undefined,
        voidsOnly,
        from: fromIso,
        to: toIso,
        limit: 200,
      }),
    enabled: Boolean(entityId) && Boolean(operatingCompanyId),
  });

  const events = useMemo(
    () => (auditQuery.data?.events ?? []) as EventWithPayload[],
    [auditQuery.data]
  );

  const exportCSV = () => {
    if (!events.length) return;
    const rows = events.map((e: AuditEventListItem) => ({
      Date: e.created_at,
      Actor: entityLabel(e.actor_email, e.actor_user_id, "User"),
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
    a.download = `${entityType}-${entityId}-audit.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventTypeOptions = useMemo(() => {
    const unique = new Set(events.map((row) => row.event_type));
    return Array.from(unique).sort();
  }, [events]);

  const filterBar = (
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
        Actor
        <input
          type="text"
          placeholder="Email or ID"
          className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm w-32"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
        />
      </label>
      <label className="text-xs text-gray-600">
        Status
        <select
          className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
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
        type="button"
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
  );

  return (
    <div className="space-y-4" data-testid={`${entityType}-audit-history-tab`}>
      {auditQuery.isError ? (
        <>
          {filterBar}
          <ListErrorState
            title="Couldn't load audit history"
            {...formatQueryErrorDetail(auditQuery.error)}
            onRetry={() => void auditQuery.refetch()}
          />
        </>
      ) : (
        <ParityTable
          rows={events}
          columns={COLUMNS}
          rowKey={(row) => row.id}
          loading={auditQuery.isLoading}
          storageKey={`entity-audit-history-${entityType}`}
          emptyText="No audit events found for this record."
          filterBar={filterBar}
          tableTestId={`${entityType}-audit-history-table`}
          rowTestId={(row) => `${entityType}-audit-history-row-${row.id}`}
          renderExpanded={(event) => (
            <div className="text-xs">
              <div className="font-medium text-gray-700 mb-2">Before → After</div>
              <ChangesDiff changes={event.payload?.changes} />
              {event.payload?.reason ? (
                <div className="mt-2 text-gray-600">
                  <span className="font-medium">Reason:</span> {event.payload.reason}
                </div>
              ) : null}
            </div>
          )}
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
