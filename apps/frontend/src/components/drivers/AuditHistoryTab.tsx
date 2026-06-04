import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listDriverAuditEvents } from "../../api/audit";
import { Button } from "../Button";

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

export function AuditHistoryTab({ driverId, operatingCompanyId }: Props) {
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined;

  const auditQuery = useQuery({
    queryKey: ["driver-audit-events", driverId, operatingCompanyId, eventTypeFilter, fromIso, toIso],
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

  const events = auditQuery.data?.events ?? [];
  const eventTypeOptions = useMemo(() => {
    const unique = new Set(events.map((row) => row.event_type));
    return Array.from(unique).sort();
  }, [events]);

  return (
    <div className="space-y-3" data-testid="driver-audit-history-tab">
      {/* ARCHIVE (A24-6): prior placeholder lived inline on DriverDetail — now live drill-down */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600">
          From
          <input
            type="date"
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="driver-audit-filter-from"
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input
            type="date"
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
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
        <Button
          size="sm"
          variant="secondary"
          data-testid="driver-audit-refresh"
          onClick={() => void auditQuery.refetch()}
        >
          Refresh
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
                      className="text-blue-700 underline"
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
