import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMaintenancePmSchedule, generateMaintenancePmWorkOrder, listMaintenancePmSchedules, type PmScheduleRow } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

export function PmSchedulePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["maintenance", "pm-schedule", companyId],
    queryFn: () => listMaintenancePmSchedules(companyId),
    enabled: Boolean(companyId),
  });

  const createM = useMutation({
    mutationFn: () =>
      createMaintenancePmSchedule({
        operating_company_id: companyId,
        unit_id: "00000000-0000-0000-0000-000000000000",
        pm_type: "oil change",
        interval_kind: "miles",
        interval_value: 10000,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["maintenance", "pm-schedule", companyId] });
    },
  });

  const generateM = useMutation({
    mutationFn: (id: string) => generateMaintenancePmWorkOrder(id, companyId),
  });

  const rows = listQ.data?.rows ?? [];

  const columns = useMemo<ParityColumn<PmScheduleRow>[]>(
    () => [
      { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={row.unit_display_id} /> },
      { key: "pm_type", label: "PM Type", sortable: true, render: (row) => row.pm_type },
      { key: "interval_value", label: "Interval", render: (row) => `${row.interval_value} ${row.interval_kind}` },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => (
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-2 py-0.5 text-[11px]"
            onClick={() => generateM.mutate(row.id)}
            disabled={generateM.isPending}
          >
            Generate WO
          </button>
        ),
      },
    ],
    [generateM],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">PM Schedule</h2>
        <Button type="button" onClick={() => createM.mutate()} disabled={!companyId}>
          + Create
        </Button>
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
        <div className="mb-2 text-xs text-gray-500">Due-soon threshold is company-configurable (days/miles/hours).</div>
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={listQ.isLoading}
          storageKey="maintenance-pm-schedule"
          emptyText="No PM schedules yet."
        />
      </div>
    </div>
  );
}
