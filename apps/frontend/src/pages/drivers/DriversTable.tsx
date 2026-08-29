import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { ParityTable } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useBulkPermission } from "../../hooks/useBulkPermission";
import { useToast } from "../../components/Toast";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import type { summarizeDriverDqf } from "../../lib/driverDqf";
import { Combobox } from "../../components/Combobox";
import { companyToday } from "../../lib/businessDate";
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { employmentStatusCatalogClient } from "../../api/lists-drivers-catalogs";

const DRIVER_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Terminated", label: "Terminated" },
  { value: "Probation", label: "Probation" },
];

export type DriverTableRow = {
  driverId: string;
  name: string;
  status: string;
  summary: ReturnType<typeof summarizeDriverDqf>;
};

// Enriched with flat sort keys for the DQF chip + checklist-stats columns (ParityTable sorts by
// String(row[key]); the real values live nested under `summary`).
type EnrichedDriverRow = DriverTableRow & {
  dqf_level: string;
  dqf_present_count: number;
};

type Props = {
  rows: DriverTableRow[];
  companyId: string;
  onOpenProfile?: (driverId: string) => void;
  onUpdated?: () => void;
};

export function DriversTable({ rows, companyId, onOpenProfile, onUpdated }: Props) {
  const { pushToast } = useToast();
  // Same role gate the old BulkSelectableTable wrapper enforced (BULK_WRITE_ROLES via
  // useBulkPermission, applied inside its BulkActionBar) — preserved here so bulk selection/actions
  // stay hidden for roles that couldn't use them before. Matches the FuelTransactionsTable /
  // TBL-STANDARD batch-1 idiom.
  const bulkPermission = useBulkPermission();
  const bulk = useEntityBulkAction();
  const [deactivateRows, setDeactivateRows] = useState<DriverTableRow[]>([]);
  const [employmentReasonId, setEmploymentReasonId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const staged = useStagedListFilters({
    applied: { status: statusFilter },
    empty: { status: "" },
    onApply: (next) => setStatusFilter(next.status),
  });

  const enrichedRows = useMemo<EnrichedDriverRow[]>(
    () => rows.map((row) => ({ ...row, dqf_level: row.summary.level, dqf_present_count: row.summary.presentCount })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (!statusFilter) return enrichedRows;
    return enrichedRows.filter((row) => row.status === statusFilter);
  }, [enrichedRows, statusFilter]);

  const employmentReasonsQ = useQuery({
    queryKey: ["lists", "drivers", "employment-status", companyId],
    queryFn: () => employmentStatusCatalogClient.list(),
    enabled: Boolean(companyId && deactivateRows.length > 0),
  });
  const inactiveReasons = useMemo(
    () => (employmentReasonsQ.data?.rows ?? []).filter((row) => row.code !== "ACTIVE").map((row) => ({ value: row.id, label: row.label })),
    [employmentReasonsQ.data?.rows]
  );

  useEffect(() => {
    setDeactivateRows([]);
    setEmploymentReasonId(null);
  }, [companyId]);

  function handleExportSelected(selected: DriverTableRow[]) {
    const scope = selected.length > 0 ? selected : filteredRows;
    if (scope.length === 0) {
      pushToast("No drivers to export.", "info");
      return;
    }
    const esc = (value: unknown) => {
      const s = value == null ? "" : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Driver", "Status", "DQF level", "Present", "Missing", "Expired", "Driver ID"];
    const lines = scope.map((row) =>
      [row.name, row.status, row.summary.level, row.summary.presentCount, row.summary.missingCount, row.summary.expiredCount, row.driverId]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `IH35-drivers-dqf-${companyToday()}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <>
    <ParityTable<EnrichedDriverRow>
      rows={filteredRows}
      rowKey={(row) => row.driverId}
      storageKey="drivers-table"
      emptyText="No drivers match the applied filters."
      selectable={bulkPermission.canUseBulkOps}
      filterBar={
        <CollapsedListFilters
          activeFilterCount={statusFilter ? 1 : 0}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="drivers-table"
          dataAttributes={{ "data-drivers-table-filter-toolbar": "collapsed" }}
        >
          <div className="w-full max-w-xs text-xs font-semibold text-slate-600">
            <label htmlFor="drivers-table-status-filter">Status</label>
            <Combobox
              id="drivers-table-status-filter"
              dataTestId="drivers-table-status-filter"
              className="mt-1"
              options={DRIVER_STATUS_FILTERS.filter((option) => option.value)}
              value={staged.draft.status || null}
              onChange={(next) => staged.setDraft({ status: next ?? "" })}
              placeholder="All statuses"
              allowClear
            />
          </div>
        </CollapsedListFilters>
      }
      batchActions={(selected) => {
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              onClick={() => handleExportSelected(selected)}
            >
              Export Selected (CSV)
            </button>
            <button
              type="button"
              disabled
              title="Bulk tagging is not available yet."
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              onClick={() => pushToast("Bulk tagging is not available yet.", "info")}
            >
              Tag
            </button>
            <button
              type="button"
              disabled={selected.length === 0}
              title="Deactivate selected drivers"
              className="rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50"
              onClick={() => {
                setDeactivateRows(selected);
                setEmploymentReasonId(null);
              }}
            >
              Deactivate
            </button>
          </div>
        );
      }}
      columns={[
        {
          key: "name",
          label: "Driver",
          sortable: true,
          cellClass: "font-medium text-slate-900",
          // D1: the driver name itself opens the profile (entity-name click → its profile),
          // not only the trailing "Open profile" action. Same target as that action.
          render: (row) =>
            onOpenProfile ? (
              <button
                type="button"
                onClick={() => onOpenProfile(row.driverId)}
                className="text-left font-medium text-slate-900 hover:text-slate-700 hover:underline"
              >
                {row.name}
              </button>
            ) : (
              <EntityLinkOrTombstone
                kind="driver"
                id={row.driverId}
                name={row.name}
                noun="Driver"
                className="font-medium text-slate-900 hover:text-slate-700 hover:underline"
                data-testid="drivers-table-name-link"
              />
            ),
        },
        {
          key: "status",
          label: "Status",
          sortable: true,
          render: (row) => <StatusBadge status={row.status} />,
        },
        {
          key: "dqf_level",
          label: "DQF status chips",
          sortable: true,
          render: (row) => <DriverDqfComplianceChip summary={row.summary} compact />,
        },
        {
          key: "dqf_present_count",
          label: "Checklist stats",
          cellClass: "text-slate-600",
          sortable: true,
          render: (row) => `${row.summary.presentCount} present · ${row.summary.missingCount} missing · ${row.summary.expiredCount} expired`,
        },
        {
          // EXEMPT (pure action column — reuses the standing "actions" key already registered in
          // EXEMPT_COLUMN_KEYS / GLOBAL-SORT-RULE.md; no per-driver data to sort on).
          key: "actions",
          label: "Profile",
          className: "text-right",
          cellClass: "text-right",
          render: (row) =>
            onOpenProfile ? (
              <button type="button" onClick={() => onOpenProfile(row.driverId)} className="text-xs font-semibold text-slate-700 hover:underline">
                Open profile
              </button>
            ) : (
              <EntityLinkOrTombstone
                kind="driver"
                id={row.driverId}
                name={row.name}
                noun="Driver"
                className="text-xs font-semibold text-slate-700 hover:underline"
                data-testid="drivers-table-open-profile-link"
              />
            ),
        },
      ]}
    />
    <BulkActionModal
      open={deactivateRows.length > 0}
      actionLabel="Deactivate drivers"
      affectedCount={deactivateRows.length}
      requiresReason
      confirming={bulk.progressLoading}
      description="Selected drivers will become inactive and leave active rosters. Existing history is retained."
      payloadFields={
        <div className="space-y-1">
          <label htmlFor="driver-bulk-deactivate-reason" className="text-sm font-medium text-gray-800">Employment status reason</label>
          <Combobox
            id="driver-bulk-deactivate-reason"
            options={inactiveReasons}
            value={employmentReasonId}
            onChange={setEmploymentReasonId}
            placeholder={employmentReasonsQ.isLoading ? "Loading reasons…" : "Select reason"}
          />
          {employmentReasonsQ.isError ? <p className="text-xs text-red-600">Could not load employment status reasons.</p> : null}
        </div>
      }
      onCancel={() => {
        if (bulk.progressLoading) return;
        setDeactivateRows([]);
        setEmploymentReasonId(null);
      }}
      onConfirm={({ reason }) => {
        if (!employmentReasonId) {
          pushToast("Select an employment status reason.", "error");
          return;
        }
        void bulk.runBulk({
          domain: "mdata",
          resource: "drivers",
          ids: deactivateRows.map((row) => row.driverId),
          action: "set_status",
          payload: { status: "Inactive", reason_code_id: employmentReasonId },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["drivers"]],
        }, onUpdated).then(() => {
          setDeactivateRows([]);
          setEmploymentReasonId(null);
        }).catch(() => undefined);
      }}
    />
    <BulkProgressDialog
      open={bulk.progressOpen}
      requested={bulk.progress.requested}
      succeeded={bulk.progress.succeeded}
      failed={bulk.progress.failed}
      loading={bulk.progressLoading}
      bulk_call_id={bulk.progress.bulk_call_id}
      onClose={() => bulk.setProgressOpen(false)}
    />
    </>
  );
}
