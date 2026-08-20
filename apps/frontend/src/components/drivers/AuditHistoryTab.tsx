import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMemo, useState } from "react";
import { listDriverAuditEvents, type DriverAuditEvent } from "../../api/audit";
import { Button } from "../Button";
import { entityLabel } from "../../lib/entity-label";
import { CappedListNotice } from "../CappedListNotice";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { Download, AlertTriangle } from "lucide-react";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { MultiSelectDropdown } from "../forms/MultiSelectDropdown";

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function payloadDiff(payload: unknown): string {
  if (!payload || typeof payload !== "object") return JSON.stringify(payload ?? {}, null, 2);
  const record = payload as Record<string, unknown>;
  if (record.changes && typeof record.changes === "object") {
    return JSON.stringify(record.changes, null, 2);
  }
  return JSON.stringify(record, null, 2);
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

export function AuditHistoryTab({ driverId, operatingCompanyId }: Props) {
  // LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: arrays, wired to MultiSelectDropdown below.
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [voidsOnly, setVoidsOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined;

  const auditQuery = useQuery({
    // SAF-B29: every filter that can shrink the result MUST be in the queryKey AND the request —
    // chrome previously put actor/status/source/voids in the key only, so React Query refetched
    // while the server still returned the unfiltered first 200 rows (and the UI never even
    // client-filtered). Matching history past that cap stayed invisible.
    queryKey: [
      "driver-audit-events",
      driverId,
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
      listDriverAuditEvents({
        operatingCompanyId,
        driverId,
        eventType: eventTypeFilter.length > 0 ? eventTypeFilter : undefined,
        from: fromIso,
        to: toIso,
        actor: actorFilter.trim() || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        source: sourceFilter.length > 0 ? sourceFilter : undefined,
        voidsOnly: voidsOnly || undefined,
        limit: 200,
      }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const exportCSV = () => {
    const events = auditQuery.data?.events ?? [];
    if (!events.length) return;
    const rows = events.map((e: DriverAuditEvent) => ({
      Date: e.created_at,
      Actor: entityLabel(e.actor_email, e.actor_user_id, "User") ?? "—",
      Type: e.event_type,
      Summary: e.summary,
      Source: e.source || "—",
    }));
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, string>)[h] ?? "")}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `driver-${driverId}-audit.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const events = auditQuery.data?.events ?? [];
  const eventTypeOptions = useMemo(() => {
    const unique = new Set(events.map((row) => row.event_type));
    return Array.from(unique).sort();
  }, [events]);

  const columns: Array<ParityColumn<DriverAuditEvent>> = useMemo(
    () => [
      {
        key: "created_at",
        label: "When",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        render: (row) => <span className="whitespace-nowrap text-gray-800">{formatWhen(row.created_at)}</span>,
      },
      {
        key: "actor_email",
        label: "Actor",
        sortable: true,
        sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User") ?? "",
        render: (row) => <EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_email} noun="User" className="text-gray-800" />,
      },
      {
        key: "event_type",
        label: "Event",
        sortable: true,
        render: (row) => <span className="font-mono text-[11px] text-gray-900">{row.event_type}</span>,
      },
      {
        key: "summary",
        label: "Summary",
        sortable: true,
        render: (row) => <span className="text-gray-800">{row.summary}</span>,
      },
      {
        key: "details",
        label: "Details",
        render: (row) => {
          const expanded = expandedId === row.id;
          return (
            <div>
              <button
                type="button"
                className="text-slate-700 underline"
                data-testid={`driver-audit-expand-${row.id}`}
                onClick={() => setExpandedId(expanded ? null : row.id)}
              >
                {expanded ? "Hide" : "Expand"}
              </button>
              {expanded ? (
                <pre
                  className="mt-2 max-h-48 overflow-auto rounded-sm bg-gray-50 p-2 text-[10px]"
                  data-testid={`driver-audit-diff-${row.id}`}
                >
                  {payloadDiff(row.payload)}
                </pre>
              ) : null}
            </div>
          );
        },
      },
    ],
    [expandedId]
  );

  return (
    <div className="space-y-3" data-testid="driver-audit-history-tab">
      {/* ARCHIVE (A24-6): prior placeholder lived inline on DriverDetail — now live drill-down with QBO-style filters */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-sm border">
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block"
            value={fromDate}
            onChange={(next) => setFromDate(next)}
            data-testid="driver-audit-filter-from"
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block"
            value={toDate}
            onChange={(next) => setToDate(next)}
            data-testid="driver-audit-filter-to"
          />
        </label>
        <label className="text-xs text-gray-600">
          Event type
          <MultiSelectDropdown
            label="Event type"
            options={eventTypeOptions.map((value) => ({ value, label: value }))}
            selected={eventTypeFilter}
            onChange={setEventTypeFilter}
            data-testid="driver-audit-filter-event-type"
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
            data-testid="driver-audit-filter-actor"
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
            data-testid="driver-audit-filter-status"
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
            data-testid="driver-audit-filter-source"
          />
        </label>
        <button
          onClick={() => setVoidsOnly((v) => !v)}
          className={`text-xs px-2 py-1 rounded border flex items-center gap-1 mt-4 ${
            voidsOnly ? "bg-red-100 border-red-300 text-red-700" : "bg-white hover:bg-gray-100"
          }`}
          data-testid="driver-audit-filter-voids"
        >
          <AlertTriangle size={12} />
          Voids & Reversals
        </button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          data-testid="driver-audit-refresh"
          onClick={() => void auditQuery.refetch()}
        >
          Refresh
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-testid="driver-audit-export"
          onClick={exportCSV}
          disabled={!events.length}
        >
          <Download size={14} className="mr-1" />
          Export CSV
        </Button>
      </div>

      {auditQuery.isError ? (
        <ListErrorState
          title="Couldn't load audit history"
          status={0}
          message={(auditQuery.error as Error)?.message ?? "Unable to load audit history."}
          onRetry={() => void auditQuery.refetch()}
        />
      ) : (
        <div className="overflow-auto rounded-sm border border-gray-200 bg-white p-2">
          {!auditQuery.isLoading && events.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-gray-500" data-testid="driver-audit-empty">
              No audit events for this driver.
            </p>
          ) : (
            <ParityTable
              rows={events}
              columns={columns}
              rowKey={(row) => row.id}
              loading={auditQuery.isLoading}
              storageKey="driver-audit-history"
              emptyText="No audit events for this driver."
              tableTestId="driver-audit-table"
              rowTestId={(row) => `driver-audit-row-${row.id}`}
              renderExpanded={(row) => (
                <pre
                  className="max-h-48 overflow-auto rounded-sm bg-gray-50 p-2 text-[10px]"
                  data-testid={`driver-audit-diff-expanded-${row.id}`}
                >
                  {payloadDiff(row.payload)}
                </pre>
              )}
            />
          )}
          <CappedListNotice
            shown={events.length}
            limit={200}
            total={auditQuery.data?.total_count ?? null}
            hint="Narrow filters or export CSV for older audit events."
            className="mt-2 text-[11px] text-slate-600"
          />
        </div>
      )}
    </div>
  );
}
