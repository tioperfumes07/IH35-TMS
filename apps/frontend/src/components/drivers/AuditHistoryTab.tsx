import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMemo, useState } from "react";
import { listDriverAuditEvents, type DriverAuditEvent } from "../../api/audit";
import { Button } from "../Button";
import { Download, AlertTriangle } from "lucide-react";

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

export function AuditHistoryTab({ driverId, operatingCompanyId }: Props) {
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [voidsOnly, setVoidsOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined;

  const auditQuery = useQuery({
    queryKey: ["driver-audit-events", driverId, operatingCompanyId, eventTypeFilter, fromIso, toIso, actorFilter, statusFilter, sourceFilter, voidsOnly],
    queryFn: () =>
      listDriverAuditEvents({
        operatingCompanyId,
        driverId,
        eventType: eventTypeFilter.trim() || undefined,
        from: fromIso,
        to: toIso,
        limit: 200,
      }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const exportCSV = () => {
    const events = auditQuery.data?.events ?? [];
    if (!events.length) return;
    const rows = events.map((e: DriverAuditEvent) => ({
      Date: e.created_at,
      Actor: e.actor_email || e.actor_user_id || "—",
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

  return (
    <div className="space-y-3" data-testid="driver-audit-history-tab">
      {/* ARCHIVE (A24-6): prior placeholder lived inline on DriverDetail — now live drill-down with QBO-style filters */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded border">
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={fromDate}
            onChange={(next) => setFromDate(next)}
            data-testid="driver-audit-filter-from"
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={toDate}
            onChange={(next) => setToDate(next)}
            data-testid="driver-audit-filter-to"
          />
        </label>
        <label className="text-xs text-gray-600">
          Event type
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            data-testid="driver-audit-filter-event-type"
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
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm w-32"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            data-testid="driver-audit-filter-actor"
          />
        </label>
        <label className="text-xs text-gray-600">
          Status
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="driver-audit-filter-status"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Source
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            data-testid="driver-audit-filter-source"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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

      {auditQuery.isLoading ? <p className="text-sm text-gray-500">Loading audit history…</p> : null}
      {auditQuery.isError ? (
        <p className="text-sm text-red-600" data-testid="driver-audit-error">
          Unable to load audit history.
        </p>
      ) : null}

      {!auditQuery.isLoading && events.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="driver-audit-empty">
          No audit events for this driver.
        </p>
      ) : null}

      {events.length > 0 ? (
        <table className="min-w-full text-xs" data-testid="driver-audit-table">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">Actor</th>
              <th className="py-2 pr-3">Event</th>
              <th className="py-2 pr-3">Summary</th>
              <th className="py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((row) => {
              const expanded = expandedId === row.id;
              return (
                <tr key={row.id} className="border-b align-top" data-testid={`driver-audit-row-${row.id}`}>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(row.created_at)}</td>
                  <td className="py-2 pr-3">{row.actor_email ?? row.actor_user_id ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-[11px]">{row.event_type}</td>
                  <td className="py-2 pr-3">{row.summary}</td>
                  <td className="py-2">
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
                        className="mt-2 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-[10px]"
                        data-testid={`driver-audit-diff-${row.id}`}
                      >
                        {payloadDiff(row.payload)}
                      </pre>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
