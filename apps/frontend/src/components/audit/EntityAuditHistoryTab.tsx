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
import { EntityLink } from "../shared/EntityLink";
import { MultiSelectDropdown } from "../forms/MultiSelectDropdown";

interface EntityAuditHistoryTabProps {
  operatingCompanyId: string;
  entityType: string;
  entityId: string;
}

const SOURCE_OPTIONS = [
  { value: "dispatch", label: "Dispatch" },
  { value: "maint", label: "Maintenance" },
  { value: "accounting", label: "Accounting" },
  { value: "banking", label: "Banking" },
  { value: "safety", label: "Safety" },
  { value: "driver", label: "Driver Hub" },
];

const STATUS_OPTIONS = [
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
    render: (row) => <EntityLink kind="user" id={row.actor_user_id} label={entityLabel(row.actor_email, row.actor_user_id, "User") || "—"} />,
  },
  {
    key: "event_type",
    label: "Action",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="audit_event"
        id={row.id}
        label={row.event_type}
        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
          row.severity === "error"
            ? "bg-red-100 text-red-700"
            : row.severity === "warn"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-gray-100 text-gray-700"
        }`}
      />
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
  // LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: arrays, not a single string — the filter bar below
  // renders these via MultiSelectDropdown so "Active OR Inactive" / "Dispatch OR Safety" filters in
  // one pass instead of forcing a re-query per value.
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
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
        eventType: eventTypeFilter.length > 0 ? eventTypeFilter : undefined,
        actor: actorFilter.trim() || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        source: sourceFilter.length > 0 ? sourceFilter : undefined,
        voidsOnly,
        from: fromIso,
        to: toIso,
        limit: 200,
      }),
    enabled: Boolean(entityId) && Boolean(operatingCompanyId),
  });

  const events = useMemo(
    () => (auditQuery.isError ? [] : auditQuery.data?.events ?? []) as EventWithPayload[],
    [auditQuery.data, auditQuery.isError]
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
        <MultiSelectDropdown
          label="Event type"
          options={eventTypeOptions.map((value) => ({ value, label: value }))}
          selected={eventTypeFilter}
          onChange={setEventTypeFilter}
          data-testid="audit-history-event-type-filter"
        />
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
        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onChange={setStatusFilter}
          allLabel="All Statuses"
          data-testid="audit-history-status-filter"
        />
      </label>
      <label className="text-xs text-gray-600">
        Source
        <MultiSelectDropdown
          label="Source"
          options={SOURCE_OPTIONS}
          selected={sourceFilter}
          onChange={setSourceFilter}
          allLabel="All Sources"
          data-testid="audit-history-source-filter"
        />
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
