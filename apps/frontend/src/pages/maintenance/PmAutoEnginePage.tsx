import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMaintenancePmAutoEngineDashboard,
  runMaintenancePmAutoEngineNow,
  updateMaintenancePmAutoEngineSettings,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";

export function PmAutoEnginePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const dashboardQ = useQuery({
    queryKey: ["maintenance", "pm-auto-engine", companyId],
    queryFn: () => getMaintenancePmAutoEngineDashboard(companyId),
    enabled: Boolean(companyId),
  });

  const settingsM = useMutation({
    mutationFn: (isPaused: boolean) =>
      updateMaintenancePmAutoEngineSettings({ operating_company_id: companyId, is_paused: isPaused }),
    onSuccess: async (_data, isPaused) => {
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-auto-engine", companyId] });
      pushToast(isPaused ? "PM auto-engine paused" : "PM auto-engine resumed", "success");
    },
  });

  const runNowM = useMutation({
    mutationFn: () => runMaintenancePmAutoEngineNow(companyId),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-auto-engine", companyId] });
      pushToast(
        `Run complete — ${result.work_orders_created} WO(s), ${result.alerts_created} alert(s)`,
        "success"
      );
    },
  });

  const isPaused = Boolean(dashboardQ.data?.settings?.is_paused);

  return (
    <div className="space-y-4" data-testid="maint-pm-auto-engine">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">PM Auto Engine</h2>
          <p className="text-xs text-gray-500">
            Hourly evaluation of PM schedules — auto-creates work orders at due thresholds and near-due alerts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!companyId || settingsM.isPending}
            onClick={() => settingsM.mutate(!isPaused)}
          >
            {isPaused ? "Resume engine" : "Pause engine"}
          </Button>
          <Button type="button" disabled={!companyId || runNowM.isPending || isPaused} onClick={() => runNowM.mutate()}>
            Run now
          </Button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="mb-2 text-xs text-gray-600">
          Status: {isPaused ? "Paused" : "Active"} · Lookahead {dashboardQ.data?.lookahead_miles ?? "—"} mi
        </div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Recent runs</h3>
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-500">
            <tr>
              <th className="py-1">Started</th>
              <th className="py-1">Status</th>
              <th className="py-1">Schedules</th>
              <th className="py-1">WOs</th>
              <th className="py-1">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {(dashboardQ.data?.runs ?? []).map((run) => (
              <tr key={run.id} className="border-t border-gray-100">
                <td className="py-1">{run.started_at ?? "—"}</td>
                <td className="py-1">{run.status}</td>
                <td className="py-1">{run.schedules_evaluated}</td>
                <td className="py-1">{run.work_orders_created}</td>
                <td className="py-1">{run.alerts_created}</td>
              </tr>
            ))}
            {(dashboardQ.data?.runs ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-gray-500">
                  No engine runs recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Action log</h3>
        <ul className="space-y-1 text-xs">
          {(dashboardQ.data?.recent_log ?? []).map((entry) => (
            <li key={entry.id} className="border-t border-gray-100 pt-1 first:border-0 first:pt-0">
              <span className="font-medium">{entry.action}</span> — {entry.schedule_label ?? entry.pm_schedule_id}{" "}
              {entry.unit_number ? `(${entry.unit_number})` : ""}
              {entry.work_order_id ? ` · WO ${entry.work_order_id}` : ""}
            </li>
          ))}
          {(dashboardQ.data?.recent_log ?? []).length === 0 ? (
            <li className="text-gray-500">No auto-engine actions yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
