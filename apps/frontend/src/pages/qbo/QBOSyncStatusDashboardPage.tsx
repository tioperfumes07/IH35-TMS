import { Fragment, useMemo, useState } from "react";
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
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";

function withinHours(iso: string, hours: number) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 3600_000;
}

function statusPill(status: QboSyncRunStatus) {
  const map: Record<QboSyncRunStatus, string> = {
    pending: "bg-amber-100 text-amber-900 border-amber-200",
    running: "bg-blue-100 text-blue-900 border-blue-200",
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="QBO sync status" subtitle="Operational console · sync runs and alerts" />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {runsQuery.isError ? <ReportBlockVPendingBanner error={runsQuery.error} onRetry={() => void runsQuery.refetch()} /> : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-emerald-800">Healthy (24h)</div>
          <div className="text-2xl font-semibold text-emerald-900">{kpis.healthy}</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-amber-900">Pending</div>
          <div className="text-2xl font-semibold text-amber-950">{kpis.pending}</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-amber-900">Failed (retrying)</div>
          <div className="text-2xl font-semibold text-amber-950">{kpis.failedRetry}</div>
        </div>
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-red-900">
            Dead letter
            {kpis.dead > 0 ? (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">needs attention</span>
            ) : null}
          </div>
          <div className="text-2xl font-semibold text-red-900">{kpis.dead}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Status
          <select
            className="mt-1 block h-9 rounded border border-gray-300 px-2 text-sm"
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
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Kind
          <input
            className="mt-1 block h-9 w-40 rounded border border-gray-300 px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="customer_sync…"
          />
        </label>
        <label className="text-xs text-gray-600">
          Time range
          <select
            className="mt-1 block h-9 rounded border border-gray-300 px-2 text-sm"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
          >
            <option value="1h">Last hour</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Search
          <input
            className="mt-1 block h-9 w-48 rounded border border-gray-300 px-2 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="error text…"
          />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="overflow-auto rounded border border-gray-200 bg-white">
          {runsQuery.isLoading ? <p className="p-3 text-sm text-gray-500">Loading sync runs…</p> : null}
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
              <tr>
                <th className="px-2 py-2">Started</th>
                <th className="px-2 py-2">Kind</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Retry#</th>
                <th className="px-2 py-2">Last error</th>
                <th className="px-2 py-2 text-right">Duration</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r: QboSyncRunRow) => (
                <Fragment key={r.id}>
                  <tr
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    onClick={() =>
                      setExpanded((prev) => {
                        const n = new Set(prev);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  >
                    <td className="px-2 py-2">{r.started_at?.slice(0, 19) ?? "—"}</td>
                    <td className="px-2 py-2 font-medium">{r.kind}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusPill(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="px-2 py-2 text-right">{r.retry_count}</td>
                    <td className="max-w-xs truncate px-2 py-2 text-gray-700">{r.last_error ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                    <td className="space-x-1 px-2 py-2">
                      {(r.status === "failed" || r.status === "dead_letter") && (
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
                        <Link to={entityHref(r.entity_kind, r.entity_id)!} className="text-blue-700 underline" onClick={(e) => e.stopPropagation()}>
                          View entity
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                  {expanded.has(r.id) ? (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-3 py-2 font-mono text-[11px] text-gray-800">
                        <div className="mb-1 font-semibold">Payload / diagnostics</div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">
                          {JSON.stringify({ payload: r.payload, stack: r.error_stack }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
          <div className="text-sm font-semibold">Recent alerts (24h)</div>
          {alertsQuery.isError ? (
            <ReportBlockVPendingBanner error={alertsQuery.error} onRetry={() => void alertsQuery.refetch()} />
          ) : (
            <ul className="max-h-[520px] space-y-2 overflow-auto text-xs">
              {recentAlerts.map((a: QboSyncAlertRecord) => (
                <li key={a.id} className="rounded border border-amber-100 bg-amber-50/60 p-2">
                  <div className="font-semibold text-amber-950">{a.severity}</div>
                  <div className="text-gray-800">{a.message ?? "—"}</div>
                  <div className="text-[10px] text-gray-500">{a.created_at}</div>
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
    </div>
  );
}
