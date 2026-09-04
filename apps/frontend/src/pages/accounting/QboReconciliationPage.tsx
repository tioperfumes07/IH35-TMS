import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { getQboReconciliation, type ReconFinding, type ReconObject } from "../../api/qbo-recon";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { ApiError } from "../../api/client";

const FLAG = "TMS_QBO_RECON_UI_ENABLED";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtTs = (s: string | null) => (s ? new Date(s).toLocaleString("en-US") : "—");
const titleize = (s: string) => s.replace(/_/g, " ");

function SyncPill({ inSync }: { inSync: boolean }) {
  return inSync ? (
    <span className="inline-flex items-center rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
      In sync
    </span>
  ) : (
    <span className="inline-flex items-center rounded-sm bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
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

  const { data, isLoading, isError, error, refetch } = useQuery({
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

  // Column order, labels, formatting, and the Findings toggle button preserved 1:1 from the
  // former hand-rolled table markup (display-only migration — no data/posting logic changed).
  const objectColumns = useMemo<Array<ParityColumn<ReconObject>>>(
    () => [
      {
        key: "label",
        label: "Object",
        render: (o) => <span className="font-medium text-gray-800">{o.label}</span>,
      },
      {
        key: "tms_count",
        label: "TMS",
        cellClass: "text-right tabular-nums",
        render: (o) => fmtNum(o.tms_count),
      },
      {
        key: "qbo_mirror_count",
        label: "QBO (mirror)",
        cellClass: "text-right tabular-nums text-gray-600",
        render: (o) => fmtNum(o.qbo_mirror_count),
      },
      {
        key: "qbo_remote_count",
        label: "QBO (remote API)",
        cellClass: "text-right tabular-nums text-gray-600",
        render: (o) =>
          o.qbo_remote_count != null ? fmtNum(o.qbo_remote_count) : <span className="text-gray-300">—</span>,
      },
      {
        key: "count_delta",
        label: "Δ vs ",
        cellClass: "text-right tabular-nums",
        render: (o) => (
          <>
            <span className={o.count_delta !== 0 ? "font-semibold text-red-600" : "text-gray-400"}>
              {o.count_delta > 0 ? `+${o.count_delta}` : o.count_delta}
            </span>
            <span className="ml-1 text-xs text-gray-400">{o.reference}</span>
          </>
        ),
      },
      {
        key: "count_in_sync",
        label: "Status",
        render: (o) => <SyncPill inSync={o.count_in_sync} />,
      },
      {
        key: "findings_toggle",
        label: "",
        cellClass: "text-right",
        render: (o) => (
          <button
            onClick={() => setSelectedObject(selectedObject === o.object ? null : o.object)}
            className="text-xs text-slate-600 hover:underline"
          >
            {selectedObject === o.object ? "Clear" : "Findings"}
          </button>
        ),
      },
    ],
    [selectedObject],
  );

  const balanceColumns = useMemo<Array<ParityColumn<ReconObject>>>(
    () => [
      {
        key: "balance_label",
        label: "Balance",
        render: (o) => <span className="font-medium text-gray-800">{o.balance!.label}</span>,
      },
      {
        key: "balance_tms_cents",
        label: "TMS",
        cellClass: "text-right tabular-nums",
        render: (o) => fmtCents(o.balance!.tms_cents),
      },
      {
        key: "balance_qbo_cents",
        label: "QBO (mirror)",
        cellClass: "text-right tabular-nums text-gray-600",
        render: (o) => fmtCents(o.balance!.qbo_cents),
      },
      {
        key: "balance_delta_cents",
        label: "Δ",
        cellClass: "text-right tabular-nums",
        render: (o) => (
          <span className={o.balance!.delta_cents !== 0 ? "font-semibold text-red-600" : "text-gray-400"}>
            {fmtCents(o.balance!.delta_cents)}
          </span>
        ),
      },
      {
        key: "balance_in_sync",
        label: "Status",
        render: (o) => <SyncPill inSync={o.balance!.in_sync} />,
      },
    ],
    [],
  );

  const findingColumns = useMemo<Array<ParityColumn<ReconFinding>>>(
    () => [
      {
        key: "finding_type",
        label: "Type",
        cellClass: "whitespace-nowrap capitalize",
        render: (f) => titleize(f.finding_type),
      },
      {
        key: "mirror_category",
        label: "Category",
        cellClass: "whitespace-nowrap text-gray-600",
        render: (f) => titleize(f.mirror_category),
      },
      {
        key: "severity",
        label: "Severity",
        cellClass: "whitespace-nowrap",
        render: (f) => (
          <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[f.severity] ?? "bg-gray-100 text-gray-600"}`}>
            {titleize(f.severity)}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        cellClass: "whitespace-nowrap capitalize text-gray-600",
        render: (f) => titleize(f.status),
      },
      {
        key: "drift_metric_abs",
        label: "Drift",
        cellClass: "whitespace-nowrap text-right tabular-nums text-gray-600",
        render: (f) => (
          <>
            {f.drift_metric_abs != null ? fmtNum(f.drift_metric_abs) : "—"}
            {f.drift_metric_pct != null ? ` (${f.drift_metric_pct}%)` : ""}
          </>
        ),
      },
      {
        key: "detected_at",
        label: "Detected",
        cellClass: "whitespace-nowrap text-gray-500",
        render: (f) => fmtTs(f.detected_at),
      },
      {
        key: "last_seen_at",
        label: "Last seen",
        cellClass: "whitespace-nowrap text-gray-500",
        render: (f) => fmtTs(f.last_seen_at),
      },
    ],
    [],
  );

  if (!flagLoading && !enabled) {
    return (
      <AccountingSubNavWrapper title="TMS ↔ QBO Reconciliation" subtitle="Daily count & balance agreement between TMS and QuickBooks">
        <div className="rounded-sm border border-gray-200 bg-white px-4 py-12 text-center text-xs text-gray-500">
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
        <p className="py-8 text-center text-xs text-gray-500">Loading…</p>
      ) : isError ? (
        <ListErrorState
          title="Failed to load reconciliation."
          status={error instanceof ApiError ? error.status : 0}
          message={(error as Error | null)?.message}
          onRetry={() => void refetch()}
        />
      ) : (
        <div className="space-y-5">
          {/* Sync state / last run */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
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
            <h2 className="mb-2 text-xs font-semibold text-gray-800">Object counts</h2>
            <ParityTable<ReconObject>
              columns={objectColumns}
              rows={objects}
              rowKey={(o) => o.object}
              emptyText="No reconciliation data available."
              storageKey="qbo-recon-object-counts"
              tableTestId="qbo-recon-object-counts-table"
              rowClassName={(o) => `hover:bg-gray-50 ${selectedObject === o.object ? "bg-slate-50" : ""}`}
            />
            <p className="mt-1 text-xs text-gray-400">
              Δ compares TMS against the authoritative QBO remote-API count when collected, otherwise the local QBO mirror.
            </p>
          </div>

          {/* Balance reconciliation (AR / AP) */}
          {balances.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold text-gray-800">Balance reconciliation</h2>
              <ParityTable<ReconObject>
                columns={balanceColumns}
                rows={balances}
                rowKey={(o) => o.object}
                storageKey="qbo-recon-balances"
                tableTestId="qbo-recon-balances-table"
                rowClassName={() => "hover:bg-gray-50"}
              />
            </div>
          )}

          {/* Findings drill-down */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xs font-semibold text-gray-800">
                Reconciliation findings{selectedObject ? ` · ${selectedObject}` : ""}
              </h2>
              {selectedObject && (
                <button onClick={() => setSelectedObject(null)} className="text-xs text-slate-600 hover:underline">
                  show all
                </button>
              )}
            </div>
            {visibleFindings.length === 0 ? (
              <div className="rounded-sm border border-gray-200 bg-white px-4 py-8 text-center text-xs text-gray-400">
                {findings.length === 0
                  ? "No reconciliation findings recorded. A reconciliation run populates this list."
                  : "No findings for the selected object."}
              </div>
            ) : (
              <ParityTable<ReconFinding>
                columns={findingColumns}
                rows={visibleFindings}
                rowKey={(f) => f.id}
                storageKey="qbo-recon-findings"
                tableTestId="qbo-recon-findings-table"
                rowClassName={() => "hover:bg-gray-50"}
              />
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
