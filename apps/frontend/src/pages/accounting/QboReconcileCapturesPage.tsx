// FIN-23 — QBO Reconcile / Modify Captures (READ-ONLY surfacing).
// Surfaces sync health, modify captures (changes made directly in QBO), and conflicts/alerts.
// No resolve/apply: this page only reads and displays. Gated behind QBO_RECONCILE_UI_ENABLED.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import {
  getQboReconcileOverview,
  getQboModifyCaptures,
  getQboConflicts,
  type QboModifyCapture,
  type QboSyncConflict,
} from "../../api/qbo-reconcile";

const FLAG = "QBO_RECONCILE_UI_ENABLED";
const SELECT_CLASS = "h-9 rounded border border-gray-300 px-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-slate-400";

const fmtDt = (s: string | null) => (s ? new Date(s).toLocaleString("en-US") : "—");
const titleize = (s: string | null) => (s ? s.replace(/_/g, " ") : "—");

const STATUS_PILL: Record<string, string> = {
  applied: "bg-slate-100 text-slate-700",
  received: "bg-gray-100 text-gray-600",
  fetched: "bg-gray-100 text-gray-600",
  conflict: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
  duplicate: "bg-gray-100 text-gray-500",
};
const SEVERITY_PILL: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  info: "bg-gray-100 text-gray-600",
  medium: "bg-amber-100 text-amber-800",
  warn: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700",
  critical: "bg-red-100 text-red-700",
};

function Pill({ map, value }: { map: Record<string, string>; value: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${map[value] ?? "bg-gray-100 text-gray-600"}`}>
      {titleize(value)}
    </span>
  );
}

type Tab = "overview" | "captures" | "conflicts";

function OverviewTab({ companyId }: { companyId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["qbo-reconcile-overview", companyId],
    queryFn: () => getQboReconcileOverview(companyId),
    enabled: Boolean(companyId),
  });

  if (isLoading) return <p className="py-8 text-center text-sm text-gray-500">Loading…</p>;
  if (isError || !data) return <p className="py-8 text-center text-sm text-red-600">Failed to load sync health.</p>;

  const c = data.connection;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Connection</div>
          <div className="text-sm font-semibold text-slate-700">{c.connected ? "Connected" : "Not connected"}</div>
          <div className="mt-0.5 text-xs text-gray-400">Realm {c.realm_id ?? "—"}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Last QBO poll</div>
          <div className="text-sm font-semibold text-slate-700">{fmtDt(data.last_polled_at)}</div>
          <div className="mt-0.5 text-xs text-gray-400">Last used {fmtDt(c.last_used_at)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Queue depth</div>
          <div className="text-sm font-semibold text-slate-700">{data.queue_depth.toLocaleString()}</div>
          <div className="mt-0.5 text-xs text-gray-400">Pending outbound</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Entities drifting</div>
          <div className={`text-sm font-semibold ${data.drift_count > 0 ? "text-red-700" : "text-slate-700"}`}>
            {data.drift_count}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">Local vs QBO count mismatch</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Entity", "Local", "QBO", "Pending", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {data.health.map((row) => (
              <tr key={row.entity} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium capitalize">{titleize(row.entity)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.local_count ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.qbo_count ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.pending_count ?? 0}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                    row.drift === "drift" ? "bg-red-100 text-red-700" : row.drift === "in_sync" ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-500"
                  }`}>{titleize(row.drift)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapturesTab({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
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

      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">Failed to load modify captures.</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">No QBO modify captures recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Received", "Entity", "QBO ID", "Event", "QBO Updated", "Reflected in TMS", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDt(row.received_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap capitalize">{titleize(row.qbo_entity_type)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-500">{row.qbo_entity_id ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap capitalize text-gray-600">{titleize(row.qbo_event_type)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDt(row.qbo_last_updated_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {row.applied_at ? (
                      <span>{fmtDt(row.applied_at)}<span className="ml-1 text-xs text-gray-400">{titleize(row.applied_to_tms_entity_table)}</span></span>
                    ) : (
                      <span className="text-xs text-gray-400">Not reflected</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Pill map={STATUS_PILL} value={row.status} />
                    {row.error_message && <div className="mt-0.5 max-w-[220px] truncate text-xs text-red-600" title={row.error_message}>{row.error_message}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total} className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}

function snapshotPairs(conflict: QboSyncConflict): Array<{ field: string; tms: unknown; qbo: unknown }> {
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

function ConflictsTab({ companyId }: { companyId: string }) {
  const [openOnly, setOpenOnly] = useState(true);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["qbo-conflicts", companyId, openOnly],
    queryFn: () => getQboConflicts({ operating_company_id: companyId, open_only: openOnly ? "true" : "false", limit: 100, alert_limit: 50 }),
    enabled: Boolean(companyId),
  });

  if (isLoading) return <p className="py-8 text-center text-sm text-gray-500">Loading…</p>;
  if (isError || !data) return <p className="py-8 text-center text-sm text-red-600">Failed to load conflicts.</p>;

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="h-4 w-4" />
        Open conflicts only
      </label>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Sync Conflicts ({data.conflicts_total})</h3>
        {data.conflicts.length === 0 ? (
          <p className="rounded border border-gray-200 bg-white py-8 text-center text-sm text-gray-400">No conflicts.</p>
        ) : (
          <div className="space-y-3">
            {data.conflicts.map((conflict) => (
              <div key={conflict.id} className="rounded border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-sm font-medium text-gray-800">
                    <span className="capitalize">{titleize(conflict.entity_type)}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500">{conflict.qbo_id ?? conflict.entity_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill map={SEVERITY_PILL} value={conflict.severity} />
                    <span className="text-xs text-gray-500">{conflict.resolved_at ? `Resolved ${fmtDt(conflict.resolved_at)}` : `Detected ${fmtDt(conflict.detected_at)}`}</span>
                  </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-white">
                    <tr>
                      {["Field", "TMS (local)", "QBO (remote)"].map((h) => (
                        <th key={h} className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {snapshotPairs(conflict).map((p) => (
                      <tr key={p.field}>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{titleize(p.field)}</td>
                        <td className="px-3 py-1.5 text-gray-600">{fmtVal(p.tms)}</td>
                        <td className="px-3 py-1.5 text-gray-600">{fmtVal(p.qbo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Reconciliation Alerts ({data.alerts.length})</h3>
        {data.alerts.length === 0 ? (
          <p className="rounded border border-gray-200 bg-white py-8 text-center text-sm text-gray-400">No reconciliation alerts.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Run at", "Entity", "Local", "QBO", "Delta %", "Severity"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.alerts.map((a) => (
                  <tr key={a.uuid} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDt(a.run_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap capitalize">{titleize(a.entity_type)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.local_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.qbo_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.delta_pct}</td>
                    <td className="px-3 py-2"><Pill map={SEVERITY_PILL} value={a.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function QboReconcileCapturesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FLAG, companyId || undefined);
  const [tab, setTab] = useState<Tab>("overview");

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="QBO Reconcile" subtitle="QuickBooks sync health, modify captures, and conflicts">
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
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
  ];

  return (
    <AccountingSubNavWrapper title="QBO Reconcile" subtitle="QuickBooks sync health, changes made directly in QBO, and conflicts (read-only)">
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-slate-700 text-slate-800" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {flagLoading || !companyId ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : tab === "overview" ? (
        <OverviewTab companyId={companyId} />
      ) : tab === "captures" ? (
        <CapturesTab companyId={companyId} />
      ) : (
        <ConflictsTab companyId={companyId} />
      )}
    </AccountingSubNavWrapper>
  );
}

export default QboReconcileCapturesPage;
