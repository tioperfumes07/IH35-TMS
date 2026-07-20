import { useMemo, useState } from "react";
import type { CatalogColumnConfig, CatalogRow, CatalogSortConfig } from "../../hooks/useCatalogQuery";
import { Button } from "../Button";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { SelectCombobox } from "../shared/SelectCombobox";

const SELECTION_CAP = 200;

type Props = {
  catalogName: string;
  columns: CatalogColumnConfig[];
  rows: CatalogRow[];
  defaultSort: CatalogSortConfig;
  loading?: boolean;
  readOnly?: boolean;
  onEdit: (row: CatalogRow) => void;
  onArchive: (rows: CatalogRow[]) => void | Promise<void>;
  onRestore?: (rows: CatalogRow[]) => void | Promise<void>;
};

function statusPillClass(isActive: boolean) {
  return isActive
    ? "rounded-sm bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
    : "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

function renderCell(row: CatalogRow, key: string) {
  const value = row[key];
  if (key === "is_active" && typeof value === "boolean") {
    return <span className={statusPillClass(value)}>{value ? "Active" : "Inactive"}</span>;
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function CatalogTable({
  catalogName,
  columns,
  rows,
  defaultSort,
  loading = false,
  readOnly = false,
  onEdit,
  onArchive,
  onRestore,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"true" | "false" | "all">("true");
  const [sortKey, setSortKey] = useState(defaultSort.column);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(defaultSort.dir);
  const [bulkApplying, setBulkApplying] = useState(false);
  // Remount clears ParityTable internal selection after bulk archive/restore (no controlled API).
  const [tableResetKey, setTableResetKey] = useState(0);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "true" && row.is_active === false) return false;
      if (statusFilter === "false" && row.is_active !== false) return false;
      if (!needle) return true;
      return columns.some((column) => {
        if (column.filterable === false) return false;
        const value = row[column.key];
        return value !== null && value !== undefined && String(value).toLowerCase().includes(needle);
      });
    });
  }, [columns, rows, search, statusFilter]);

  const filterableColumns = columns.filter((column) => column.filterable !== false);

  const parityColumns = useMemo((): Array<ParityColumn<CatalogRow>> => {
    return columns.map((column) => ({
      key: column.key,
      label: column.label,
      sortable: column.sortable !== false,
      render: (row) => renderCell(row, column.key),
    }));
  }, [columns]);

  async function runBulkArchive(selected: CatalogRow[]) {
    if (selected.length === 0) return;
    setBulkApplying(true);
    try {
      await onArchive(selected);
      setTableResetKey((k) => k + 1);
    } finally {
      setBulkApplying(false);
    }
  }

  async function runBulkRestore(selected: CatalogRow[]) {
    if (!onRestore || selected.length === 0) return;
    setBulkApplying(true);
    try {
      await onRestore(selected);
      setTableResetKey((k) => k + 1);
    } finally {
      setBulkApplying(false);
    }
  }

  const emptyText = loading
    ? `Loading ${catalogName}...`
    : filteredRows.length === 0
      ? "No catalog rows found."
      : undefined;

  return (
    <div className="space-y-2">
      <ParityTable<CatalogRow>
        key={tableResetKey}
        storageKey={`catalog-table-${catalogName}`}
        tableTestId="catalog-table"
        rows={filteredRows}
        rowKey={(row) => row.id}
        columns={parityColumns}
        loading={loading}
        emptyText={emptyText}
        initialPageSize={50}
        pageSizeOptions={[25, 50, 100]}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDirection(dir);
        }}
        selectable={!readOnly}
        maxSelectable={SELECTION_CAP}
        filterBar={
          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${filterableColumns.map((column) => column.label.toLowerCase()).join(" or ") || "rows"}`}
              className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2"
            />
            <SelectCombobox
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "true" | "false" | "all")}
              className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
              <option value="all">All</option>
            </SelectCombobox>
          </div>
        }
        batchActions={(selected) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600">{selected.length} selected</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={readOnly || bulkApplying || selected.length === 0}
              onClick={() => void runBulkArchive(selected)}
            >
              Archive selected
            </Button>
            {onRestore ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={readOnly || bulkApplying || selected.length === 0}
                onClick={() => void runBulkRestore(selected)}
              >
                Restore selected
              </Button>
            ) : null}
          </div>
        )}
        rowActions={
          readOnly
            ? undefined
            : (row) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void onArchive([row])}>
                    Archive
                  </Button>
                </div>
              )
        }
      />
    </div>
  );
}
