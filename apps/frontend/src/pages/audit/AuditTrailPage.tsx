import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditEvents, listSpineEvents, type AuditEventListItem, type SpineEvent } from "../../api/audit";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { isoToDateTimeLocalValue } from "../../lib/formatDate";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { type EntityKind } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Link, useSearchParams } from "react-router-dom";
import { useStagedListFilters } from "../../components/table";

const PAGE_SIZE = 100;

const SUBJECT_ENTITY_KINDS: Readonly<Record<string, EntityKind>> = {
  load: "load",
  driver: "driver",
  unit: "unit",
  customer: "customer",
  vendor: "vendor",
  work_order: "work_order",
  invoice: "invoice",
  bill: "bill",
  journal_entry: "journal_entry",
  customer_payment: "payment",
  claim: "claim",
  safety_event: "safety_event",
};

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

const SOURCE_ROUTES: Readonly<Record<string, (id: string) => string>> = {
  "mdata.loads": (id) => `/dispatch/loads/${id}`,
  "mdata.customers": (id) => `/customers/${id}`,
  "mdata.vendors": (id) => `/vendors/${id}`,
  "mdata.drivers": (id) => `/drivers/${id}`,
  "mdata.units": (id) => `/fleet/units/${id}`,
  "maintenance.work_orders": (id) => `/maintenance/work-orders/${id}`,
  "accounting.invoices": (id) => `/accounting/invoices/${id}`,
  "accounting.bills": (id) => `/accounting/bills/${id}`,
  "accounting.bill_payments": (id) => `/accounting/bill-payments/${id}`,
  "accounting.payments": (id) => `/accounting/payments/${id}`,
  "accounting.expenses": (id) => `/accounting/expenses/${id}`,
  "accounting.journal_entries": (id) => `/accounting/journal-entries/${id}`,
  "accounting.fixed_assets": (id) => `/accounting/fixed-assets?asset_id=${id}`,
  "banking.bank_transactions": (id) => `/banking/transactions?txn_id=${id}`,
  "banking.reconciliation_sessions": (id) => `/banking/reconciliation-workspace?session_id=${id}`,
  "banking.transfers": (id) => `/banking/transfers?transfer_id=${id}`,
  "driver_finance.driver_settlements": (id) => `/driver-finance/settlements?settlement_id=${id}`,
};

function sourceLink(ev: SpineEvent): string | null {
  if (!ev.source_table || !ev.source_reference_id) return null;
  return SOURCE_ROUTES[ev.source_table]?.(ev.source_reference_id) ?? null;
}

