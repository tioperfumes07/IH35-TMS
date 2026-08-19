import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeMaintenancePmAlert,
  listMaintenancePmAlerts,
  scheduleMaintenancePmAlert,
  type MaintenancePmAlert,
} from "../../../api/maintenance";
import { useToast } from "../../../components/Toast";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityPicker } from "../../../components/parity/EntityPicker";

type Props = {
  operatingCompanyId: string;
  /** Opt-in narrow-sidebar layout: tight read-only list (ack/schedule actions stay in full mode). Default false. */
  compact?: boolean;
};

export function MaintenanceAlertsCard({ operatingCompanyId, compact = false }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [schedulingAlertId, setSchedulingAlertId] = useState<string | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

  const alertsQuery = useQuery({
    queryKey: ["maintenance", "pm-alerts", operatingCompanyId],
    queryFn: () => listMaintenancePmAlerts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const scheduledAlertsQuery = useQuery({
    queryKey: ["maintenance", "pm-alerts", operatingCompanyId, "scheduled"],
    queryFn: () => listMaintenancePmAlerts(operatingCompanyId, "scheduled"),
    enabled: Boolean(operatingCompanyId) && !compact,
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeMaintenancePmAlert(alertId, operatingCompanyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "pm-alerts", operatingCompanyId] });
      setSchedulingAlertId(null);
      setSelectedWorkOrderId(null);
      pushToast("PM alert linked to work order", "success");
    },
    onError: () => pushToast("Could not link work order to PM alert", "error"),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ alertId, workOrderId }: { alertId: string; workOrderId: string }) =>
      scheduleMaintenancePmAlert(alertId, operatingCompanyId, workOrderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "pm-alerts", operatingCompanyId] });
    },
  });

  const alerts = alertsQuery.data?.alerts ?? [];
  const scheduledAlerts = scheduledAlertsQuery.data?.alerts ?? [];
  const openTotalCount = alertsQuery.data?.total_count ?? alerts.length;
  const scheduledTotalCount = scheduledAlertsQuery.data?.total_count ?? scheduledAlerts.length;

  if (compact) {
    return (
      <section className="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <div className="flex items-center justify-between bg-gray-50 px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">PM Alerts</span>
          <span className="text-[10px] font-semibold" style={{ color: "#854F0B" }}>{openTotalCount} open</span>
        </div>
        {alerts.length === 0 ? (
          <div className="px-2 py-1.5 text-[11px] text-gray-400">No PM alerts</div>
        ) : (
          <div>
          <ul className="flex flex-col">
            {alerts.map((alert: MaintenancePmAlert) => (
              <li key={alert.id} className="border-t border-gray-100 px-2 py-1 first:border-t-0 text-[10px]">
                <div className="font-semibold" style={{ color: "#1F2A44" }}>
                  <EntityLink kind="unit" id={alert.unit_id} label={entityLabel(alert.unit_number, alert.unit_id, "Unit")} /> · {alert.schedule_label}
                </div>
                <div className="text-gray-500">Due @ {alert.trigger_odometer.toLocaleString()} mi</div>
              </li>
            ))}
          </ul>
          {openTotalCount > alerts.length ? (
            <p className="border-t border-gray-100 px-2 py-1 text-[10px] text-slate-500" data-testid="pm-alerts-compact-range">
              Showing {alerts.length} of {openTotalCount} open alerts.
            </p>
          ) : null}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">PM Alerts</h3>
        <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{openTotalCount} open</span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-gray-500">No preventive maintenance alerts.</p>
      ) : (
        <ul className="space-y-2">
          {openTotalCount > alerts.length ? (
            <li className="text-xs text-slate-500" data-testid="pm-alerts-open-range">
              Showing {alerts.length} of {openTotalCount} open alerts.
            </li>
          ) : null}
          {alerts.map((alert: MaintenancePmAlert) => (
            <li key={alert.id} className="p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-900">
                  Unit <EntityLink kind="unit" id={alert.unit_id} label={entityLabel(alert.unit_number, alert.unit_id, "Unit")} /> · {alert.schedule_label}
                </p>
                <span className="text-[11px] text-gray-500">Due @ {alert.trigger_odometer.toLocaleString()} mi</span>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Triggered {new Date(alert.triggered_at).toLocaleString()}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-sm border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={ackMutation.isPending}
                  onClick={() => void ackMutation.mutateAsync(alert.id)}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-slate-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
                  disabled={scheduleMutation.isPending}
                  onClick={() => {
                    setSchedulingAlertId(alert.id);
                    setSelectedWorkOrderId(alert.scheduled_work_order_id);
                  }}
                >
                  Schedule WO
                </button>
              </div>
              {schedulingAlertId === alert.id ? (
                <div className="mt-2 bg-slate-50 p-2" data-testid={`pm-alert-wo-picker-${alert.id}`}>
                  <label className="text-[11px] font-semibold text-gray-700">Work order</label>
                  <EntityPicker
                    kind="work_order"
                    operatingCompanyId={operatingCompanyId}
                    value={selectedWorkOrderId}
                    onChange={setSelectedWorkOrderId}
                    placeholder="Search work order…"
                    enabled
                    dataTestId="pm-alert-work-order-picker"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-sm border border-gray-300 px-2 py-1 text-[11px] text-gray-700"
                      onClick={() => {
                        setSchedulingAlertId(null);
                        setSelectedWorkOrderId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-sm bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      disabled={!selectedWorkOrderId || scheduleMutation.isPending}
                      onClick={() => {
                        if (!selectedWorkOrderId) return;
                        scheduleMutation.mutate({ alertId: alert.id, workOrderId: selectedWorkOrderId });
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!compact && scheduledAlerts.length > 0 ? (
        <div className="mt-3 border-t border-gray-200 pt-3" data-testid="pm-alerts-scheduled-reverse">
          <h4 className="text-xs font-semibold text-gray-700">Recently scheduled</h4>
          {scheduledTotalCount > scheduledAlerts.length ? (
            <p className="mt-1 text-xs text-slate-500" data-testid="pm-alerts-scheduled-range">
              Showing {scheduledAlerts.length} of {scheduledTotalCount} scheduled alerts.
            </p>
          ) : null}
          <ul className="mt-2 space-y-1">
            {scheduledAlerts.map((alert) => (
              <li key={alert.id} className="text-xs text-gray-600">
                <EntityLink kind="unit" id={alert.unit_id} label={entityLabel(alert.unit_number, alert.unit_id, "Unit")} /> · {alert.schedule_label}
                {alert.scheduled_work_order_id ? (
                  <> · <EntityLink kind="work_order" id={alert.scheduled_work_order_id} label={entityLabel(alert.scheduled_work_order_display_id, alert.scheduled_work_order_id, "Work order")} /></>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
