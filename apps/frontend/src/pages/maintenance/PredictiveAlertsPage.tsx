import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkOrderFromPredictiveAlert,
  listMaintenancePredictiveAlerts,
  resolveMaintenancePredictiveAlert,
  type PredictiveAlertRow,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ListErrorState } from "../../components/ListErrorState";

const ALERT_TYPE_LABEL: Record<string, string> = { brake_wear: "Brake wear", tire_tread: "Tire tread" };

export function PredictiveAlertsPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [stateFilter, setStateFilter] = useState<"open" | "resolved">("open");
  const actionGenerationRef = useRef(0);
  const staged = useStagedListFilters({
    applied: { stateFilter },
    empty: { stateFilter: "open" as const },
    onApply: (next) => setStateFilter(next.stateFilter),
  });

  const q = useQuery({
    queryKey: ["maintenance", "predictive-alerts", operatingCompanyId, stateFilter],
    queryFn: () => listMaintenancePredictiveAlerts(operatingCompanyId, { state: stateFilter }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => q.data?.alerts ?? [], [q.data?.alerts]);

  const createWoMut = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number }) =>
      createWorkOrderFromPredictiveAlert(input.id, input.companyId),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast(
        result.alreadyConverted
          ? "This alert already has a work order"
          : `Work order ${entityLabel(result.display_id, result.work_order_id, "Work order")} created`,
        "success"
      );
      await qc.invalidateQueries({ queryKey: ["maintenance", "predictive-alerts", input.companyId] });
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Couldn't create work order", "error");
    },
  });

  const resolveMut = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number; note: string }) =>
      resolveMaintenancePredictiveAlert(input.id, input.companyId, input.note),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Alert resolved", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "predictive-alerts", input.companyId] });
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Couldn't resolve alert", "error");
    },
  });

  const runCreateWo = (id: string) => {
    createWoMut.mutate({ id, companyId: operatingCompanyId, generation: actionGenerationRef.current });
  };
  const runResolve = (id: string) => {
    const note = window.prompt("Resolution note (required):");
    if (!note || !note.trim()) return;
    resolveMut.mutate({ id, companyId: operatingCompanyId, generation: actionGenerationRef.current, note: note.trim() });
  };

  const columns = useMemo<ParityColumn<PredictiveAlertRow>[]>(
    () => [
      { key: "unit_id", label: "Unit", render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" /> },
      { key: "alert_type", label: "Type", sortable: true, render: (row) => ALERT_TYPE_LABEL[row.alert_type] ?? row.alert_type },
      { key: "position_code", label: "Position", sortable: true, render: (row) => row.position_code },
      {
        key: "current_measure",
        label: "Current",
        render: (row) => `${row.current_measure} ${row.measure_unit}`,
      },
      {
        key: "threshold_measure",
        label: "Threshold",
        render: (row) => `${row.threshold_measure} ${row.measure_unit}`,
      },
      {
        key: "projected_failure_date",
        label: "Projected date",
        sortable: true,
        render: (row) => new Date(row.projected_failure_date).toLocaleDateString(),
      },
      { key: "days_remaining", label: "Days left", sortable: true, render: (row) => row.days_remaining },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        // §7 palette: red is allowed only for delete/Accident-class UI — critical here still uses
        // the neutral slate scale (bold + darker), not red, to stay on-palette.
        render: (row) => (
          <span className={row.severity === "critical" ? "font-semibold text-slate-900" : "text-slate-600"} data-testid={`predictive-alert-severity-${row.id}`}>
            {row.severity}
          </span>
        ),
      },
      {
        key: "work_order_id",
        label: "Work order",
        render: (row) =>
          row.work_order_id ? (
            <EntityLinkOrTombstone
              kind="work_order"
              id={row.work_order_id}
              name={row.work_order_display_id}
              noun="Work order"
              data-testid={`predictive-alert-work-order-link-${row.id}`}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) =>
          row.resolved_at ? (
            <span className="text-[11px] text-gray-500">Resolved</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {!row.work_order_id ? (
                <Button size="sm" onClick={() => runCreateWo(row.id)} data-testid={`predictive-alert-create-wo-${row.id}`}>
                  Create work order
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => runResolve(row.id)} data-testid={`predictive-alert-resolve-${row.id}`}>
                Resolve
              </Button>
            </div>
          ),
      },
    ],
    [createWoMut, resolveMut]
  );

  return (
    <div className="space-y-4" data-testid="maint-predictive-alerts-page">
      <PageHeader
        title="At Risk"
        subtitle="Brake and tire wear projections nearing their replacement threshold — catch it in the shop, not on the road."
      />
      <div className="flex items-center justify-end" data-predictive-alerts-filter-toolbar="collapsed">
        <CollapsedListFilters
          activeFilterCount={stateFilter !== "open" ? 1 : 0}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="predictive-alerts"
        >
          <label className="space-y-1 text-xs text-gray-600">
            <span>State</span>
            <SelectCombobox
              className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              value={staged.draft.stateFilter}
              onChange={(event) => staged.setDraft({ stateFilter: event.target.value as typeof stateFilter })}
              aria-label="Alert state filter"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </SelectCombobox>
          </label>
        </CollapsedListFilters>
      </div>

      {q.isError ? (
        <ListErrorState
          title="Couldn't load predictive alerts"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={q.isPending}
          storageKey="maintenance-predictive-alerts"
          emptyText="No predictive alerts in this queue."
          exportFilename="predictive-alerts"
          tableTestId="maint-predictive-alerts-table"
          rowTestId={(row) => `predictive-alert-row-${row.id}`}
        />
      )}
    </div>
  );
}