function downloadCSV(events: SpineEvent[]) {
  const cols = ["occurred_at", "event_type", "actor_email", "subject_type", "subject_id", "subject_label", "source_table", "source_reference_id", "correlation_id"];
  const header = cols.join(",");
  const rows = events.map((e) =>
    [e.occurred_at, e.event_type, entityLabel(e.actor_email, e.actor_user_id, "User"), e.subject_type ?? "", e.subject_id ?? "", e.subject_label ?? "", e.source_table ?? "", e.source_reference_id ?? "", e.correlation_id ?? ""]
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
    sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User"),
    render: (row) => <EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_email} noun="User" className="text-gray-600" />,
  },
  {
    key: "subject_type",
    label: "Entity",
    sortable: true,
    sortValue: (row) => `${row.subject_type ?? ""}:${row.subject_id ?? ""}`,
    render: (row) => {
      const subjectKind = row.subject_kind ?? row.subject_type;
      const kind = subjectKind ? SUBJECT_ENTITY_KINDS[subjectKind] : undefined;
      return (
        <span className="text-gray-600">
          {subjectKind ?? "—"}
          {row.subject_id ? (
            kind ? (
              <EntityLinkOrTombstone kind={kind} id={row.subject_id} name={row.subject_label} noun="Subject" className="ml-1 text-gray-500" />
            ) : (
              <span className="ml-1 text-gray-400">{row.subject_label ?? "Subject label unavailable"}</span>
            )
          ) : null}
        </span>
      );
    },
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
  const [searchParams] = useSearchParams();
  const auditEventId = searchParams.get("audit_event_id") ?? undefined;

  const exactAuditQuery = useQuery({
    queryKey: ["audit-trail", "exact-audit-event", companyId, auditEventId ?? null],
    queryFn: () => listAuditEvents({ operatingCompanyId: companyId, auditEventId, limit: 1 }),
    enabled: Boolean(companyId && auditEventId),
  });
  const exactAuditEvent = exactAuditQuery.data?.events[0] as AuditEventListItem | undefined;

  const [appliedFilters, setAppliedFilters] = useState({
    module: "",
    action: "",
    entityType: "",
    entityId: "",
    actorUserId: "",
    correlationId: "",
    from: "",
    to: "",
  });
  const [offset, setOffset] = useState(0);
  // LV-AUDIT-TRAIL-FILTER-NO-CANCEL — draft/applied via useStagedListFilters; Cancel restores draft.
  const staged = useStagedListFilters({
    applied: appliedFilters,
    empty: {
      module: "",
      action: "",
      entityType: "",
      entityId: "",
      actorUserId: "",
      correlationId: "",
      from: "",
      to: "",
    },
    onApply: (next) => {
      setAppliedFilters(next);
      setOffset(0);
    },
  });
  const draft = staged.draft;

  const query = useQuery({
    queryKey: ["audit-trail", companyId, ...Object.values(appliedFilters), offset],
    queryFn: () =>
      listSpineEvents({
        operatingCompanyId: companyId,
        module: appliedFilters.module || undefined,
        action: appliedFilters.action || undefined,
        entityType: appliedFilters.entityType || undefined,
        entityId: appliedFilters.entityId || undefined,
        actorUserId: appliedFilters.actorUserId || undefined,
        correlationId: appliedFilters.correlationId || undefined,
        from: appliedFilters.from || undefined,
        to: appliedFilters.to || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => query.data?.events ?? [], [query.data?.events]);

  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Audit Trail" subtitle="Universal spine event log — read-only" />

      {auditEventId ? (
        <section className="rounded-sm border border-slate-300 bg-slate-50 p-3" data-testid="audit-trail-exact-event">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Selected audit event</h2>
            <Link className="text-xs font-semibold text-slate-700 underline" to="/audit/trail">Clear event target</Link>
          </div>
          {exactAuditQuery.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading selected audit event…</p> : null}
          {exactAuditQuery.isError ? <p className="mt-2 text-xs text-red-700">Selected audit event unavailable.</p> : null}
          {!exactAuditQuery.isLoading && !exactAuditQuery.isError && !exactAuditEvent ? <p className="mt-2 text-xs text-gray-500">Audit event not found for this operating company.</p> : null}
          {exactAuditEvent ? (
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
              <div><span className="font-semibold">Event:</span> {exactAuditEvent.event_type}</div>
              <div><span className="font-semibold">When:</span> {fmtDate(exactAuditEvent.created_at)}</div>
              <div>
                <span className="font-semibold">Actor:</span>{" "}
                <EntityLinkOrTombstone kind="user" id={exactAuditEvent.actor_user_id} name={exactAuditEvent.actor_email} noun="User" />
              </div>
              <div><span className="font-semibold">Source:</span> {exactAuditEvent.source ?? "—"}</div>
              <pre className="max-h-56 overflow-auto rounded-sm border bg-white p-2 text-[11px] md:col-span-2">{JSON.stringify(exactAuditEvent.payload, null, 2)}</pre>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Single outer frame — filter row is border-b only (no nested card above ParityTable). */}
      <section
        className="overflow-hidden rounded-sm border border-gray-200 bg-white"
        data-testid="audit-trail-list-frame"
      >
        <div className="grid grid-cols-2 gap-3 border-b border-gray-200 bg-gray-50 p-4 md:grid-cols-4" data-testid="audit-trail-filters">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Module
            <select
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={draft.module}
              onChange={(e) => staged.setDraft((d) => ({ ...d, module: e.target.value }))}
            >
              {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Action / event type
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={draft.action}
              onChange={(e) => staged.setDraft((d) => ({ ...d, action: e.target.value }))}
              placeholder="e.g. invoice.created"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity type
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal"
              value={draft.entityType}
              onChange={(e) => staged.setDraft((d) => ({ ...d, entityType: e.target.value }))}
              placeholder="e.g. invoice"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Entity ID (UUID)
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={draft.entityId}
              onChange={(e) => staged.setDraft((d) => ({ ...d, entityId: e.target.value }))}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Actor user ID
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={draft.actorUserId}
              onChange={(e) => staged.setDraft((d) => ({ ...d, actorUserId: e.target.value }))}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Correlation ID
            <input
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal font-mono"
              value={draft.correlationId}
              onChange={(e) => staged.setDraft((d) => ({ ...d, correlationId: e.target.value }))}
              placeholder="uuid"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            From
            <DateTimePicker
              className="normal-case font-normal"
              aria-label="From date"
              value={isoToDateTimeLocalValue(draft.from)}
              onChange={(v) => staged.setDraft((d) => ({ ...d, from: v ? new Date(v).toISOString() : "" }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            To
            <DateTimePicker
              className="normal-case font-normal"
              aria-label="To date"
              value={isoToDateTimeLocalValue(draft.to)}
              onChange={(v) => staged.setDraft((d) => ({ ...d, to: v ? new Date(v).toISOString() : "" }))}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 px-4 pb-3">
          <button
            type="button"
            data-testid="audit-trail-filter-apply"
            onClick={staged.apply}
            disabled={!staged.dirty}
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            data-testid="audit-trail-filter-cancel"
            onClick={staged.cancel}
            disabled={!staged.dirty}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="audit-trail-filter-reset"
            onClick={() => {
              staged.cancel();
              setAppliedFilters({
                module: "",
                action: "",
                entityType: "",
                entityId: "",
                actorUserId: "",
                correlationId: "",
                from: "",
                to: "",
              });
              setOffset(0);
            }}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Reset
          </button>
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
          <button type="button" disabled={currentPage <= 1} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">← Previous</button>
          <span className="text-xs text-gray-600">Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setOffset((o) => o + PAGE_SIZE)} className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  );
}

export default AuditTrailPage;
