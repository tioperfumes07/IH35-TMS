import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMaintenanceDvirDefects,
  triageMaintenanceDvirDefect,
  type DvirDefectInboxRow,
  type DvirDefectTriageStatus,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ListErrorState } from "../../components/ListErrorState";

/** U12 — triage status multi-selector (was single SelectCombobox). Default = pending queue. */
const TRIAGE_STATUS_OPTIONS: Array<{ value: DvirDefectTriageStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "escalated", label: "Escalated" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed (no action)" },
];

export function DefectsInboxPage() {
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  // U12: multi-select — API one status; 0 = all; 1 = pass through; 2+ fetch all then filter.
  const [statusFilter, setStatusFilter] = useState<string[]>(["pending"]);
  const actionGenerationRef = useRef(0);
  const staged = useStagedListFilters({
    applied: { statusFilter },
    empty: { statusFilter: ["pending"] as string[] },
    onApply: (next) => setStatusFilter(next.statusFilter),
  });

  const apiStatus =
    statusFilter.length === 0
      ? ("all" as const)
      : statusFilter.length === 1
        ? (statusFilter[0] as DvirDefectTriageStatus)
        : ("all" as const);

  const q = useQuery({
    queryKey: ["maintenance", "dvir-defects", operatingCompanyId, statusFilter.join(",")],
    queryFn: () =>
      listMaintenanceDvirDefects(operatingCompanyId, {
        status: apiStatus,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo(() => {
    const all = q.data?.defects ?? [];
    if (statusFilter.length <= 1) return all;
    const selected = new Set(statusFilter);
    return all.filter((row) => selected.has(row.triage_status));
  }, [q.data?.defects, statusFilter]);

  const triageMut = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number; action: "assign" | "escalate" | "close_no_action" | "convert_to_wo" }) =>
      triageMaintenanceDvirDefect(input.id, {
        operating_company_id: input.companyId,
        action: input.action,
      }),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      if (result.work_order_id) {
        pushToast(`Work order ${entityLabel(result.display_id, result.work_order_id, "Work order")} created`, "success");
      } else {
        pushToast("Defect triage updated", "success");
      }
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defects", input.companyId] });
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Triage action failed", "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    triageMut.reset();
  }, [operatingCompanyId]);

  const runTriage = (id: string, action: "assign" | "escalate" | "close_no_action" | "convert_to_wo") => {
    triageMut.mutate({ id, companyId: operatingCompanyId, generation: actionGenerationRef.current, action });
  };

  const columns = useMemo<ParityColumn<DvirDefectInboxRow>[]>(
    () => [
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => (row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"),
      },
      { key: "unit_id", label: "Unit", render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" /> },
      { key: "driver_name", label: "Driver", sortable: true, render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" /> },
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
        key: "follow_up_wo_id",
        label: "Work order",
        render: (row) => row.follow_up_wo_id ? (
          <EntityLinkOrTombstone
            kind="work_order"
            id={row.follow_up_wo_id}
            name={row.follow_up_wo_display_id}
            noun="Work order"
            data-testid={`defect-work-order-link-${row.id}`}
          />
        ) : "—",
      },
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
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
              data-testid={`defect-detail-link-${row.id}`}
            />
            <Button size="sm" variant="secondary" onClick={() => runTriage(row.id, "assign")}>
              Assign
            </Button>
            <Button size="sm" variant="secondary" onClick={() => runTriage(row.id, "escalate")}>
              Escalate
            </Button>
            {!row.follow_up_wo_id ? (
              <Button size="sm" onClick={() => runTriage(row.id, "convert_to_wo")}>
                Convert to WO
              </Button>
            ) : null}
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
          activeFilterCount={statusFilter.length !== 1 || statusFilter[0] !== "pending" ? 1 : 0}
          onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
          testIdPrefix="defects-inbox"
        >
          <div className="min-w-[220px]" data-testid="defects-inbox-status-filter">
            <MultiSelectDropdown
              label="Triage status"
              options={TRIAGE_STATUS_OPTIONS}
              selected={staged.draft.statusFilter}
              onChange={(next) => staged.setDraft({ statusFilter: next })}
              allLabel="All statuses"
              data-testid="defects-inbox-status-multiselect"
            />
          </div>
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
          title="DVIR defects — inbox"
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
