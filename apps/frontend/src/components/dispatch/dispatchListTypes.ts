import type { DispatchLoadRow } from "../../api/loads";
import type { DataTableErrorState } from "../../lib/tableError";
import type { OpenPreSettlement } from "../../api/driverFinance";

export type SortField = "created_at" | "load_number" | "status" | "rate_total_cents";
export type SortDirection = "asc" | "desc";

/**
 * Shared props shape for the live DispatchBoard list surface.
 * Historically lived on the orphaned DispatchList component; kept here so
 * DispatchBoard does not import the @archived module.
 */
export type DispatchListProps = {
  loads: DispatchLoadRow[];
  activeGeofenceBreachVehicleIds?: Set<string>;
  totalCount: number;
  limit: number;
  offset: number;
  loading: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  onPageChange: (nextOffset: number) => void;
  onRowClick: (loadId: string) => void;
  onExportCsv: () => void;
  listError?: DataTableErrorState;
  /** P6-T11191: poll backend ETA for in_transit rows */
  showEtaColumn?: boolean;
  bulkSelection?: {
    selectedIds: Set<string>;
    onSelectionChange: (next: Set<string>) => void;
    pageRowIds: string[];
    onCapExceeded: (message: string) => void;
  };
  onExportSelectedCsv?: () => void;
  selectedCount?: number;
  inlineQuicksaveEnabled?: boolean;
  operatingCompanyId?: string;
  /** Pre-settlement trip-linking (MUST 8a.0.5.12): drivers with open pre-settlements */
  openPreSettlements?: Map<string, OpenPreSettlement>;
  /** Called when dispatcher clicks "Add to it" on a row with an open pre-settlement */
  onAddToPreSettlement?: (settlementId: string, loadId: string, operatingCompanyId: string) => void;
};
