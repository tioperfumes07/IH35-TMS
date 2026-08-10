import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSpineEvents, type SpineEvent } from "../../api/audit";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { isoToDateTimeLocalValue } from "../../lib/formatDate";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

const PAGE_SIZE = 100;

const MODULE_OPTIONS = [
  { value: "", label: "All modules" },
  { value: "dispatch", label: "Dispatch" },
  { value: "maintenance", label: "Maintenance" },
  { value: "accounting", label: "Accounting" },
  { value: "banking", label: "Banking" },
  { value: "safety", label: "Safety" },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function sourceLink(ev: SpineEvent): string | null {
  if (!ev.source_table || !ev.source_reference_id) return null;
  const t = ev.source_table;
  const id = ev.source_reference_id;
  if (t.includes("load")) return `/dispatch/loads/${id}`;
  if (t.includes("invoice")) return `/accounting/invoices/${id}`;
  if (t.includes("bill")) return `/accounting/bills/${id}`;
  if (t.includes("work_order")) return `/maintenance/work-orders/${id}`;
  if (t.includes("transfer")) return `/banking/transfers/${id}`;
  if (t.includes("payment")) return `/accounting/payments/${id}`;
  return null;
}

function downloadCSV(events: SpineEvent[]) {
  const cols = ["occurred_at", "event_type", "actor_email", "subject_type", "subject_id", "source_table", "source_reference_id", "correlation_id"];
  const header = cols.join(",");
  const rows = events.map((e) =>
    [e.occurred_at, e.event_type, entityLabel(e.actor_email, e.actor_user_id, "User") ?? "", e.subject_type ?? "", e.subject_id ?? "", e.source_table ?? "", e.source_reference_id ?? "", e.correlation_id ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-trail-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const COLUMNS: Array<ParityColumn<SpineEvent>> = [
  {
    key: "occurred_at",
    label: "When",
    sortable: true,
    sortValue: (row) => new Date(row.occurred_at).getTime(),
    render: (row) => <span className="whitespace-nowrap text-gray-700">{fmtDate(row.occurred_at)}</span>,
  },
  {
    key: "event_type",
    label: "Event type",
    sortable: true,
    render: (row) => <span className="font-mono text-gray-900">{row.event_type}</span>,
  },
  {
    key: "actor_email",
    label: "Actor",
    sortable: true,
    sortValue: (row) => row.actor_email ?? row.actor_user_id ?? "",
    render: (row) => (
      <span className="text-gray-600">
        {row.actor_email ?? (row.actor_user_id ? entityLabel(null, row.actor_user_id, "User") : "—")}
      </span>
    ),
  },
  {
    key: "subject_type",
    label: "Entity",
    sortable: true,
    sortValue: (row) => `${row.subject_type ?? ""}:${row.subject_id ?? ""}`,
    render: (row) => (
      <span className="text-gray-600">
        {row.subject_type ?? "—"}
        {row.subject_id ? <span className="ml-1 text-gray-400">{entityLabel(null, row.subject_id, "Subject")}</span> : null}
      </span>
    ),
  },
  {
    key: "source_table",
    label: "Source",
    sortable: true,
    sortValue: (row) => row.source_table ?? row.source ?? "",
    render: (row) => {
      const link = sourceLink(row);
      if (link) {
        return (
          <a
            href={link}
            className="text-[#16A34A] underline hover:text-[#15803d]"
            onClick={(e) => e.stopPropagation()}
          >
            {row.source_table}
          </a>
        );
      }
      return <span className="text-gray-400">{row.source_table ?? row.source ?? "—"}</span>;
    },
  },
];

function ExpandedEventDetail({ row }: { row: SpineEvent }) {
  return (
    <div className="grid gap-3 text-xs md:grid-cols-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Payload</div>
        <pre className="max-h-48 overflow-auto rounded-sm border border-gray-100 bg-white p-2 text-[11px] leading-tight">
          {JSON.stringify(row.payload, null, 2)}
        </pre>
      </div>
      <div className="space-y-2">
        {row.correlation_id ? (
          <div>
            <span className="font-semibold text-gray-500">Correlation ID: </span>
            <span className="text-gray-700">{entityLabel(null, row.correlation_id, "Correlation")}</span>
          </div>
        ) : null}
        {row.source_reference_id ? (
          <div>
            <span className="font-semibold text-gray-500">Source ref: </span>
            <span className="text-gray-700">{entityLabel(null, row.source_reference_id, "Source")}</span>
          </div>
        ) : null}
        <div>
          <span className="font-semibold text-gray-500">Event ID: </span>
          <span className="text-gray-700">{entityLabel(null, row.event_id, "Event")}</span>
        </div>
      </div>
    </div>
  );
}

export function AuditTrailPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [applied, setApplied] = useState({ module: "", action: "", entityType: "", entityId: "", actorUserId: "", correlationId: "", from: "", to: "", offset: 0 });

  const query = useQuery({
    queryKey: ["audit-trail", companyId, ...Object.values(applied)],
    queryFn: () =>
      listSpineEvents({
        operatingCompanyId: companyId,
        module: applied.module || undefined,
        action: applied.action || undefined,
        entityType: applied.entityType || undefined,
        entityId: applied.entityId || undefined,
        actorUserId: applied.actorUserId || undefined,
        correlationId: applied.correlationId || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
        limit: PAGE_SIZE,
        offset: applied.offset,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => query.data?.events ?? [], [query.data?.events]);

  function applyFilters() {
    setApplied({ module, action, entityType, entityId, actorUserId, correlationId, from: fromDate, to: toDate, offset: 0 });
  }

  function resetFilters() {
    setModule(""); setAction(""); setEntityType(""); setEntityId("");
    setActorUserId(""); setCorrelationId(""); setFromDate(""); setToDate("");
    setApplied({ module: "", action: "", entityType: "", entityId: "", actorUserId: "", correlationId: "", from: "", to: "", offset: 0 });
  }

  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(applied.offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Audit Trail" subtitle="Universal spine event log — read-only" />

      {/* Single outer frame — filter row is border-b only (no nested card above ParityTable). */}
      <section
        className="overflow-hidden rounded-sm border border-gray-200 bg-white"
        data-testid="audit-trail-list-frame"
      >
        <div className="grid grid-cols-2 gap-3 border-b border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Module
            <select className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" value={module} onChange={(e) => setModule(e.target.value)}>
              {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action / event type
            <input className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. invoice.created" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type
            <input className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="e.g. invoice" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity ID (UUID)
            <input className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Actor user ID
            <input className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono" value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Correlation ID
            <input className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            From
            <DateTimePicker className="normal-case font-normal" aria-label="From date" value={isoToDateTimeLocalValue(fromDate)} onChange={(v) => setFromDate(v ? new Date(v).toISOString() : "")} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            To
            <DateTimePicker className="normal-case font-normal" aria-label="To date" value={isoToDateTimeLocalValue(toDate)} onChange={(v) => setToDate(v ? new Date(v).toISOString() : "")} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={applyFilters} className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729]">Apply</button>
          <button type="button" onClick={resetFilters} className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Reset</button>
          {rows.length > 0 && (
            <button type="button" onClick={() => downloadCSV(rows)} className="ml-2 rounded-sm border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Export CSV</button>
          )}
          {totalCount > 0 && <span className="ml-auto text-xs text-gray-500">{totalCount.toLocaleString()} event{totalCount !== 1 ? "s" : ""}</span>}
        </div>

        {query.isError ? (
          <ListErrorState
            title="Couldn't load audit trail"
            status={0}
            message={(query.error as Error)?.message ?? "Failed to load audit trail."}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ParityTable
            rows={rows}
            columns={COLUMNS}
            rowKey={(row) => row.event_id}
            loading={query.isLoading}
            storageKey="audit-trail-page"
            emptyText="No events found."
            tableTestId="audit-trail-table"
            rowTestId={(row) => `audit-trail-row-${row.event_id}`}
            renderExpanded={(row) => <ExpandedEventDetail row={row} />}
          />
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" disabled={currentPage <= 1} onClick={() => setApplied((p) => ({ ...p, offset: Math.max(0, p.offset - PAGE_SIZE) }))} className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">← Previous</button>
          <span className="text-xs text-gray-600">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setApplied((p) => ({ ...p, offset: p.offset + PAGE_SIZE }))} className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  );
}

export default AuditTrailPage;
