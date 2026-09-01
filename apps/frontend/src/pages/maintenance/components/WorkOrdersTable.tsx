import type { WorkOrder } from "../../../api/maintenance";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../../lib/entity-label";
import { Button } from "../../../components/Button";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters, TableHeaderCell, useStagedListFilters, useTablePref } from "../../../components/table";
import { useColumnReorder } from "../../../components/lists/ListView/hooks/useColumnReorder";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { useToast } from "../../../components/Toast";
import { companyToday } from "../../../lib/businessDate";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUrlSort } from "../../../hooks/useUrlSort";

type Props = {
  rows: WorkOrder[];
  loading?: boolean;
  operatingCompanyId: string;
  sourceTypeFilter: string;
  externalVendorFilter: string;
  onSourceTypeChange: (value: string) => void;
  onExternalVendorChange: (value: string) => void;
};

type WoTableColumn = {
  key: string;
  header: string;
  sortable: boolean;
  cell: (row: WorkOrder) => ReactNode;
  className?: string;
  cellClass?: string;
  numeric?: boolean;
};

const MAINT_WO_HEADER_SORTABLE = new Set(["unit_number", "display_id", "opened_at"]);

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

function exportSelectedCsv(selected: WorkOrder[]) {
  const header = ["WO #", "Source", "Unit", "Driver", "Vendor", "Status", "Cost", "Timing"];
  const lines = selected.map((row) =>
    [
      entityLabel(row.display_id, row.id, "Work order"),
      row.source_type ?? "",
      entityLabel(row.unit_number, row.unit_id, "Unit"),
      entityLabel(row.driver_name, row.driver_id, "Driver"),
      entityLabel(row.resolved_vendor_name, row.resolved_vendor_id, "Vendor"),
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
  a.download = `active-work-orders-selected-${companyToday()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function woSortValue(row: WorkOrder, key: string): string | number {
  switch (key) {
    case "unit_number":
      return String(row.unit_number ?? "");
    case "display_id":
      return String(row.display_id ?? "");
    case "opened_at":
      return String(row.opened_at ?? "");
    case "total_actual_cost":
      return Number((row as Record<string, unknown>).total_actual_cost ?? 0);
    default:
      return String((row as Record<string, unknown>)[key] ?? "");
  }
}

function compareWoRows(a: WorkOrder, b: WorkOrder, key: string): number {
  const va = woSortValue(a, key);
  const vb = woSortValue(b, key);
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
}

export function WorkOrdersTable({
  rows,
  loading = false,
  operatingCompanyId,
  sourceTypeFilter,
  externalVendorFilter,
  onSourceTypeChange,
  onExternalVendorChange,
}: Props) {
  const { pushToast } = useToast();
  const { sortKey, sortDirection, toggleSort } = useUrlSort();
  const effectiveSortKey = sortKey || "opened_at";
  const effectiveSortDir = sortKey ? sortDirection : "desc";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    widths: woColWidths,
    setColumnWidth: setWoColWidth,
    columnOrder: savedWoColumnOrder,
    setColumnOrder: persistWoColumnOrder,
  } = useTablePref("maint-active-wos", { pageSize: 50 });

  const staged = useStagedListFilters({
    applied: { sourceTypeFilter, externalVendorFilter },
    empty: { sourceTypeFilter: "", externalVendorFilter: "" },
    onApply: (next) => {
      onSourceTypeChange(next.sourceTypeFilter);
      onExternalVendorChange(next.externalVendorFilter);
    },
  });

  const columns = useMemo<WoTableColumn[]>(
    () => [
      {
        key: "display_id",
        header: "WO #",
        sortable: true,
        cell: (row) => <EntityLinkOrTombstone kind="work_order" id={row.id} name={row.display_id} noun="Work order" />,
      },
      { key: "source_type", header: "Source", sortable: true, cell: (row) => row.source_type ?? "—" },
      {
        key: "unit_number",
        header: "Unit",
        sortable: true,
        cell: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />,
      },
      {
        key: "equipment_number",
        header: "Trailer",
        sortable: true,
        cell: (row) => (
          <EntityLinkOrTombstone kind="trailer" id={row.equipment_id} name={row.equipment_number} noun="Trailer" />
        ),
      },
      {
        key: "load_id",
        header: "Load",
        sortable: false,
        cell: (row) =>
          row.load_id ? (
            <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.linked_load_number} noun="Load" />
          ) : (
            "—"
          ),
      },
      {
        key: "driver_id",
        header: "Driver",
        sortable: false,
        cell: (row) => (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id ?? undefined} name={row.driver_name} noun="Driver" />
        ),
      },
      {
        key: "resolved_vendor_id",
        header: "Vendor",
        sortable: false,
        cell: (row) =>
          row.resolved_vendor_id ? (
            <EntityLinkOrTombstone
              kind="vendor"
              id={row.resolved_vendor_id}
              name={row.resolved_vendor_name}
              noun="Vendor"
            />
          ) : (
            "—"
          ),
      },
      { key: "status", header: "Status", sortable: true, cell: (row) => row.status ?? "—" },
      {
        key: "total_actual_cost",
        header: "Cost",
        sortable: true,
        numeric: true,
        cell: (row) => money((row as Record<string, unknown>).total_actual_cost),
      },
      {
        key: "opened_at",
        header: "Opened",
        sortable: true,
        cell: (row) => (row.opened_at ? String(row.opened_at).slice(0, 10) : "—"),
      },
      { key: "timing", header: "Timing", sortable: false, cell: (row) => renderDuration(row) },
    ],
    [],
  );

  const defaultColumnKeys = useMemo(() => columns.map((column) => column.key), [columns]);
  const { order: columnOrder, setOrder: setColumnOrder, dragHandleProps, dragOverId } = useColumnReorder(
    savedWoColumnOrder.length > 0 ? savedWoColumnOrder : defaultColumnKeys,
  );

  useEffect(() => {
    if (savedWoColumnOrder.length > 0) setColumnOrder(savedWoColumnOrder);
  }, [savedWoColumnOrder, setColumnOrder]);

  useEffect(() => {
    if (columnOrder.length > 0) persistWoColumnOrder(columnOrder);
  }, [columnOrder, persistWoColumnOrder]);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const keys = columnOrder.length > 0 ? columnOrder : defaultColumnKeys;
    return keys.map((key) => byKey.get(key)).filter((column): column is WoTableColumn => Boolean(column));
  }, [columns, columnOrder, defaultColumnKeys]);

  const sortedRows = useMemo(() => {
    if (!effectiveSortKey) return rows;
    return [...rows].sort((a, b) => {
      const cmp = compareWoRows(a, b, effectiveSortKey);
      return effectiveSortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, effectiveSortKey, effectiveSortDir]);

  const pageRowIds = sortedRows.map((row) => row.id);
  const allSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const selectedRows = sortedRows.filter((row) => selectedIds.has(row.id));

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(pageRowIds);
    });
  };

  return (
    <div className="space-y-2" data-testid="maint-active-work-orders-table">
      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
          <span className="font-semibold text-slate-700">{selectedIds.size} selected</span>
          <Button type="button" variant="secondary" size="sm" disabled title="Bulk close endpoint not yet available">
            Close selected
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              exportSelectedCsv(selectedRows);
              pushToast(`Exported ${selectedRows.length} WO(s) to CSV.`, "success");
            }}
          >
            Export selected
          </Button>
        </div>
      ) : null}

      <div data-wo-filter-toolbar="collapsed">
        <CollapsedListFilters
          activeFilterCount={(sourceTypeFilter ? 1 : 0) + (externalVendorFilter ? 1 : 0)}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="work-orders"
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-600">
              <span>Source type</span>
              <SelectCombobox
                className="min-h-12 w-full rounded-sm border border-gray-300 px-2 text-sm sm:h-9 sm:min-h-0"
                value={staged.draft.sourceTypeFilter}
                onChange={(e) => staged.setDraft({ ...staged.draft, sourceTypeFilter: e.target.value })}
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
            <div className="space-y-1 text-xs text-gray-600">
              <span>External vendor id</span>
              <EntityPicker
                kind="vendor"
                operatingCompanyId={operatingCompanyId}
                value={staged.draft.externalVendorFilter || null}
                onChange={(next) => staged.setDraft({ ...staged.draft, externalVendorFilter: next ?? "" })}
                allowCreate={false}
                placeholder="All external vendors"
                className="min-h-12 w-full sm:h-9 sm:min-h-0"
              />
            </div>
          </div>
        </CollapsedListFilters>
      </div>

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-left text-[11px]">
          <thead className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
            <tr data-testid="maint-active-work-orders-headers">
              <th className="w-10 px-2 py-1">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all rows" />
              </th>
              {orderedColumns.map((column) => (
                <TableHeaderCell
                  key={column.key}
                  columnKey={column.key}
                  label={column.header}
                  sortable={column.sortable && (MAINT_WO_HEADER_SORTABLE.has(column.key) || column.sortable)}
                  sortKey={effectiveSortKey}
                  sortDir={effectiveSortDir}
                  onToggleSort={toggleSort}
                  width={woColWidths[column.key]}
                  onResize={setWoColWidth}
                  draggable
                  dragHandleProps={dragHandleProps(column.key)}
                  dragOver={dragOverId === column.key}
                  className={column.className}
                  numeric={column.numeric}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={orderedColumns.length + 1} className="px-3 py-3 text-gray-400">
                  Loading work orders…
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 1} className="px-3 py-6 text-center text-sm text-gray-500">
                  No work orders found — none open for this entity yet (or no rows match the current filter).
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-slate-50">
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select work order ${row.display_id ?? row.id}`}
                    />
                  </td>
                  {orderedColumns.map((column) => (
                    <td key={column.key} className={`px-2 py-1.5 ${column.cellClass ?? ""}`}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
