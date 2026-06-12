// @vitest-environment jsdom
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Download, AlertTriangle } from "lucide-react";
import { listAuditEvents, type AuditEventListItem } from "../../api/audit";
import { Button } from "../Button";

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

type EventWithPayload = AuditEventListItem & { payload?: { changes?: Record<string, { old: unknown; new: unknown }>; reason?: string } };

function EventRow({ event }: { event: EventWithPayload }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b hover:bg-gray-50">
        <td className="px-3 py-2 text-xs whitespace-nowrap">{formatWhen(event.created_at)}</td>
        <td className="px-3 py-2 text-xs">{event.actor_email || event.actor_user_id?.slice(0, 8) || "—"}</td>
        <td className="px-3 py-2 text-xs">
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
              event.severity === "error"
                ? "bg-red-100 text-red-700"
                : event.severity === "warn"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {event.event_type}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-600">{event.summary || "—"}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{event.source || "—"}</td>
        <td className="px-3 py-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-200 rounded"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-3 py-3">
            <div className="text-xs">
              <div className="font-medium text-gray-700 mb-2">Before → After</div>
              <ChangesDiff changes={event.payload?.changes} />
              {event.payload?.reason && (
                <div className="mt-2 text-gray-600">
                  <span className="font-medium">Reason:</span> {event.payload.reason}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

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
    queryKey: ["entity-audit-events", entityType, entityId, operatingCompanyId, eventTypeFilter, fromIso, toIso, actorFilter, statusFilter, sourceFilter, voidsOnly],
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

  const events = useMemo(() => auditQuery.data?.events ?? [], [auditQuery.data]);

  const exportCSV = () => {
    if (!events.length) return;
    const rows = events.map((e: AuditEventListItem) => ({
      Date: e.created_at,
      Actor: e.actor_email || e.actor_user_id || "—",
      Type: e.event_type,
      Summary: e.summary || "—",
      Source: e.source || "—",
    }));
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, string>)[h] ?? "")}"`).join(","))].join("\n");
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

  return (
    <div className="space-y-4" data-testid={`${entityType}-audit-history-tab`}>
      {/* QBO-style Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded border">
        <label className="text-xs text-gray-600">
          From
          <input
            type="date"
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input
            type="date"
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Event type
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
          >
            <option value="">All</option>
            {eventTypeOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
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
          />
        </label>
        <label className="text-xs text-gray-600">
          Status
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
        >
          <AlertTriangle size={12} />
          Voids & Reversals
        </button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void auditQuery.refetch()}
        >
          Refresh
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={exportCSV}
          disabled={!events.length}
        >
          <Download size={14} className="mr-1" />
          Export CSV
        </Button>
      </div>

      {auditQuery.isLoading ? (
        <div className="text-sm text-gray-500 p-4">Loading audit history...</div>
      ) : auditQuery.isError ? (
        <div className="text-sm text-red-600 p-4">Failed to load audit history</div>
      ) : !events.length ? (
        <div className="text-sm text-gray-500 p-4">No audit events found for this record.</div>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-left">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-700">When</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-700">Who</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-700">Action</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-700">Summary</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-700">Source</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-700 w-8" />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <EventRow key={event.id} event={event as EventWithPayload} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {auditQuery.data && auditQuery.data.total_count > 200 && (
        <div className="text-xs text-gray-500">
          Showing {events.length} of {auditQuery.data.total_count} events. Refine filters to narrow results.
        </div>
      )}
    </div>
  );
}
