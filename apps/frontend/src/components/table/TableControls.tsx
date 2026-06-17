import type { ReactNode } from "react";
import { TableSearch } from "./TableSearch";
import { ColumnChooser, type TableColumn } from "./ColumnChooser";

// GLOBAL-TABLE-CONTROLS — shared data-grid toolbar: search · list-filter slot · row count · gear.
// Reused by Fleet, Customers, Vendors, Drivers, and every list table (one definition, no re-forking).
type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filteredCount: number;
  totalCount: number;
  columns: TableColumn[];
  hidden: Set<string>;
  onToggleColumn: (key: string) => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  pageSizeOptions?: number[];
  /** List-filter dropdowns (Status, Type, Active/Inactive/All, …) — separate from bulk-edit. */
  children?: ReactNode;
};

export function TableControls({
  search,
  onSearchChange,
  searchPlaceholder,
  filteredCount,
  totalCount,
  columns,
  hidden,
  onToggleColumn,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  children,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-table-controls>
      <TableSearch value={search} onChange={onSearchChange} placeholder={searchPlaceholder} className="w-56" />
      {children}
      <span className="text-[11px] text-gray-500">
        {filteredCount === totalCount ? `${totalCount}` : `${filteredCount} of ${totalCount}`} rows
      </span>
      <div className="ml-auto">
        <ColumnChooser
          columns={columns}
          hidden={hidden}
          onToggleColumn={onToggleColumn}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={pageSizeOptions}
        />
      </div>
    </div>
  );
}
