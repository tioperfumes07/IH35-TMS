import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditViewerEvents, type AuditViewerEvent } from "../../../api/audit";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { AuditEventCard } from "../../../components/audit/AuditEventCard";
import { SuperAdminNav } from "../../../components/admin/SuperAdminNav";

const PAGE_SIZE = 100;

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function AuditLogViewer() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const allowed = auth.user?.role === "Owner" || auth.user?.role === "SuperAdmin";

  const [entityType, setEntityType] = useState("");
  const [entityUuid, setEntityUuid] = useState("");
  const [userUuid, setUserUuid] = useState("");
  const [action, setAction] = useState("");
  const [severity, setSeverity] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchText, setSearchText] = useState("");

  const [applied, setApplied] = useState({
    entityType: "",
    entityUuid: "",
    userUuid: "",
    action: "",
    severity: "",
    from: "",
    to: "",
    searchText: "",
    offset: 0,
  });

  const [selectedEvent, setSelectedEvent] = useState<AuditViewerEvent | null>(null);

  const query = useQuery({
    queryKey: ["audit-viewer", companyId, ...Object.values(applied)],
    queryFn: () =>
      listAuditViewerEvents({
        operatingCompanyId: companyId,
        entityType: applied.entityType || undefined,
        entityUuid: applied.entityUuid || undefined,
        userUuid: applied.userUuid || undefined,
        action: applied.action || undefined,
        severity: applied.severity || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
        searchText: applied.searchText || undefined,
        limit: PAGE_SIZE,
        offset: applied.offset,
      }),
    enabled: Boolean(allowed && companyId),
  });

  function applyFilters() {
    setApplied({
      entityType,
      entityUuid,
      userUuid,
      action,
      severity,
      from: fromDate,
      to: toDate,
      searchText,
      offset: 0,
    });
  }

  function resetFilters() {
    setEntityType("");
    setEntityUuid("");
    setUserUuid("");
    setAction("");
    setSeverity("");
    setFromDate("");
    setToDate("");
    setSearchText("");
    setApplied({ entityType: "", entityUuid: "", userUuid: "", action: "", severity: "", from: "", to: "", searchText: "", offset: 0 });
  }

  function goPage(newOffset: number) {
    setApplied((prev) => ({ ...prev, offset: newOffset }));
  }

  if (!allowed) {
    return (
      <div className="space-y-3 p-4">
        <SuperAdminNav />
        <PageHeader title="Audit log" subtitle="Universal read-only viewer" />
        <p className="text-sm text-gray-600">Access restricted to Owner and SuperAdmin.</p>
      </div>
    );
  }

  const rows = query.data?.events ?? [];
  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(applied.offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4 p-4">
      <SuperAdminNav />
      <PageHeader
        title="Audit log"
        subtitle="Universal read-only viewer — compliance &amp; forensics"
      />

      {/* Filters */}
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="e.g. driver"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity UUID
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={entityUuid}
              onChange={(e) => setEntityUuid(e.target.value)}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            User UUID
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={userUuid}
              onChange={(e) => setUserUuid(e.target.value)}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action / event class
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. invoice.created"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Severity
            <select
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            From
            <input
              type="datetime-local"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              onChange={(e) => setFromDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            To
            <input
              type="datetime-local"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              onChange={(e) => setToDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Search
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="event class or payload"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={applyFilters} variant="primary" size="sm">Apply</Button>
          <Button onClick={resetFilters} variant="secondary" size="sm">Reset</Button>
          {totalCount > 0 && (
            <span className="ml-auto text-xs text-gray-500">
              {totalCount.toLocaleString()} event{totalCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        {query.isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
        {query.isError && (
          <div className="p-4 text-sm text-red-600">Failed to load. Check filters and try again.</div>
        )}
        {!query.isLoading && !query.isError && rows.length === 0 && (
          <div className="p-4 text-sm text-gray-500">No audit events found.</div>
        )}
        {rows.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event class</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: AuditViewerEvent) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                  onClick={() => setSelectedEvent(selectedEvent?.id === row.id ? null : row)}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDate(row.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-gray-900">{row.event_class}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_BADGE[row.severity] ?? "bg-gray-100 text-gray-700"}`}>
                      {row.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {row.actor_email ?? (row.actor_user_id ? `uid:${row.actor_user_id.slice(0, 8)}…` : "—")}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{row.source ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Event detail card */}
      {selectedEvent && (
        <AuditEventCard event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => goPage(Math.max(0, applied.offset - PAGE_SIZE))}
          >
            ← Previous
          </Button>
          <span>Page {currentPage} of {totalPages}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => goPage(applied.offset + PAGE_SIZE)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}

export default AuditLogViewer;
