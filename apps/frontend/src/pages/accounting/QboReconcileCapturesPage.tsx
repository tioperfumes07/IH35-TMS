// FIN-23 — QBO Reconcile / Modify Captures (READ-ONLY surfacing).
// Surfaces sync health, modify captures (changes made directly in QBO), and conflicts/alerts.
// No resolve/apply: this page only reads and displays. Gated behind QBO_RECONCILE_UI_ENABLED.
// Display-only ParityTable migration: all hand-rolled table markup replaced by the shared
// ParityTable grammar. No API call, query key, or mutation change — this surface stays read-only.
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import {
  getQboReconcileOverview,
  getQboModifyCaptures,
  getQboConflicts,
  type QboModifyCapture,
  type QboReconAlert,
  type QboSyncConflict,
  type QboSyncHealthRow,
} from "../../api/qbo-reconcile";
import { fetchReconRuns, fetchReconExceptions, type ReconRun, type ReconExceptionRow } from "../../api/recon";
import { ApiError } from "../../api/client";

const FLAG = "QBO_RECONCILE_UI_ENABLED";
const SELECT_CLASS = "h-9 rounded-sm border border-gray-300 px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-slate-400";

const fmtDt = (s: string | null) => (s ? new Date(s).toLocaleString("en-US") : "—");
const titleize = (s: string | null) => (s ? s.replace(/_/g, " ") : "—");
const errorStatus = (e: unknown) => (e instanceof ApiError ? e.status : 0);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : undefined);

const STATUS_PILL: Record<string, string> = {
  applied: "bg-slate-100 text-slate-700",
  received: "bg-gray-100 text-gray-600",
  fetched: "bg-gray-100 text-gray-600",
  conflict: "bg-slate-100 text-slate-700",
  error: "bg-red-100 text-red-700",
  duplicate: "bg-gray-100 text-gray-500",
};
const SEVERITY_PILL: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  info: "bg-gray-100 text-gray-600",
  medium: "bg-slate-100 text-slate-700",
  warn: "bg-slate-100 text-slate-700",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700",
};

function Pill({ map, value }: { map: Record<string, string>; value: string }) {
  return (
    <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${map[value] ?? "bg-gray-100 text-gray-600"}`}>
      {titleize(value)}
    </span>
  );
}

/** Map TMS entity_type / applied_to_tms_entity_table to a resolvable EntityLink kind (local ids only). */
function tmsEntityKind(entityTypeOrTable: string | null | undefined): EntityKind | null {
  const raw = (entityTypeOrTable ?? "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("invoice")) return "invoice";
  if (raw.includes("bill_payment") || raw === "payment" || raw === "customer_payment") return "payment";
  if (raw.includes("bill")) return "bill";
  if (raw.includes("expense")) return "expense";
  if (raw.includes("settlement")) return "settlement";
  if (raw.includes("journal")) return "journal_entry";
  if (raw.includes("vendor")) return "vendor";
  if (raw.includes("customer")) return "customer";
  if (raw.includes("driver") && !raw.includes("advance")) return "driver";
  if (raw.includes("unit")) return "unit";
  if (raw.includes("trailer")) return "trailer";
  if (raw.includes("work_order") || raw.includes("workorder")) return "work_order";
  if (raw.includes("factoring")) return "factoring_advance";
  if (raw.includes("bank_transaction") || raw.includes("bank_tx")) return "bank_transaction";
  return null;
}

function TmsEntityLink({
  entityType,
  entityId,
  label,
}: {
  entityType: string | null | undefined;
  entityId: string | null | undefined;
  label?: ReactNode;
}) {
  const kind = tmsEntityKind(entityType);
  if (!kind || !entityId) {
    return <>{label ?? entityId ?? "—"}</>;
  }
  return <EntityLink kind={kind} id={entityId} label={label ?? entityLabel(null, entityId, "Record")} />;
}

type Tab = "overview" | "captures" | "conflicts" | "runs" | "exceptions";
const QBO_RECONCILE_TAB_IDS = new Set<string>(["overview", "captures", "conflicts", "runs", "exceptions"]);

export function parseQboReconcileTab(raw: string | null): Tab {
  if (raw && QBO_RECONCILE_TAB_IDS.has(raw)) return raw as Tab;
  return "overview";
}

const HEALTH_COLUMNS: Array<ParityColumn<QboSyncHealthRow>> = [
  {
    key: "entity",
    label: "Entity",
    sortable: true,
    cellClass: "font-medium capitalize",
    render: (row) => titleize(row.entity),
  },
  {
    key: "local_count",
    label: "Local",
    sortable: true,
    cellClass: "text-right tabular-nums",
    render: (row) => row.local_count ?? "—",
  },
  {
    key: "qbo_count",
    label: "QBO",
    sortable: true,
    cellClass: "text-right tabular-nums",
    render: (row) => row.qbo_count ?? "—",
  },
  {
    key: "pending_count",
    label: "Pending",
    sortable: true,
    cellClass: "text-right tabular-nums",
    render: (row) => row.pending_count ?? 0,
  },
  {
    key: "drift",
    label: "Status",
    sortable: true,
    render: (row) => (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        row.drift === "drift" ? "bg-red-100 text-red-700" : row.drift === "in_sync" ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-500"
      }`}>{titleize(row.drift)}</span>
    ),
  },
];

