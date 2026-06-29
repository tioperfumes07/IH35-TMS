import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { getQboReconciliation, type ReconFinding, type ReconObject } from "../../api/qbo-recon";

const FLAG = "TMS_QBO_RECON_UI_ENABLED";

const fmtCents = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtTs = (s: string | null) => (s ? new Date(s).toLocaleString("en-US") : "—");
const titleize = (s: string) => s.replace(/_/g, " ");

function SyncPill({ inSync }: { inSync: boolean }) {
  return inSync ? (
    <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      In sync
    </span>
  ) : (
    <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
      Drift
    </span>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  important: "bg-slate-100 text-slate-700",
  cleanup: "bg-gray-100 text-gray-600",
};

export function QboReconciliationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FLAG, operatingCompanyId || undefined);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["qbo-recon", operatingCompanyId],
    queryFn: () => getQboReconciliation(operatingCompanyId),
    enabled: Boolean(selectedCompanyId) && enabled,
  });

  const objects = data?.objects ?? [];
  const balances = useMemo(() => objects.filter((o) => o.balance), [objects]);
  const findings = data?.findings ?? [];
  const visibleFindings = useMemo(() => {
    if (!selectedObject) return findings;
    const key = selectedObject.replace(/s$/, "");
    return findings.filter((f) => f.mirror_category.toLowerCase().includes(key));
  }, [findings, selectedObject]);

  const allInSync = objects.length > 0 && objects.every((o) => o.count_in_sync) && balances.every((b) => b.balance!.in_sync);

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="TMS ↔ QBO Reconciliation" subtitle="Daily count & balance agreement between TMS and QuickBooks">
        <div className="rounded border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          The daily TMS ↔ QBO reconciliation screen is not yet enabled for this account.
          <p className="mt-1 text-xs text-gray-400">Enable the {FLAG} feature flag to use this module.</p>
        </div>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper
      title="TMS ↔ QBO Reconciliation"
      subtitle="Daily count & balance agreement between TMS and QuickBooks (read-only — display only)"
    >
      {isLoading || flagLoading ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">Failed to load reconciliation.</p>
      ) : (
        <div className="space-y-5">
          {/* Sync state / last run */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
            <div>
              <span className="text-gray-400">Overall: </span>
              {allInSync ? (
                <span className="font-semibold text-slate-700">All objects in sync</span>
              ) : (
                <span className="font-semibold text-red-700">Drift detected</span>
              )}
            </div>
            <div>
              <span className="text-gray-400">Last reconciliation run: </span>
              <span className="font-medium">{fmtTs(data?.sync_state.last_successful_tick_at ?? null)}</span>
              {data?.sync_state.last_run_status && (
                <span className="ml-1 text-gray-400">({titleize(data.sync_state.last_run_status)})</span>
              )}
            </div>
            <div>
              <span className="text-gray-400">QBO remote counts: </span>
              <span className="font-medium">
                {data?.sync_state.remote_counts_available ? "available" : "not collected"}
              </span>
              {data?.sync_state.remote_counts_last_success_at && (
                <span className="ml-1 text-gray-400">· {fmtTs(data.sync_state.remote_counts_last_success_at)}</span>
              )}
            </div>
            <div>
              <span className="text-gray-400">Open findings: </span>
              <span className={`font-semibold ${(data?.open_findings_count ?? 0) > 0 ? "text-red-700" : "text-slate-700"}`}>
                {data?.open_findings_count ?? 0}
              </span>
            </div>
          </div>

          {/* Per-object count reconciliation */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-800">Object counts</h2>
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Object", "TMS", "QBO (mirror)", "QBO (remote API)", "Δ vs " , "Status", ""].map((h, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {objects.map((o: ReconObject) => (
                    <tr
                      key={o.object}
                      className={`hover:bg-gray-50 ${selectedObject === o.object ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-3 py-2 font-medium text-gray-800">{o.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(o.tms_count)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtNum(o.qbo_mirror_count)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        {o.qbo_remote_count != null ? fmtNum(o.qbo_remote_count) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={o.count_delta !== 0 ? "font-semibold text-red-600" : "text-gray-400"}>
                          {o.count_delta > 0 ? `+${o.count_delta}` : o.count_delta}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">{o.reference}</span>
                      </td>
                      <td className="px-3 py-2">
                        <SyncPill inSync={o.count_in_sync} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setSelectedObject(selectedObject === o.object ? null : o.object)}
                          className="text-xs text-slate-600 hover:underline"
                        >
                          {selectedObject === o.object ? "Clear" : "Findings"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {objects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-400">
                        No reconciliation data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Δ compares TMS against the authoritative QBO remote-API count when collected, otherwise the local QBO mirror.
            </p>
          </div>

          {/* Balance reconciliation (AR / AP) */}
          {balances.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-gray-800">Balance reconciliation</h2>
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Balance", "TMS", "QBO (mirror)", "Δ", "Status"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {balances.map((o) => {
                      const b = o.balance!;
                      return (
                        <tr key={o.object} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{b.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtCents(b.tms_cents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtCents(b.qbo_cents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className={b.delta_cents !== 0 ? "font-semibold text-red-600" : "text-gray-400"}>
                              {fmtCents(b.delta_cents)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <SyncPill inSync={b.in_sync} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Findings drill-down */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">
                Reconciliation findings{selectedObject ? ` · ${selectedObject}` : ""}
              </h2>
              {selectedObject && (
                <button onClick={() => setSelectedObject(null)} className="text-xs text-slate-600 hover:underline">
                  show all
                </button>
              )}
            </div>
            {visibleFindings.length === 0 ? (
              <div className="rounded border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
                {findings.length === 0
                  ? "No reconciliation findings recorded. A reconciliation run populates this list."
                  : "No findings for the selected object."}
              </div>
            ) : (
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Type", "Category", "Severity", "Status", "Drift", "Detected", "Last seen"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {visibleFindings.map((f: ReconFinding) => (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap capitalize">{titleize(f.finding_type)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{titleize(f.mirror_category)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[f.severity] ?? "bg-gray-100 text-gray-600"}`}>
                            {titleize(f.severity)}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap capitalize text-gray-600">{titleize(f.status)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-gray-600">
                          {f.drift_metric_abs != null ? fmtNum(f.drift_metric_abs) : "—"}
                          {f.drift_metric_pct != null ? ` (${f.drift_metric_pct}%)` : ""}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtTs(f.detected_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtTs(f.last_seen_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-400">
              Read-only. Triggering a reconciliation run or resolving a finding is out of scope for this screen.
            </p>
          </div>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default QboReconciliationPage;
