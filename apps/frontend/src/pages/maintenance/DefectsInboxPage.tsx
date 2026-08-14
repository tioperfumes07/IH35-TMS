import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMaintenanceDvirDefects,
  triageMaintenanceDvirDefect,
  type DvirDefectInboxRow,
  type DvirDefectTriageStatus,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ListErrorState } from "../../components/ListErrorState";

export function DefectsInboxPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"pending" | DvirDefectTriageStatus | "all">("pending");
  const staged = useStagedListFilters({ applied: { statusFilter }, empty: { statusFilter: "pending" as const }, onApply: (next) => setStatusFilter(next.statusFilter) });

  const q = useQuery({
    queryKey: ["maintenance", "dvir-defects", operatingCompanyId, statusFilter],
    queryFn: () =>
      listMaintenanceDvirDefects(operatingCompanyId, {
        status: statusFilter === "all" ? "all" : statusFilter,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => q.data?.defects ?? [], [q.data?.defects]);

  const triageMut = useMutation({
    mutationFn: (args: { id: string; action: "assign" | "escalate" | "close_no_action" | "convert_to_wo" }) =>
      triageMaintenanceDvirDefect(args.id, {
        operating_company_id: operatingCompanyId,
        action: args.action,
      }),
    onSuccess: async (result) => {
      if (result.work_order_id) {
        pushToast(`Work order ${entityLabel(result.display_id, result.work_order_id, "Work order")} created`, "success");
      } else {
        pushToast("Defect triage updated", "success");
      }
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defects", operatingCompanyId] });
    },
    onError: () => pushToast("Triage action failed", "error"),
  });

  const columns = useMemo<ParityColumn<DvirDefectInboxRow>[]>(
    () => [
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => (row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"),
      },
      { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} /> },
      { key: "driver_name", label: "Driver", sortable: true, render: (row) => <EntityLink kind="driver" id={row.driver_id ?? undefined} label={entityLabel(row.driver_name, row.driver_id, "Driver")} /> },
      { key: "item_key", label: "Item", sortable: true, render: (row) => row.item_key },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => (
          <span className={row.severity === "major" ? "font-semibold text-red-700" : "text-amber-700"}>{row.severity}</span>
        ),
      },
      { key: "triage_status", label: "Status", sortable: true, render: (row) => row.triage_status },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            <EntityLink
              kind="maintenance_defect"
              id={row.id}
              label="Detail"
              className="rounded-sm border border-gray-300 px-2 py-1 text-[11px] hover:bg-gray-50"
              data-testid={`defect-detail-link-${row.id}`}
            />
            <Button size="sm" variant="secondary" onClick={() => triageMut.mutate({ id: row.id, action: "assign" })}>
              Assign
            </Button>
            <Button size="sm" variant="secondary" onClick={() => triageMut.mutate({ id: row.id, action: "escalate" })}>
              Escalate
            </Button>
            <Button size="sm" onClick={() => triageMut.mutate({ id: row.id, action: "convert_to_wo" })}>
              Convert to WO
            </Button>
          </div>
        ),
      },
    ],
    [triageMut],
  );

  return (
    <div className="space-y-4" data-testid="maint-dvir-defects-inbox">
      <PageHeader title="DVIR Defects" subtitle="Review driver-submitted defects and triage into work orders." />
      <div className="flex items-center justify-end" data-defects-inbox-filter-toolbar="collapsed">
        <CollapsedListFilters
          activeFilterCount={statusFilter !== "pending" ? 1 : 0}
          onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
          testIdPrefix="defects-inbox"
        >
          <label className="space-y-1 text-xs text-gray-600">
            <span>Triage status</span>
            <SelectCombobox
              className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
              value={staged.draft.statusFilter}
              onChange={(event) => staged.setDraft({ statusFilter: event.target.value as typeof statusFilter })}
              aria-label="Triage status filter"
            >
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="escalated">Escalated</option>
              <option value="converted">Converted</option>
              <option value="closed">Closed (no action)</option>
              <option value="all">All</option>
            </SelectCombobox>
          </label>
        </CollapsedListFilters>
      </div>

      {q.isError ? (
        <ListErrorState
          title="Couldn't load DVIR defects"
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
          storageKey="maintenance-dvir-defects"
          emptyText="No DVIR defects in this queue."
          exportFilename="dvir-defects"
          tableTestId="maint-dvir-defects-table"
          rowTestId={(row) => `defect-row-${row.id}`}
        />
      )}
    </div>
  );
}
