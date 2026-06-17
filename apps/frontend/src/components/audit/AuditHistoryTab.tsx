// @vitest-environment jsdom
import { useState, useCallback } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { resolveApiUrl } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Download, AlertTriangle } from "lucide-react";

interface AuditEvent {
  id: string;
  created_at: string;
  event_type: string;
  severity: string;
  summary: string;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
  payload: {
    changes?: Record<string, { old: unknown; new: unknown }>;
    reason?: string;
    status?: string;
    [key: string]: unknown;
  };
}

interface AuditHistoryTabProps {
  operatingCompanyId: string;
  entityType: string;
  entityId: string;
}

interface Filters {
  eventType: string;
  status: string;
  actor: string;
  source: string;
  from: string;
  to: string;
  voidsOnly: boolean;
}

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "void", label: "Void" },
  { value: "reverse", label: "Reverse" },
  { value: "payment", label: "Payment" },
  { value: "journal", label: "Journal" },
  { value: "deduction", label: "Deduction" },
  { value: "reclassify", label: "Reclassify" },
  { value: "status_change", label: "Status Change" },
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

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "dispatch", label: "Dispatch" },
  { value: "maint", label: "Maintenance" },
  { value: "accounting", label: "Accounting" },
  { value: "banking", label: "Banking" },
  { value: "safety", label: "Safety" },
  { value: "driver", label: "Driver Hub" },
];

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString();
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

function EventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b hover:bg-gray-50">
        <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(event.created_at)}</td>
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
        <td className="px-3 py-2 text-xs text-gray-600">{event.summary}</td>
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

export function AuditHistoryTab({ operatingCompanyId, entityType, entityId }: AuditHistoryTabProps) {
  const [filters, setFilters] = useState<Filters>({
    eventType: "",
    status: "",
    actor: "",
    source: "",
    from: "",
    to: "",
    voidsOnly: false,
  });

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams({
      operating_company_id: operatingCompanyId,
      entity_type: entityType,
      entity_id: entityId,
      limit: "100",
      offset: "0",
    });
    if (filters.eventType) params.append("event_type", filters.eventType);
    if (filters.status) params.append("status", filters.status);
    if (filters.actor) params.append("actor", filters.actor);
    if (filters.source) params.append("source", filters.source);
    if (filters.from) params.append("from", filters.from);
    if (filters.to) params.append("to", filters.to);
    if (filters.voidsOnly) params.append("voids_only", "true");
    return params.toString();
  }, [filters, operatingCompanyId, entityType, entityId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-events", entityType, entityId, filters],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/audit/events-list?${buildQueryString()}`));
      if (!res.ok) throw new Error("Failed to fetch audit events");
      return res.json() as Promise<{ events: AuditEvent[]; total_count: number }>;
    },
  });

  const exportCSV = () => {
    if (!data?.events) return;
    const rows = data.events.map((e) => ({
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
    a.download = `${entityType}-${entityId}-audit.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* QBO-style Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded border">
        <select
          value={filters.eventType}
          onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
          className="text-xs px-2 py-1 border rounded bg-white"
        >
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="text-xs px-2 py-1 border rounded bg-white"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Actor (email or ID)"
          value={filters.actor}
          onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
          className="text-xs px-2 py-1 border rounded bg-white w-40"
        />

        <select
          value={filters.source}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
          className="text-xs px-2 py-1 border rounded bg-white"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <DatePicker
          value={filters.from}
          onChange={(next) => setFilters((f) => ({ ...f, from: next }))}
          className="text-xs px-2 py-1 border rounded bg-white"
        />

        <DatePicker
          value={filters.to}
          onChange={(next) => setFilters((f) => ({ ...f, to: next }))}
          className="text-xs px-2 py-1 border rounded bg-white"
        />

        <button
          onClick={() => setFilters((f) => ({ ...f, voidsOnly: !f.voidsOnly }))}
          className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${
            filters.voidsOnly ? "bg-red-100 border-red-300 text-red-700" : "bg-white hover:bg-gray-100"
          }`}
        >
          <AlertTriangle size={12} />
          Voids & Reversals
        </button>

        <div className="flex-1" />

        <button
          onClick={exportCSV}
          disabled={!data?.events?.length}
          className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50"
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Audit Events Table */}
      {isLoading ? (
        <div className="text-sm text-gray-500 p-4">Loading audit history...</div>
      ) : error ? (
        <div className="text-sm text-red-600 p-4">Failed to load audit history</div>
      ) : !data?.events?.length ? (
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
              {data.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total_count > 100 && (
        <div className="text-xs text-gray-500">
          Showing {data.events.length} of {data.total_count} events. Refine filters to narrow results.
        </div>
      )}
    </div>
  );
}
