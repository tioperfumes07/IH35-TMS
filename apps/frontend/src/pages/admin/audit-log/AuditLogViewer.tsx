import { useMemo, useState } from "react";
import { entityLabel } from "../../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { listAuditViewerEvents, type AuditViewerEvent } from "../../../api/audit";
import { useAuth } from "../../../auth/useAuth";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { PageHeader } from "../../../components/layout/PageHeader";
import { DateTimePicker } from "../../../components/forms/DateTimePicker";
import { isoToDateTimeLocalValue } from "../../../lib/formatDate";
import { Button } from "../../../components/Button";
import { AuditEventCard } from "../../../components/audit/AuditEventCard";
import { SuperAdminNav } from "../../../components/admin/SuperAdminNav";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";

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

const COLUMNS: Array<ParityColumn<AuditViewerEvent>> = [
  {
    key: "created_at",
    label: "When",
    sortable: true,
    sortValue: (row) => new Date(row.created_at).getTime(),
    render: (row) => (
      <span className="whitespace-nowrap text-gray-700">{fmtDate(row.created_at)}</span>
    ),
  },
  {
    key: "event_class",
    label: "Event class",
    sortable: true,
    render: (row) => <span className="font-mono text-gray-900">{row.event_class}</span>,
  },
  {
    key: "severity",
    label: "Severity",
    sortable: true,
    render: (row) => (
      <span
        className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_BADGE[row.severity] ?? "bg-gray-100 text-gray-700"}`}
      >
        {row.severity}
      </span>
    ),
  },
  {
    key: "actor_email",
    label: "Actor",
    sortable: true,
    sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User") ?? "",
    render: (row) => <EntityLink kind="user" id={row.actor_user_id} label={row.actor_email ?? (row.actor_user_id ? entityLabel(null, row.actor_user_id, "User") : "—")} className="text-gray-600" />,
  },
  {
    key: "source",
    label: "Source",
    sortable: true,
    sortValue: (row) => row.source ?? "",
    render: (row) => <span className="text-gray-500">{row.source ?? "—"}</span>,
  },
];

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

  const rows = useMemo(() => query.data?.events ?? [], [query.data?.events]);

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

  function handleRowClick(row: AuditViewerEvent) {
    setSelectedEvent((prev) => (prev?.id === row.id ? null : row));
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
      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="e.g. driver"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity UUID
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={entityUuid}
              onChange={(e) => setEntityUuid(e.target.value)}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            User UUID
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={userUuid}
              onChange={(e) => setUserUuid(e.target.value)}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action / event class
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. invoice.created"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Severity
            <select
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
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
            <DateTimePicker
              className="normal-case font-normal"
              aria-label="From date"
              value={isoToDateTimeLocalValue(fromDate)}
              onChange={(v) => setFromDate(v ? new Date(v).toISOString() : "")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            To
            <DateTimePicker
              className="normal-case font-normal"
              aria-label="To date"
              value={isoToDateTimeLocalValue(toDate)}
              onChange={(v) => setToDate(v ? new Date(v).toISOString() : "")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Search
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
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
      {query.isError ? (
        <ListErrorState
          title="Couldn't load audit log"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="overflow-hidden rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            storageKey="audit-log-viewer"
            emptyText="No audit events found."
            tableTestId="audit-log-viewer-table"
            rowTestId={(row) => `audit-log-viewer-row-${row.id}`}
            onRowClick={handleRowClick}
            // ADMIN-F-PARITYTABLE-DOUBLE-PAGINATION: `rows` is already one server page (limit=
            // PAGE_SIZE of `totalCount` real rows, offset-driven). Without pageSize+hidePager,
            // ParityTable's own uncontrolled pager re-derives "total" from rows.length and renders
            // a second, contradictory pager (defaults to 15/page, "1-25 of 100" with real working
            // Next/Prev across the 100-row batch it was handed) directly above the real server
            // pager below ("Page {currentPage} of {totalPages}" — live-confirmed 2,088 real pages
            // / 208,800 real events, vs the fake pager's "100"). Same class as the already-fixed
            // REPORTS-F6363 (AuditReportPage.tsx) and DOCS-F-PARITYTABLE-DOUBLE-PAGINATION
            // (DocsHomePage.tsx). Per ParityTable's own documented "caller pre-pages" combo:
            // pageSize = server page size + hidePager — no double slicing.
            pageSize={PAGE_SIZE}
            hidePager
          />
        </div>
      )}

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
