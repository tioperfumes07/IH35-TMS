import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSpineEvents, type SpineEvent } from "../../api/audit";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";

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
    [e.occurred_at, e.event_type, e.actor_email ?? e.actor_user_id ?? "", e.subject_type ?? "", e.subject_id ?? "", e.source_table ?? "", e.source_reference_id ?? "", e.correlation_id ?? ""]
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  function applyFilters() {
    setApplied({ module, action, entityType, entityId, actorUserId, correlationId, from: fromDate, to: toDate, offset: 0 });
  }

  function resetFilters() {
    setModule(""); setAction(""); setEntityType(""); setEntityId("");
    setActorUserId(""); setCorrelationId(""); setFromDate(""); setToDate("");
    setApplied({ module: "", action: "", entityType: "", entityId: "", actorUserId: "", correlationId: "", from: "", to: "", offset: 0 });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  const rows = query.data?.events ?? [];
  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(applied.offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Audit Trail" subtitle="Universal spine event log — read-only" />

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Module
            <select className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" value={module} onChange={(e) => setModule(e.target.value)}>
              {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action / event type
            <input className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. invoice.created" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type
            <input className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="e.g. invoice" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity ID (UUID)
            <input className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Actor user ID
            <input className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono" value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Correlation ID
            <input className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            From
            <input type="datetime-local" className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" onChange={(e) => setFromDate(e.target.value ? new Date(e.target.value).toISOString() : "")} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            To
            <input type="datetime-local" className="rounded border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal" onChange={(e) => setToDate(e.target.value ? new Date(e.target.value).toISOString() : "")} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={applyFilters} className="rounded bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803d]">Apply</button>
          <button type="button" onClick={resetFilters} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Reset</button>
          {rows.length > 0 && (
            <button type="button" onClick={() => downloadCSV(rows)} className="ml-2 rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Export CSV</button>
          )}
          {totalCount > 0 && <span className="ml-auto text-xs text-gray-500">{totalCount.toLocaleString()} event{totalCount !== 1 ? "s" : ""}</span>}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        {query.isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
        {query.isError && <div className="p-4 text-sm text-red-600">Failed to load audit trail.</div>}
        {!query.isLoading && !query.isError && rows.length === 0 && (
          <div className="p-4 text-sm text-gray-500">No events found.</div>
        )}
        {rows.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              <tr>
                <th className="w-4 px-2 py-2" />
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event type</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: SpineEvent) => {
                const link = sourceLink(row);
                const open = expandedIds.has(row.event_id);
                return (
                  <Fragment key={row.event_id}>
                    <tr className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => toggleExpand(row.event_id)}>
                      <td className="px-2 py-2 text-gray-400 select-none">{open ? "▾" : "▸"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDate(row.occurred_at)}</td>
                      <td className="px-3 py-2 font-mono text-gray-900">{row.event_type}</td>
                      <td className="px-3 py-2 text-gray-600">{row.actor_email ?? (row.actor_user_id ? `uid:${row.actor_user_id.slice(0, 8)}…` : "—")}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {row.subject_type ?? "—"}
                        {row.subject_id ? <span className="ml-1 font-mono text-gray-400">{row.subject_id.slice(0, 8)}…</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        {link
                          ? <a href={link} className="text-[#16A34A] underline hover:text-[#15803d]" onClick={(e) => e.stopPropagation()}>{row.source_table}</a>
                          : <span className="text-gray-400">{row.source_table ?? row.source ?? "—"}</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td />
                        <td colSpan={5} className="px-3 py-3">
                          <div className="grid gap-3 text-xs md:grid-cols-2">
                            <div>
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Payload</div>
                              <pre className="max-h-48 overflow-auto rounded border border-gray-100 bg-white p-2 text-[11px] leading-tight">{JSON.stringify(row.payload, null, 2)}</pre>
                            </div>
                            <div className="space-y-2">
                              {row.correlation_id && <div><span className="font-semibold text-gray-500">Correlation ID: </span><span className="font-mono text-gray-700">{row.correlation_id}</span></div>}
                              {row.source_reference_id && <div><span className="font-semibold text-gray-500">Source ref: </span><span className="font-mono text-gray-700">{row.source_reference_id}</span></div>}
                              <div><span className="font-semibold text-gray-500">Event ID: </span><span className="font-mono text-gray-700">{row.event_id}</span></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" disabled={currentPage <= 1} onClick={() => setApplied((p) => ({ ...p, offset: Math.max(0, p.offset - PAGE_SIZE) }))} className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">← Previous</button>
          <span className="text-xs text-gray-600">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setApplied((p) => ({ ...p, offset: p.offset + PAGE_SIZE }))} className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  );
}

export default AuditTrailPage;