function OverviewTab({ companyId }: { companyId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qbo-reconcile-overview", companyId],
    queryFn: () => getQboReconcileOverview(companyId),
    enabled: Boolean(companyId),
  });

  if (isLoading) return <p className="py-8 text-center text-xs text-gray-500">Loading…</p>;
  if (isError || !data) {
    return (
      <ListErrorState
        title="Failed to load sync health."
        status={errorStatus(error)}
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  const c = data.connection;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Connection</div>
          <div className="text-xs font-semibold text-slate-700">{c.connected ? "Connected" : "Not connected"}</div>
          <div className="mt-0.5 text-xs text-gray-400">Realm {c.realm_id ?? "—"}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Last QBO poll</div>
          <div className="text-xs font-semibold text-slate-700">{fmtDt(data.last_polled_at)}</div>
          <div className="mt-0.5 text-xs text-gray-400">Last used {fmtDt(c.last_used_at)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Queue depth</div>
          <div className="text-xs font-semibold text-slate-700">{data.queue_depth.toLocaleString()}</div>
          <div className="mt-0.5 text-xs text-gray-400">Pending outbound</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Entities drifting</div>
          <div className={`text-xs font-semibold ${data.drift_count > 0 ? "text-red-700" : "text-slate-700"}`}>
            {data.drift_count}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">Local vs QBO count mismatch</div>
        </div>
      </div>

      <ParityTable
        rows={data.health}
        columns={HEALTH_COLUMNS}
        rowKey={(row) => row.entity}
        emptyText="No sync health rows."
        storageKey="qbo-reconcile-sync-health"
        tableTestId="qbo-reconcile-sync-health-table"
      />
    </div>
  );
}

const CAPTURE_COLUMNS: Array<ParityColumn<QboModifyCapture>> = [
  {
    key: "received_at",
    label: "Received",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-600",
    render: (row) => fmtDt(row.received_at),
  },
  {
    key: "qbo_entity_type",
    label: "Entity",
    sortable: true,
    cellClass: "whitespace-nowrap capitalize",
    render: (row) => titleize(row.qbo_entity_type),
  },
  {
    key: "qbo_entity_id",
    label: "QBO ID",
    cellClass: "whitespace-nowrap font-mono text-xs text-gray-500",
    render: (row) => row.qbo_entity_id ?? "—",
  },
  {
    key: "qbo_event_type",
    label: "Event",
    sortable: true,
    cellClass: "whitespace-nowrap capitalize text-gray-600",
    render: (row) => titleize(row.qbo_event_type),
  },
  {
    key: "qbo_last_updated_at",
    label: "QBO Updated",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-600",
    render: (row) => fmtDt(row.qbo_last_updated_at),
  },
  {
    key: "applied_at",
    label: "Reflected in TMS",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-600",
    render: (row) =>
      row.applied_at ? (
        <span>
          {fmtDt(row.applied_at)}
          {row.applied_to_tms_entity_id ? (
            <span className="ml-1 text-xs text-gray-600">
              <TmsEntityLink
                entityType={row.applied_to_tms_entity_table ?? row.qbo_entity_type}
                entityId={row.applied_to_tms_entity_id}
                label={entityLabel(null, row.applied_to_tms_entity_id, "TMS entity")}
              />
            </span>
          ) : row.applied_to_tms_entity_table ? (
            <span className="ml-1 text-xs text-gray-400">{titleize(row.applied_to_tms_entity_table)}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-xs text-gray-400">Not reflected</span>
      ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    cellClass: "whitespace-nowrap",
    render: (row) => (
      <>
        <Pill map={STATUS_PILL} value={row.status} />
        {row.error_message && <div className="mt-0.5 max-w-[220px] truncate text-xs text-red-600" title={row.error_message}>{row.error_message}</div>}
      </>
    ),
  },
];

function CapturesTab({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qbo-modify-captures", companyId, status, offset],
    queryFn: () => getQboModifyCaptures({ operating_company_id: companyId, status: status || undefined, limit, offset }),
    enabled: Boolean(companyId),
  });

  const items: QboModifyCapture[] = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className={SELECT_CLASS}>
          <option value="">All statuses</option>
          <option value="received">Received</option>
          <option value="fetched">Fetched</option>
          <option value="applied">Applied</option>
          <option value="conflict">Conflict</option>
          <option value="error">Error</option>
          <option value="duplicate">Duplicate</option>
        </select>
        <span className="text-xs text-gray-500">{total.toLocaleString()} capture{total !== 1 ? "s" : ""}</span>
      </div>

      {isError ? (
        <ListErrorState
          title="Failed to load modify captures."
          status={errorStatus(error)}
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      ) : (
        <ParityTable
          rows={items}
          columns={CAPTURE_COLUMNS}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyText="No QBO modify captures recorded."
          initialPageSize={limit}
          pageSizeOptions={[limit, 100, 300]}
          storageKey="qbo-reconcile-captures"
          tableTestId="qbo-reconcile-captures-table"
        />
      )}

      {total > limit && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="rounded-sm border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total} className="rounded-sm border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}

type ConflictFieldPair = { field: string; tms: unknown; qbo: unknown };

function snapshotPairs(conflict: QboSyncConflict): ConflictFieldPair[] {
  const tms = (conflict.tms_snapshot ?? {}) as Record<string, unknown>;
  const qbo = (conflict.qbo_snapshot ?? {}) as Record<string, unknown>;
  const fields = conflict.conflict_fields?.length
    ? conflict.conflict_fields
    : Array.from(new Set([...Object.keys(tms), ...Object.keys(qbo)]));
  return fields.map((field) => ({ field, tms: tms[field], qbo: qbo[field] }));
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const CONFLICT_FIELD_COLUMNS: Array<ParityColumn<ConflictFieldPair>> = [
  {
    key: "field",
    label: "Field",
    sortable: true,
    cellClass: "font-medium text-gray-700",
    render: (pair) => titleize(pair.field),
  },
  {
    key: "tms",
    label: "TMS (local)",
    cellClass: "text-gray-600",
    render: (pair) => fmtVal(pair.tms),
    sortValue: (pair) => fmtVal(pair.tms),
  },
  {
    key: "qbo",
    label: "QBO (remote)",
    cellClass: "text-gray-600",
    render: (pair) => fmtVal(pair.qbo),
    sortValue: (pair) => fmtVal(pair.qbo),
  },
];

const ALERT_COLUMNS: Array<ParityColumn<QboReconAlert>> = [
  {
    key: "run_at",
    label: "Run at",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-600",
    render: (a) => fmtDt(a.run_at),
  },
  {
    key: "entity_type",
    label: "Entity",
    sortable: true,
    cellClass: "whitespace-nowrap capitalize",
    render: (a) => titleize(a.entity_type),
  },
  {
    key: "local_count",
    label: "Local",
    sortable: true,
    cellClass: "text-right tabular-nums",
  },
  {
    key: "qbo_count",
    label: "QBO",
    sortable: true,
    cellClass: "text-right tabular-nums",
  },
  {
    key: "delta_pct",
    label: "Delta %",
    sortable: true,
    cellClass: "text-right tabular-nums",
  },
  {
    key: "severity",
    label: "Severity",
    sortable: true,
    render: (a) => <Pill map={SEVERITY_PILL} value={a.severity} />,
  },
];

function ConflictsTab({ companyId }: { companyId: string }) {
  const [openOnly, setOpenOnly] = useState(true);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qbo-conflicts", companyId, openOnly],
    queryFn: () => getQboConflicts({ operating_company_id: companyId, open_only: openOnly ? "true" : "false", limit: 100, alert_limit: 50 }),
    enabled: Boolean(companyId),
  });

  if (isLoading) return <p className="py-8 text-center text-xs text-gray-500">Loading…</p>;
  if (isError || !data) {
    return (
      <ListErrorState
        title="Failed to load conflicts."
        status={errorStatus(error)}
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="h-4 w-4" />
        Open conflicts only
      </label>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-slate-700">Sync Conflicts ({data.conflicts_total})</h3>
        {data.conflicts.length === 0 ? (
          <p className="rounded-sm border border-gray-200 bg-white py-8 text-center text-xs text-gray-400">No conflicts.</p>
        ) : (
          <div className="space-y-3">
            {data.conflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-sm border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-xs font-medium text-gray-800">
                    <span className="capitalize">{titleize(conflict.entity_type)}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500">
                      <TmsEntityLink
                        entityType={conflict.entity_type}
                        entityId={conflict.entity_id}
                        label={entityLabel(null, conflict.entity_id, "Entity")}
                      />
                    </span>
                    {conflict.qbo_id ? (
                      <span className="ml-2 font-mono text-xs text-gray-400" title="QuickBooks id (no TMS route)">
                        QBO {conflict.qbo_id}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill map={SEVERITY_PILL} value={conflict.severity} />
                    <span className="text-xs text-gray-500">{conflict.resolved_at ? `Resolved ${fmtDt(conflict.resolved_at)}` : `Detected ${fmtDt(conflict.detected_at)}`}</span>
                  </div>
                </div>
                <ParityTable
                  rows={snapshotPairs(conflict)}
                  columns={CONFLICT_FIELD_COLUMNS}
                  rowKey={(pair) => pair.field}
                  emptyText="No conflicting fields."
                  storageKey="qbo-reconcile-conflict-fields"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-slate-700">Reconciliation Alerts ({data.alerts.length})</h3>
        {data.alerts.length === 0 ? (
          <p className="rounded-sm border border-gray-200 bg-white py-8 text-center text-xs text-gray-400">No reconciliation alerts.</p>
        ) : (
          <ParityTable
            rows={data.alerts}
            columns={ALERT_COLUMNS}
            rowKey={(a) => a.uuid}
            emptyText="No reconciliation alerts."
            storageKey="qbo-reconcile-alerts"
            tableTestId="qbo-reconcile-alerts-table"
          />
        )}
      </section>
    </div>
  );
}

// RECON-02 — read-only surfacing of RECON-01 reconciliation runs + exceptions. The routes 404 when the recon
// module (TMS_QBO_RECON_ENABLED) is OFF; we show a hint rather than an error. No resolve/apply here.
function ReconDisabledHint() {
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-4 py-10 text-center text-xs text-gray-500">
      The QBO↔TMS reconciliation module is not enabled for this account.
      <p className="mt-1 text-xs text-gray-400">Reconciliation passes are turned on per operating company and aren’t active for the company you have selected — this is expected, not an error. Contact the owner or an administrator to enable them, or switch to a company where they’re already on.</p>
    </div>
  );
}

function exceptionCount(run: ReconRun): string {
  const t = run.totals as { exceptions?: unknown } | null;
  return typeof t?.exceptions === "number" ? String(t.exceptions) : "—";
}

const RUN_COLUMNS: Array<ParityColumn<ReconRun>> = [
  {
    key: "started_at",
    label: "Started",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-600",
    render: (r) => fmtDt(r.started_at),
  },
  {
    key: "run_type",
    label: "Type",
    sortable: true,
    cellClass: "whitespace-nowrap capitalize",
    render: (r) => titleize(r.run_type),
  },
  {
    key: "window_start",
    label: "Window",
    cellClass: "whitespace-nowrap text-gray-500 text-xs",
    render: (r) => (
      <>
        {fmtDt(r.window_start)} → {fmtDt(r.window_end)}
      </>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (r) => <Pill map={STATUS_PILL} value={r.status} />,
  },
  {
    key: "exceptions",
    label: "Exceptions",
    cellClass: "text-right tabular-nums",
    sortable: true,
    sortValue: (r) => exceptionCount(r),
    render: (r) => exceptionCount(r),
  },
];

function ReconRunsTab({ companyId }: { companyId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recon-runs", companyId],
    queryFn: () => fetchReconRuns(companyId, { limit: 50 }),
    enabled: Boolean(companyId),
    retry: false,
  });
  if (isLoading) return <p className="py-8 text-center text-xs text-gray-500">Loading…</p>;
  if (error instanceof ApiError && error.status === 404) return <ReconDisabledHint />;
  if (error) {
    return (
      <ListErrorState
        title="Couldn’t load reconciliation runs."
        status={errorStatus(error)}
        message={errorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }
  const runs: ReconRun[] = data?.runs ?? [];
  return (
    <ParityTable
      rows={runs}
      columns={RUN_COLUMNS}
      rowKey={(r) => r.id}
      emptyText="No reconciliation runs yet."
      storageKey="qbo-reconcile-recon-runs"
      tableTestId="qbo-reconcile-recon-runs-table"
    />
  );
}

const EXCEPTION_COLUMNS: Array<ParityColumn<ReconExceptionRow>> = [
  {
    key: "exception_class",
    label: "Class",
    sortable: true,
    cellClass: "whitespace-nowrap font-medium capitalize",
    render: (x) => titleize(x.exception_class),
  },
  {
    key: "field",
    label: "Field",
    sortable: true,
    cellClass: "whitespace-nowrap text-gray-600",
    render: (x) => titleize(x.field),
  },
  {
    key: "tms_value",
    label: "TMS",
    cellClass: "text-gray-600",
    render: (x) => x.tms_value ?? "—",
  },
  {
    key: "qbo_value",
    label: "QBO",
    cellClass: "text-gray-600",
    render: (x) => x.qbo_value ?? "—",
  },
  {
    key: "severity",
    label: "Severity",
    sortable: true,
    render: (x) => <Pill map={SEVERITY_PILL} value={x.severity} />,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (x) => <Pill map={STATUS_PILL} value={x.status} />,
  },
];

function ReconExceptionsTab({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recon-exceptions", companyId, status],
    queryFn: () => fetchReconExceptions(companyId, { status: status || undefined, limit: 100 }),
    enabled: Boolean(companyId),
    retry: false,
  });
  if (error instanceof ApiError && error.status === 404) return <ReconDisabledHint />;
  const rows: ReconExceptionRow[] = data?.exceptions ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="explained">Explained</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      {error ? (
        <ListErrorState
          title="Couldn’t load exceptions."
          status={errorStatus(error)}
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={EXCEPTION_COLUMNS}
          rowKey={(x) => x.id}
          loading={isLoading}
          emptyText="No reconciliation exceptions."
          storageKey="qbo-reconcile-recon-exceptions"
          tableTestId="qbo-reconcile-recon-exceptions-table"
        />
      )}
    </div>
  );
}

export function QboReconcileCapturesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FLAG, companyId || undefined);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseQboReconcileTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="QBO Reconcile" subtitle="QuickBooks sync health, modify captures, and conflicts">
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-xs text-gray-500">
          QBO reconcile captures are not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the {FLAG} feature flag to use this read-only module.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Sync Health" },
    { id: "captures", label: "Modify Captures" },
    { id: "conflicts", label: "Conflicts & Alerts" },
    { id: "runs", label: "Recon Runs" },
    { id: "exceptions", label: "Exceptions" },
  ];

  return (
    <AccountingSubNavWrapper title="QBO Reconcile" subtitle="QuickBooks sync health, changes made directly in QBO, and conflicts (read-only)">
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${
              tab === t.id ? "border-slate-700 text-slate-800" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {flagLoading || !companyId ? (
        <p className="py-8 text-center text-xs text-gray-500">Loading…</p>
      ) : tab === "overview" ? (
        <OverviewTab companyId={companyId} />
      ) : tab === "captures" ? (
        <CapturesTab companyId={companyId} />
      ) : tab === "conflicts" ? (
        <ConflictsTab companyId={companyId} />
      ) : tab === "runs" ? (
        <ReconRunsTab companyId={companyId} />
      ) : (
        <ReconExceptionsTab companyId={companyId} />
      )}
    </AccountingSubNavWrapper>
  );
}

export default QboReconcileCapturesPage;
