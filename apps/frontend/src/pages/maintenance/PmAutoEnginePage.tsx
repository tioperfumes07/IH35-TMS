import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
  getMaintenancePmAutoEngineDashboard,
  runMaintenancePmAutoEngineNow,
  updateMaintenancePmAutoEngineSettings,
  type PmAutoEngineRunRow,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { userFacingApiError } from "../../lib/api-error-message";

export function PmAutoEnginePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const actionGenerationRef = useRef(0);

  const dashboardQ = useQuery({
    queryKey: ["maintenance", "pm-auto-engine", companyId],
    queryFn: () => getMaintenancePmAutoEngineDashboard(companyId),
    enabled: Boolean(companyId),
  });

  // MAINT-F6333: both mutations pushToast on success only — pushToast/useToast are already
  // imported and used right here, just never wired to onError. A rejected pause/resume or manual
  // run silently did nothing, on a control that automatically creates real work orders.
  const settingsM = useMutation({
    mutationFn: (input: { companyId: string; generation: number; isPaused: boolean }) =>
      updateMaintenancePmAutoEngineSettings({ operating_company_id: input.companyId, is_paused: input.isPaused }),
    onSuccess: async (_data, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-auto-engine", input.companyId] });
      pushToast(input.isPaused ? "PM auto-engine paused" : "PM auto-engine resumed", "success");
    },
    onError: (err, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(userFacingApiError(err, "Could not update the PM auto-engine setting"), "error");
    },
  });

  const runNowM = useMutation({
    mutationFn: (input: { companyId: string; generation: number }) => runMaintenancePmAutoEngineNow(input.companyId),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-auto-engine", input.companyId] });
      pushToast(
        `Run complete — ${result.work_orders_created} WO(s), ${result.alerts_created} alert(s)`,
        "success"
      );
    },
    onError: (err, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(userFacingApiError(err, "PM auto-engine run failed"), "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    settingsM.reset();
    runNowM.reset();
  }, [companyId]);

  useEffect(() => {
    if (!dashboardQ.isError) return;
    settingsM.reset();
    runNowM.reset();
  }, [dashboardQ.isError]);

  const isPaused = !dashboardQ.isError && Boolean(dashboardQ.data?.settings?.is_paused);
  const runs = dashboardQ.isError ? [] : (dashboardQ.data?.runs ?? []);
  const recentLog = dashboardQ.isError ? [] : (dashboardQ.data?.recent_log ?? []);

  const runColumns = useMemo<ParityColumn<PmAutoEngineRunRow>[]>(
    () => [
      { key: "started_at", label: "Started", sortable: true, render: (row) => formatDateTimeUS(row.started_at) || "—" },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      { key: "schedules_evaluated", label: "Schedules", render: (row) => row.schedules_evaluated },
      { key: "work_orders_created", label: "WOs", render: (row) => row.work_orders_created },
      { key: "alerts_created", label: "Alerts", render: (row) => row.alerts_created },
    ],
    [],
  );

  return (
    <div className="space-y-4" data-testid="maint-pm-auto-engine">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader
        title="PM Auto Engine"
        subtitle="Hourly evaluation of PM schedules — auto-creates work orders at due thresholds and near-due alerts."
        breadcrumb={[{ label: "Maintenance" }, { label: "PM Auto Engine" }]}
        backHref="/maintenance"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!companyId || dashboardQ.isError || settingsM.isPending}
              onClick={() => settingsM.mutate({ companyId, generation: actionGenerationRef.current, isPaused: !isPaused })}
            >
              {isPaused ? "Resume engine" : "Pause engine"}
            </Button>
            <Button type="button" disabled={!companyId || dashboardQ.isError || runNowM.isPending || isPaused} onClick={() => runNowM.mutate({ companyId, generation: actionGenerationRef.current })}>
              Run now
            </Button>
          </div>
        }
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
        <div className="mb-2 text-xs text-gray-600">
          Status: {dashboardQ.isError ? "Unavailable" : isPaused ? "Paused" : "Active"} · Lookahead {dashboardQ.isError ? "—" : (dashboardQ.data?.lookahead_miles ?? "—")} mi
        </div>
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Recent runs</h3>
        {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No engine runs recorded yet." — an outage presenting
            as a PM scheduler that has simply never run. */}
        {dashboardQ.isError ? (
          <ListErrorState
            title="Couldn't load PM engine runs"
            status={0}
            message={(dashboardQ.error as Error)?.message}
            onRetry={() => void dashboardQ.refetch()}
          />
        ) : (
        <ParityTable
          rows={runs}
          columns={runColumns}
          rowKey={(row) => row.id}
          loading={dashboardQ.isLoading}
          storageKey="maintenance-pm-auto-engine-runs"
          emptyText="No engine runs recorded yet."
        />
        )}
      </div>

      {!dashboardQ.isError ? <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600">Action log</h3>
        <ul className="space-y-1 text-xs">
          {recentLog.map((entry) => (
            <li key={entry.id} className="border-t border-gray-100 pt-1 first:border-0 first:pt-0">
              <span className="font-medium">{entry.action}</span> —{" "}
              <EntityLinkOrTombstone
                kind="pm_schedule"
                id={entry.pm_schedule_id}
                name={entry.schedule_label}
                noun="Schedule"
              />{" "}
              (<EntityLinkOrTombstone kind="unit" id={entry.unit_id} name={entry.unit_number} noun="Unit" />)
              {entry.work_order_id ? (
                <>
                  {" "}
                  · WO <EntityLinkOrTombstone kind="work_order" id={entry.work_order_id} name={entry.work_order_display_id} noun="Work order" />
                </>
              ) : ""}
            </li>
          ))}
          {recentLog.length === 0 ? (
            <li className="text-gray-500">No auto-engine actions yet.</li>
          ) : null}
        </ul>
      </div> : null}
    </div>
  );
}
