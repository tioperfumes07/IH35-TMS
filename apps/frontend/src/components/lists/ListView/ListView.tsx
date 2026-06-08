import { useEffect, useMemo, useRef, useState } from "react";
import type { ListViewColumn, ListViewProps, GearState } from "./types";
import { useListSort } from "./hooks/useListSort";
import { useListFilters } from "./hooks/useListFilters";
import { useColumnReorder } from "./hooks/useColumnReorder";
import { useListSelection } from "./hooks/useListSelection";
import { useListView, buildDefaultGearState } from "./hooks/useListView";
import { useListExport } from "./hooks/useListExport";
import { useColumnWidths } from "../../../hooks/useColumnWidths";
import { ListViewHeader } from "./components/ListViewHeader";
import { ListViewRow } from "./components/ListViewRow";
import { ListViewFooter } from "./components/ListViewFooter";
import { ListViewGear } from "./components/ListViewGear";
import { ListViewFilterBar } from "./components/ListViewFilterBar";
import { BatchActionsBar } from "./components/BatchActionsBar";

export function ListView<T>({
  columns,
  rows,
  rowKey,
  pagination,
  sort,
  filters = [],
  onFilterChange,
  batchActions,
  filterBarSlot,
  savedViewsKey,
  showTotals = false,
  badgeSlot,
  onExport,
  density: densityProp = "cozy",
}: ListViewProps<T>) {
  const tableId = savedViewsKey ? `listview:${savedViewsKey}` : `listview:local`;

  const [gear, setGear] = useState<GearState>(() =>
    buildDefaultGearState(columns, densityProp, pagination.pageSize)
  );

  const { savedView, persistView, loading: _svLoading } = useListView(savedViewsKey, columns as ListViewColumn<unknown>[]);

  // Apply saved view settings once loaded
  useEffect(() => {
    if (!savedView) return;
    setGear((prev) => ({
      ...prev,
      visibleColumns: savedView.visibleColumns ?? prev.visibleColumns,
      pageSize: savedView.pageSize ?? prev.pageSize,
      density: savedView.density ?? prev.density,
      includeInactive: savedView.includeInactive ?? prev.includeInactive,
      statusFilter: savedView.statusFilter ?? prev.statusFilter,
      showBadges: savedView.showBadges ?? prev.showBadges,
    }));
  }, [savedView]);

  const handleGearChange = (next: GearState) => {
    setGear(next);
    if (savedViewsKey) {
      persistView({
        visibleColumns: next.visibleColumns,
        pageSize: next.pageSize,
        density: next.density,
        includeInactive: next.includeInactive,
        statusFilter: next.statusFilter,
        showBadges: next.showBadges,
      });
      if (next.pageSize !== gear.pageSize) {
        pagination.onPageSizeChange(next.pageSize);
      }
    }
  };

  const { sortKey, sortDir, handleSort, sortRows } = useListSort(sort);

  const { activeFilters, setFilter, clearAll, filterRows } = useListFilters(
    filters,
    onFilterChange
  );

  const initialOrder = useMemo(() => columns.map((c) => c.id), [columns]);
  const { order: columnOrder, setOrder, dragHandleProps, dragOverId } = useColumnReorder(
    savedView?.columnOrder ?? initialOrder
  );

  // Load column order from saved view once it arrives (useState init runs only once)
  useEffect(() => {
    if (savedView?.columnOrder && savedView.columnOrder.length > 0) {
      setOrder(savedView.columnOrder);
    }
  }, [savedView?.columnOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist column order whenever it changes (debounced inside persistView)
  const prevOrderRef = useRef<string[]>([]);
  useEffect(() => {
    if (!savedViewsKey) return;
    if (JSON.stringify(prevOrderRef.current) === JSON.stringify(columnOrder)) return;
    prevOrderRef.current = columnOrder;
    persistView({ columnOrder });
  }, [columnOrder, savedViewsKey, persistView]);

  const pinnedIds = useMemo(() => columns.filter((c) => c.pinned).map((c) => c.id), [columns]);

  const defaultWidths = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.width ?? 120])),
    [columns]
  );
  const { widths: columnWidths, setWidth } = useColumnWidths(tableId, defaultWidths);

  const processedRows = useMemo(() => {
    let result = filterRows(rows);
    result = sortRows(result, columns);
    return result;
  }, [rows, filterRows, sortRows, columns]);

  const pageRowKeys = useMemo(() => processedRows.map((r) => rowKey(r)), [processedRows, rowKey]);

  const { selected, selectAllPages, toggleRow, togglePage, selectAcrossPages, clearSelection, isSelected, selectedCount } =
    useListSelection(pagination.total);

  const allPageSelected = pageRowKeys.length > 0 && pageRowKeys.every((k) => isSelected(k));

  const selectedRows = useMemo(
    () => (selectAllPages ? processedRows : processedRows.filter((r) => selected.has(rowKey(r)))),
    [selectAllPages, processedRows, selected, rowKey]
  );

  const selectedIds = useMemo(() => selectedRows.map((row) => rowKey(row)), [selectedRows, rowKey]);

  const { exportCsv, exportXlsx } = useListExport();

  const visibleCols = useMemo(
    () => columns.filter((c) => gear.visibleColumns[c.id] !== false),
    [columns, gear.visibleColumns]
  );

  const handleExport = (format: "csv" | "xlsx") => {
    const exportRows = selectAllPages || selectedRows.length === 0 ? processedRows : selectedRows;
    if (onExport) {
      onExport(format, exportRows, visibleCols);
      return;
    }
    if (format === "csv") {
      exportCsv(exportRows, visibleCols);
    } else {
      void exportXlsx(exportRows, visibleCols);
    }
  };

  const density = gear.density;

  // Gate badgeSlot behind showBadges gear option
  const resolvedBadgeSlot = gear.showBadges ? badgeSlot : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
        <ListViewFilterBar
          filters={filters}
          activeFilters={activeFilters}
          rows={processedRows as Record<string, unknown>[]}
          onSetFilter={setFilter}
          onClearAll={clearAll}
          slot={filterBarSlot}
        />
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative group">
            <button
              type="button"
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
            >
              Export ▾
            </button>
            <div className="absolute right-0 top-7 z-20 hidden group-hover:flex flex-col bg-white border border-gray-200 rounded shadow-lg min-w-[100px]">
              <button
                type="button"
                onClick={() => handleExport("csv")}
                className="px-3 py-2 text-xs hover:bg-gray-50 text-left"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport("xlsx")}
                className="px-3 py-2 text-xs hover:bg-gray-50 text-left"
              >
                Excel (.xlsx)
              </button>
            </div>
          </div>
          <ListViewGear columns={columns} gear={gear} onGearChange={handleGearChange} />
        </div>
      </div>

      {/* Batch actions banner */}
      {selectedCount > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-200">
          <BatchActionsBar
            selectedCount={selectedCount}
            selectAllPages={selectAllPages}
            totalRows={pagination.total}
            onSelectAcrossPages={selectAcrossPages}
            onClearSelection={clearSelection}
          >
            {typeof batchActions === "function"
              ? batchActions({ selectedIds, selectedCount })
              : batchActions}
          </BatchActionsBar>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
          <ListViewHeader
            columns={columns}
            columnWidths={columnWidths}
            columnOrder={columnOrder}
            visibleColumns={gear.visibleColumns}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onWidthChange={setWidth}
            dragHandleProps={dragHandleProps}
            dragOverId={dragOverId}
            allPageSelected={allPageSelected}
            onTogglePage={() => togglePage(pageRowKeys)}
            density={density}
            pinnedIds={pinnedIds}
          />
          <tbody>
            {processedRows.map((row) => {
              const key = rowKey(row);
              return (
                <ListViewRow
                  key={key}
                  row={row}
                  rowKey={key}
                  columns={columns}
                  columnWidths={columnWidths}
                  columnOrder={columnOrder}
                  visibleColumns={gear.visibleColumns}
                  isSelected={isSelected(key)}
                  onToggleSelect={() => toggleRow(key)}
                  density={density}
                  pinnedIds={pinnedIds}
                  badgeSlot={resolvedBadgeSlot}
                />
              );
            })}
            {processedRows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleCols.length + 1}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  No rows to display
                </td>
              </tr>
            )}
          </tbody>
          <ListViewFooter
            columns={columns}
            columnWidths={columnWidths}
            columnOrder={columnOrder}
            visibleColumns={gear.visibleColumns}
            rows={processedRows}
            selectedRows={selectedRows}
            selectAllPages={selectAllPages}
            showTotals={showTotals}
            pagination={pagination}
            density={density}
          />
        </table>
      </div>
    </div>
  );
}
