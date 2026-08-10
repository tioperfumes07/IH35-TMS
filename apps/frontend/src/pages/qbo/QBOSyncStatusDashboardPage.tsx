import { useMemo, useState } from "react";
import { formatDateTimeUS } from "../../lib/formatDate";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  acknowledgeQboSyncAlert,
  dismissQboSyncRun,
  listQboSyncAlerts,
  listQboSyncRuns,
  retryQboSyncRun,
  type QboSyncAlertRecord,
  type QboSyncRunRow,
  type QboSyncRunStatus,
} from "../../api/qbo-integration";
import { CappedListNotice } from "../../components/CappedListNotice";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
// ConflictsTab removed (qbo-sync-detail/ConflictsTab.tsx deleted in orphan-triage batch 11)

function withinHours(iso: string, hours: number) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 3600_000;
}

function statusPill(status: QboSyncRunStatus) {
  const map: Record<QboSyncRunStatus, string> = {
    pending: "bg-amber-100 text-amber-900 border-amber-200",
    running: "bg-slate-100 text-slate-700 border-slate-300",
    success: "bg-emerald-100 text-emerald-900 border-emerald-200",
    failed: "bg-amber-100 text-amber-900 border-amber-200",
    dead_letter: "bg-red-100 text-red-900 border-red-200",
    cancelled: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return map[status] ?? "bg-slate-100 text-slate-800 border-slate-200";
}

function entityHref(kind: string | null | undefined, id: string | null | undefined) {
  if (!kind || !id) return null;
  if (kind === "invoice") return `/accounting/invoices/${id}`;
  if (kind === "bill" || kind === "vendor_bill") return `/accounting/bills`;
  return null;
}

export function QBOSyncStatusDashboardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "conflicts" ? "conflicts" : "runs";
  const setActiveTab = (next: "runs" | "conflicts") => {
    const params = new URLSearchParams(searchParams);
    if (next === "runs") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const runsQuery = useQuery({
    queryKey: ["qbo", "sync-runs", companyId, status, kind, timeRange, search],
    queryFn: () =>
      listQboSyncRuns({
        operating_company_id: companyId,
        status: status || undefined,
        kind: kind || undefined,
        time_range: timeRange,
        search: search.trim() || undefined,
        limit: 200,
      }),
    enabled: Boolean(companyId),
    retry: false,
    refetchInterval: status === "pending" || status === "running" ? 30_000 : false,
  });

  const alertsQuery = useQuery({
    queryKey: ["qbo", "sync-alerts", companyId, "24h"],
    queryFn: () => listQboSyncAlerts({ operating_company_id: companyId, limit: 30, resolved: false }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const runs = runsQuery.data?.runs ?? [];

  const kpis = useMemo(() => {
    const healthy = runs.filter((r) => r.status === "success" && withinHours(r.started_at, 24)).length;
    const pending = runs.filter((r) => r.status === "pending").length;
    const failedRetry = runs.filter((r) => r.status === "failed" && r.retry_count < 5).length;
    const dead = runs.filter((r) => r.status === "dead_letter").length;
    return { healthy, pending, failedRetry, dead };
  }, [runs]);

  const recentAlerts = useMemo(() => {
    const list = alertsQuery.data?.alerts ?? [];
    return [...list]
      .filter((a) => withinHours(a.created_at, 24))
      .sort((a, b) => String(b.severity).localeCompare(String(a.severity)));
  }, [alertsQuery.data?.alerts]);

  const retryMut = useMutation({
    mutationFn: (id: string) => retryQboSyncRun(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qbo", "sync-runs"] });
      pushToast("Retry queued", "success");
    },
    onError: () => pushToast("Retry failed", "error"),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissQboSyncRun(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qbo", "sync-runs"] });
      pushToast("Run dismissed", "success");
    },
    onError: () => pushToast("Dismiss failed", "error"),
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => acknowledgeQboSyncAlert(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qbo", "sync-alerts"] });
      pushToast("Alert acknowledged", "success");
    },
    onError: () => pushToast("Ack failed", "error"),
  });

  const runColumns = useMemo<Array<ParityColumn<QboSyncRunRow>>>(
    () => [
      {
        key: "started_at",
        label: "Started",
        sortable: true,
        render: (r) => r.started_at?.slice(0, 19) ?? "—",
      },
      {
        key: "kind",
        label: "Kind",
        sortable: true,
        cellClass: "font-medium",
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (r) => (
          <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${statusPill(r.status)}`}>{r.status}</span>
        ),
      },
      {
        key: "retry_count",
        label: "Retry#",
        sortable: true,
        className: "text-right",
      },
      {
        key: "last_error",
        label: "Last error",
        cellClass: "max-w-xs truncate text-gray-700",
        render: (r) => r.last_error ?? "—",
      },
      {
        key: "duration_ms",
        label: "Duration",
        sortable: true,
        className: "text-right",
        render: (r) => (r.duration_ms != null ? `${r.duration_ms}ms` : "—"),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        cellClass: "space-x-1",
        render: (r) => (
          <>
            {r.status === "dead_letter" && (
              <Button
                size="sm"
                loading={retryMut.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  retryMut.mutate(r.id);
                }}
              >
                Retry now
              </Button>
            )}
            {r.status === "dead_letter" && (
              <Button
                size="sm"
                variant="secondary"
                loading={dismissMut.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  dismissMut.mutate(r.id);
                }}
              >
                Dismiss
              </Button>
            )}
            {entityHref(r.entity_kind, r.entity_id) ? (
              <Link to={entityHref(r.entity_kind, r.entity_id)!} className="text-slate-700 underline" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                View entity
              </Link>
            ) : null}
          </>
        ),
      },
    ],
    [retryMut, dismissMut],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="QBO sync status" subtitle="Operational console · sync runs and alerts" />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {runsQuery.isError ? <ReportBlockVPendingBanner error={runsQuery.error} onRetry={() => void runsQuery.refetch()} /> : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-emerald-800">Healthy (24h)</div>
          <div className="text-2xl font-semibold text-emerald-900">{kpis.healthy}</div>
        </div>
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-amber-900">Pending</div>
          <div className="text-2xl font-semibold text-amber-950">{kpis.pending}</div>
        </div>
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-amber-900">Failed (retrying)</div>
          <div className="text-2xl font-semibold text-amber-950">{kpis.failedRetry}</div>
        </div>
        <div className="rounded-sm border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-red-900">
            Dead letter
            {kpis.dead > 0 ? (
              <span className="rounded-sm bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">needs attention</span>
            ) : null}
          </div>
          <div className="text-2xl font-semibold text-red-900">{kpis.dead}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-sm border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setActiveTab("runs")}
          className={`rounded px-3 py-1 text-xs font-medium ${
            activeTab === "runs" ? "bg-[#1F2A44] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Sync Runs + Alerts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conflicts")}
          className={`rounded px-3 py-1 text-xs font-medium ${
            activeTab === "conflicts" ? "bg-[#1F2A44] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Conflicts
        </button>
      </div>

      {activeTab === "conflicts" ? <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">Conflicts view has been migrated to the QBO Sync Detail page.</div> : null}
      {activeTab !== "runs" ? null : (
        <>

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Status
          <SelectCombobox
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="dead_letter">dead_letter</option>
            <option value="cancelled">cancelled</option>
          </SelectCombobox>
        </label>
        <label className="text-xs text-gray-600">
          Kind
          <input
            className="mt-1 block h-9 w-40 rounded-sm border border-gray-300 px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="customer_sync…"
          />
        </label>
        <label className="text-xs text-gray-600">
          Time range
          <SelectCombobox
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2 text-sm"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
          >
            <option value="1h">Last hour</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </SelectCombobox>
        </label>
        <label className="text-xs text-gray-600">
          Search
          <input
            className="mt-1 block h-9 w-48 rounded-sm border border-gray-300 px-2 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="error text…"
          />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <ParityTable
          rows={runs}
          columns={runColumns}
          rowKey={(r) => r.id}
          loading={runsQuery.isLoading}
          emptyText="No sync runs found."
          storageKey="qbo-sync-status-runs"
          tableTestId="qbo-sync-runs-table"
          renderExpanded={(r) => (
            <div className="font-mono text-[11px] text-gray-800">
              <div className="mb-1 font-semibold">Payload / diagnostics</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify({ payload: r.payload, stack: r.error_stack }, null, 2)}
              </pre>
            </div>
          )}
        />

        <CappedListNotice
          shown={runs.length}
          limit={200}
          hint="Narrow filters or search for older QBO sync runs."
          className="text-[11px] text-slate-600"
        />

        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
          <div className="text-sm font-semibold">Recent alerts (24h)</div>
          {alertsQuery.isError ? (
            <ReportBlockVPendingBanner error={alertsQuery.error} onRetry={() => void alertsQuery.refetch()} />
          ) : (
            <ul className="max-h-[520px] space-y-2 overflow-auto text-xs">
              {recentAlerts.map((a: QboSyncAlertRecord) => (
                <li key={a.id} className="rounded-sm border border-amber-100 bg-amber-50/60 p-2">
                  <div className="font-semibold text-amber-950">{a.severity}</div>
                  <div className="text-gray-800">{a.message ?? "—"}</div>
                  <div className="text-[10px] text-gray-500">{formatDateTimeUS(a.created_at)}</div>
                  <Button className="mt-1" size="sm" onClick={() => ackMut.mutate(a.id)}>
                    Acknowledge
                  </Button>
                </li>
              ))}
              {recentAlerts.length === 0 ? <li className="text-gray-500">No open alerts.</li> : null}
            </ul>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
