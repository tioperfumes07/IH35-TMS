import { useMemo, useState } from "react";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { ParityTable } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useBulkPermission } from "../../hooks/useBulkPermission";
import { useToast } from "../../components/Toast";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import type { summarizeDriverDqf } from "../../lib/driverDqf";

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
  onOpenProfile?: (driverId: string) => void;
};

export function DriversTable({ rows, onOpenProfile }: Props) {
  const { pushToast } = useToast();
  // Same role gate the old BulkSelectableTable wrapper enforced (BULK_WRITE_ROLES via
  // useBulkPermission, applied inside its BulkActionBar) — preserved here so bulk selection/actions
  // stay hidden for roles that couldn't use them before. Matches the FuelTransactionsTable /
  // TBL-STANDARD batch-1 idiom.
  const bulkPermission = useBulkPermission();
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
    anchor.download = `IH35-drivers-dqf-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
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
          <label className="text-xs font-semibold text-slate-600">
            Status
            <select
              className="mt-1 w-full max-w-xs rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={staged.draft.status}
              onChange={(event) => staged.setDraft({ status: event.target.value })}
              data-testid="drivers-table-status-filter"
            >
              {DRIVER_STATUS_FILTERS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
              disabled
              title="Bulk deactivate is not available yet — deactivate a driver from their profile."
              className="rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50"
              onClick={() => pushToast("Bulk deactivate is not available yet — deactivate a driver from their profile.", "info")}
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
  );
}
