import { useMemo, useState } from "react";
import type { WorkOrder } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { Button } from "../../../components/Button";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters } from "../../../components/table";
import { useToast } from "../../../components/Toast";

type Props = {
  rows: WorkOrder[];
  /** MAINT-S02 — ParityTable emptyText only when settled (never mid-fetch false-empty). */
  loading?: boolean;
  sourceTypeFilter: string;
  externalVendorFilter: string;
  onSourceTypeChange: (value: string) => void;
  onExternalVendorChange: (value: string) => void;
};


function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function renderDuration(row: WorkOrder) {
  if (typeof row.duration_seconds === "number" && row.duration_seconds > 0) {
    return `Closed in ${formatDuration(row.duration_seconds)}`;
  }
  if (row.opened_at) {
    const openFor = Math.max(0, Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 1000));
    return `Open for ${formatDuration(openFor)}`;
  }
  return "—";
}

function money(value: unknown) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Real client-side CSV export of the currently-selected work orders (no backend call).
function exportSelectedCsv(selected: WorkOrder[]) {
  const header = ["WO #", "Source", "Unit", "Driver", "Vendor", "Status", "Cost", "Timing"];
  const lines = selected.map((row) =>
    [
      row.display_id ?? row.id,
      row.source_type ?? "",
      row.unit_number ?? row.unit_id,
      row.driver_id ?? "",
      row.external_vendor_id ?? "",
      row.status ?? "",
      money((row as Record<string, unknown>).total_actual_cost),
      renderDuration(row),
    ]
      .map(csvEscape)
      .join(","),
  );
  const blob = new Blob([`${header.join(",")}\n${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `active-work-orders-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function WorkOrdersTable({
  rows,
  loading = false,
  sourceTypeFilter,
  externalVendorFilter,
  onSourceTypeChange,
  onExternalVendorChange,
}: Props) {
  const { pushToast } = useToast();
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.display_id, r.id, r.unit_number, r.driver_id, r.external_vendor_id, r.status, r.source_type].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  // Universal-list columns — every record cell links to its detail per 00-MASTER-LINK-MAP.
  // external_vendor_id is a QBO id (no internal /vendors route) → shown as text, not a dead link.
  const columns: Array<ParityColumn<WorkOrder>> = [
    {
      key: "display_id",
      label: "WO #",
      sortable: true,
      render: (row) => <EntityLink kind="work_order" id={row.id} label={row.display_id ?? undefined} />,
    },
    { key: "source_type", label: "Source", sortable: true, render: (row) => row.source_type ?? "—" },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (row) => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number ?? undefined} />,
    },
    {
      key: "load_id",
      label: "Load",
      render: (row) =>
        row.load_id ? (
          <EntityLink kind="load" id={row.load_id} label={row.linked_load_number ?? undefined} />
        ) : (
          "—"
        ),
    },
    {
      key: "driver_id",
      label: "Driver",
      render: (row) => (
        <EntityLink
          kind="driver"
          id={row.driver_id ?? undefined}
          label={row.driver_id ? entityLabel(null, row.driver_id, "Driver") : undefined}
        />
      ),
    },
    {
      key: "external_vendor_id",
      label: "Vendor",
      render: (row) =>
        row.external_vendor_id ? (
          <EntityLink
            kind="vendor"
            id={row.external_vendor_id}
            label={entityLabel(null, row.external_vendor_id, "Vendor")}
          />
        ) : (
          "—"
        ),
    },
    { key: "status", label: "Status", sortable: true },
    { key: "total_actual_cost", label: "Cost", sortable: true, render: (row) => money((row as Record<string, unknown>).total_actual_cost) },
    { key: "timing", label: "Timing", render: (row) => renderDuration(row) },
  ];

  return (
    <div className="space-y-2">
      <ParityTable<WorkOrder>
        columns={columns}
        rows={filteredRows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyText="No work orders found — none open for this entity yet (or no rows match the current filter)."
        storageKey="maint-active-wos"
        exportFilename="active-work-orders"
        selectable
        batchActions={(selected) => (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled
              title="Bulk close endpoint not yet available"
            >
              Close selected
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                exportSelectedCsv(selected);
                pushToast(`Exported ${selected.length} WO(s) to CSV.`, "success");
              }}
            >
              Export selected
            </Button>
          </>
        )}
        filterBar={
          <div data-wo-filter-toolbar="collapsed">
            <CollapsedListFilters
              activeFilterCount={(sourceTypeFilter ? 1 : 0) + (externalVendorFilter ? 1 : 0)}
              testIdPrefix="work-orders"
              searchSlot={
                <input
                  aria-label="Search work orders by WO, unit, driver, or status"
                  className="min-h-12 w-full max-w-xs rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search WO / unit / driver / status…"
                />
              }
            >
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="space-y-1 text-xs text-gray-600">
                  <span>Source type</span>
                  <SelectCombobox
                    className="min-h-12 w-full rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                    value={sourceTypeFilter}
                    onChange={(e) => onSourceTypeChange(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="IS">IS</option>
                    <option value="ES">ES</option>
                    <option value="AC">AC</option>
                    <option value="ET">ET</option>
                    <option value="RT">RT</option>
                    <option value="IT">IT</option>
                    <option value="RS">RS</option>
                  </SelectCombobox>
                </label>
                <label className="space-y-1 text-xs text-gray-600">
                  <span>External vendor id</span>
                  <input
                    aria-label="Filter by external vendor id"
                    className="min-h-12 w-full rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                    value={externalVendorFilter}
                    onChange={(e) => onExternalVendorChange(e.target.value)}
                    placeholder="External vendor id…"
                  />
                </label>
              </div>
            </CollapsedListFilters>
          </div>
        }
      />
    </div>
  );
}
