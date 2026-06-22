import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeMaintenancePmAlert,
  listMaintenancePmAlerts,
  scheduleMaintenancePmAlert,
  type MaintenancePmAlert,
} from "../../../api/maintenance";
import { useToast } from "../../../components/Toast";

type Props = {
  operatingCompanyId: string;
};

export function MaintenanceAlertsCard({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const alertsQuery = useQuery({
    queryKey: ["maintenance", "pm-alerts", operatingCompanyId],
    queryFn: () => listMaintenancePmAlerts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeMaintenancePmAlert(alertId, operatingCompanyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "pm-alerts", operatingCompanyId] });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ alertId, workOrderId }: { alertId: string; workOrderId: string }) =>
      scheduleMaintenancePmAlert(alertId, operatingCompanyId, workOrderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "pm-alerts", operatingCompanyId] });
    },
  });

  const alerts = alertsQuery.data?.alerts ?? [];

  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">PM Alerts</h3>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{alerts.length} open</span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-gray-500">No preventive maintenance alerts.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert: MaintenancePmAlert) => (
            <li key={alert.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-900">
                  Unit {alert.unit_number} · {alert.schedule_label}
                </p>
                <span className="text-[11px] text-gray-500">Due @ {alert.trigger_odometer.toLocaleString()} mi</span>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Triggered {new Date(alert.triggered_at).toLocaleString()}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={ackMutation.isPending}
                  onClick={() => void ackMutation.mutateAsync(alert.id)}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  className="rounded bg-slate-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
                  disabled={scheduleMutation.isPending}
                  onClick={() => {
                    const woId = window.prompt("Enter work order ID to link this PM alert:");
                    if (!woId) return;
                    void scheduleMutation
                      .mutateAsync({ alertId: alert.id, workOrderId: woId })
                      .catch(() => pushToast("Could not link work order to PM alert", "error"));
                  }}
                >
                  Schedule WO
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
