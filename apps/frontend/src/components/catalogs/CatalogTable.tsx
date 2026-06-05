import { useMemo, useState } from "react";
import type { CatalogColumnConfig, CatalogRow, CatalogSortConfig } from "../../hooks/useCatalogQuery";
import { Button } from "../Button";
import { BulkActionBar, TableSelection, TableSelectionHeader, useBulkSelection } from "../bulk";
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
    ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
    : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc") {
  const left = a ?? "";
  const right = b ?? "";
  if (typeof left === "number" && typeof right === "number") {
    return dir === "asc" ? left - right : right - left;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return dir === "asc" ? Number(left) - Number(right) : Number(right) - Number(left);
  }
  const result = String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
  return dir === "asc" ? result : -result;
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
  const [sort, setSort] = useState<CatalogSortConfig>(defaultSort);
  const [bulkApplying, setBulkApplying] = useState(false);

  const selection = useBulkSelection({
    cap: SELECTION_CAP,
  });

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

  const sortedRows = useMemo(() => {
    const sortColumn = sort.column;
    return [...filteredRows].sort((a, b) => compareValues(a[sortColumn], b[sortColumn], sort.dir));
  }, [filteredRows, sort.column, sort.dir]);

  const pageRowIds = useMemo(() => sortedRows.map((row) => row.id), [sortedRows]);
  const selectedRows = useMemo(
    () => sortedRows.filter((row) => selection.selectedIds.has(row.id)),
    [selection.selectedIds, sortedRows]
  );

  const filterableColumns = columns.filter((column) => column.filterable !== false);

  async function runBulkArchive() {
    if (selectedRows.length === 0) return;
    setBulkApplying(true);
    try {
      await onArchive(selectedRows);
      selection.clear();
    } finally {
      setBulkApplying(false);
    }
  }

  async function runBulkRestore() {
    if (!onRestore || selectedRows.length === 0) return;
    setBulkApplying(true);
    try {
      await onRestore(selectedRows);
      selection.clear();
    } finally {
      setBulkApplying(false);
    }
  }

  function toggleSort(columnKey: string) {
    setSort((current) => {
      if (current.column !== columnKey) return { column: columnKey, dir: "asc" };
      return { column: columnKey, dir: current.dir === "asc" ? "desc" : "asc" };
    });
  }

  const emptyText = loading
    ? `Loading ${catalogName}...`
    : sortedRows.length === 0
      ? "No catalog rows found."
      : "";

  return (
    <div className="space-y-2">
      <BulkActionBar
        selectedCount={selection.count}
        actions={[
          {
            id: "archive",
            label: "Archive selected",
            destructive: true,
            action: "archive",
            disabled: readOnly,
            onClick: () => void runBulkArchive(),
          },
          ...(onRestore
            ? [
                {
                  id: "restore",
                  label: "Restore selected",
                  action: "restore",
                  disabled: readOnly,
                  onClick: () => void runBulkRestore(),
                },
              ]
            : []),
        ]}
        applying={bulkApplying}
        onClear={selection.clear}
        destructiveActions={["archive"]}
      />

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${filterableColumns.map((column) => column.label.toLowerCase()).join(" or ") || "rows"}`}
          className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "true" | "false" | "all")}
          className="h-9 rounded border border-gray-300 px-2 text-sm"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      <TableSelection
        rows={sortedRows}
        getId={(row) => row.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={SELECTION_CAP}
      >
        {(selectCtx) => (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <TableSelectionHeader
                      selectedIds={selection.selectedIds}
                      pageRowIds={pageRowIds}
                      onSelectionChange={selection.setSelectedIds}
                      cap={SELECTION_CAP}
                    />
                  </th>
                  {columns.map((column) => (
                    <th key={column.key} className="px-3 py-2 text-left">
                      {column.sortable === false ? (
                        column.label
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold hover:text-gray-900"
                          onClick={() => toggleSort(column.key)}
                        >
                          {column.label}
                          {sort.column === column.key ? (sort.dir === "asc" ? " ↑" : " ↓") : null}
                        </button>
                      )}
                    </th>
                  ))}
                  {!readOnly ? <th className="px-3 py-2 text-left">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectCtx.isSelected(row.id)}
                        onChange={() => selectCtx.toggle(row.id)}
                        aria-label={`Select row ${row.id}`}
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} className="px-3 py-2">
                        {renderCell(row, column.key)}
                      </td>
                    ))}
                    {!readOnly ? (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" size="sm" onClick={() => onEdit(row)}>
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void onArchive([row])}
                          >
                            Archive
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
          </div>
        )}
      </TableSelection>
    </div>
  );
}
