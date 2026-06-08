import type { ReactNode } from "react";

export type SortType = "text" | "number" | "currency" | "date";

export type Density = "cozy" | "compact";

export interface ListViewColumn<T> {
  id: string;
  label: string;
  width?: number;
  pinned?: boolean;
  sortType?: SortType;
  render?: (row: T) => ReactNode;
  visible?: boolean;
}

export interface ListViewFilter {
  id: string;
  label: string;
  type: "multiselect" | "select" | "text";
  options?: { value: string; label: string }[];
}

export interface ActiveFilter {
  filterId: string;
  values: string[];
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface SortConfig {
  key: string;
  dir: "asc" | "desc";
  onChange: (key: string, dir: "asc" | "desc") => void;
}

export interface GearState {
  visibleColumns: Record<string, boolean>;
  includeInactive: boolean;
  statusFilter: "all" | "active" | "inactive";
  showBadges: boolean;
  pageSize: number;
  density: Density;
}

export interface ListViewProps<T> {
  columns: ListViewColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pagination: PaginationConfig;
  sort?: SortConfig;
  filters?: ListViewFilter[];
  onFilterChange?: (active: ActiveFilter[]) => void;
  batchActions?: ReactNode | ((selection: { selectedIds: string[]; selectedCount: number }) => ReactNode);
  filterBarSlot?: ReactNode;
  savedViewsKey?: string;
  showTotals?: boolean;
  badgeSlot?: (row: T) => ReactNode;
  onExport?: (format: "csv" | "xlsx", rows: T[], cols: ListViewColumn<T>[]) => void;
  density?: Density;
}
