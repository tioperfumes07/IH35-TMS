import { humanizeEnumLabel } from "../lib/humanizeEnumLabel";
import { MultiSelectDropdown } from "./forms/MultiSelectDropdown";
import { entityLabel } from "../lib/entity-label";
import { userFacingApiError } from "../lib/api-error-message";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { useBulkSelection } from "./bulk";
import { useBulkPermission } from "../hooks/useBulkPermission";
import { useToast } from "./Toast";
import { FleetBulkControls, type BulkApplyPayload } from "./fleet/BulkActionBar";
import { EditVehicleModal } from "./fleet/EditVehicleModal";
import { EditTrailerModal } from "./fleet/EditTrailerModal";
import { EntityLink } from "./shared/EntityLink";
import { ConfirmModal } from "./shared/ConfirmModal";
import { CollapsedListFilters, useStagedListFilters, type TableColumn } from "./table";
import { ParityTable, type ParityColumn } from "./parity/ParityTable";
import { patchUnit } from "../api/mdata";
import { patchTrailer } from "../api/fleet-trailers";
import { useUrlSort } from "../hooks/useUrlSort";
import { formatOosDate, formatOosDays } from "../lib/oos-display";
import { formatOdometerCellHonest } from "../lib/odometerHonesty";

export type FleetRow = {
  id: string;
  kind?: "truck" | "trailer";
  status?: string;
  unit_number?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: string | number;
  is_oos?: boolean;
  vehicle_type?: string | null;
  equipment_type?: string | null;
  type?: string;
  deactivated_at?: string | null;
  city?: string | null; // AUTO-05: live location (reverse-geo) merged from /telematics/fleet-location-hos
  state?: string | null;
  // Keystone: live maintenance status merged from /maintenance/fleet-table/rows (owner-company units).
  odometer_mi?: number | null;
  odometer_reading_at?: string | null;
  next_due_odometer?: number | null;
  open_wo_count?: number | null;
  oos_since?: string | null;
  days_oos?: number | null;
  oos_reason?: string | null;
  oos_location?: string | null;
  estimated_completion_date?: string | null;
  work_order_id?: string | null;
  work_order_display_id?: string | null;
  assigned_driver_id?: string | null;
  assigned_driver_name?: string | null;
  irp_expiration?: string | null;
  us_insurance_expiration?: string | null;
  mx_insurance_expiration?: string | null;
};

export type SoftDeleteFilter = "active" | "inactive" | "all";

type Props = {
  operatingCompanyId: string;
  rows: FleetRow[];
  softDeleteFilter: SoftDeleteFilter;
  onSoftDeleteFilterChange: (value: SoftDeleteFilter) => void;
  /**
   * Keystone opt-in (Maintenance fleet-table ONLY). When true, render the 3 maintenance columns
   * (Odometer · Next PM · Open WO), the Unit <Link>, and the CSV export. /fleet (FleetHomePage) does
   * NOT pass this → 8 registry cols + Edit, Unit EntityLink (unit|trailer), row-click still navigates.
   */
  showMaintenanceColumns?: boolean;
  /**
   * When true, roster free-text search lives on FleetTablePage (so "Showing X of Y"
   * stays honest). FleetTable still sorts/pages the already-search-filtered rows.
   */
  hideSearch?: boolean;
};

const FLEET_SELECTION_CAP = 100;

// Column registry for the gear/column-chooser. "Unit" is always visible (anchor column).
// This is the BASE set rendered everywhere (incl. /fleet) — unchanged from before the keystone.
type FleetColumn = TableColumn & { sortable: boolean };

const FLEET_COLUMNS: FleetColumn[] = [
  { key: "unit_number", label: "Unit", sortable: true, alwaysVisible: true },
  { key: "vin", label: "VIN", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "make_model", label: "Make/Model", sortable: true },
  { key: "year", label: "Year", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "assigned_driver", label: "Assigned Driver", sortable: true },
  { key: "irp_expiration", label: "IRP Expires", sortable: true },
  { key: "us_insurance_expiration", label: "US Insurance", sortable: true },
  { key: "mx_insurance_expiration", label: "MX Insurance", sortable: true },
  { key: "oos_reason", label: "OOS Reason", sortable: true },
  { key: "oos_since", label: "Down Since", sortable: true },
  { key: "days_oos", label: "Days OOS", sortable: true },
  { key: "estimated_completion_date", label: "Expected Return", sortable: true },
  { key: "work_order_id", label: "Work Order", sortable: true },
  { key: "location", label: "Location", sortable: true },
  { key: "dot_oo", label: "DOT O/O", sortable: true },
];

// Keystone maintenance columns — inserted before DOT O/O ONLY when showMaintenanceColumns is set.
const FLEET_MAINT_COLUMNS: FleetColumn[] = [
  { key: "odometer", label: "Odometer", sortable: true },
  { key: "next_pm", label: "Next PM", sortable: true },
  { key: "open_wo", label: "Open WO", sortable: true },
];

function fmtMiles(value: number | null | undefined, readingAt?: string | null): string {
  if (value == null) return formatOdometerCellHonest({ odometerMi: null, odometerReadingAt: readingAt });
  return `${Math.round(value).toLocaleString()} mi`;
}

// Same calendar-day presentation used by SevereRepairOosTab. Null means the unit was never
// explicitly put OOS; never invent a date or derive one from status history.
function fleetLocationText(row: FleetRow): string {
  return [row.city, row.state].filter(Boolean).join(", ");
}

function deriveVehicleType(row: FleetRow): string {
  if (row.kind === "trailer") {
    return row.equipment_type?.trim() || row.type?.trim() || "Trailer";
  }
  if (row.vehicle_type?.trim()) return row.vehicle_type.trim();
  const makeModel = [row.make, row.model].filter(Boolean).join(" ").trim();
  return makeModel || "Unknown";
}

function displayType(row: FleetRow): string {
  if (row.type?.trim()) return row.type.trim();
  if (row.kind === "trailer") return row.equipment_type?.trim() || "Trailer";
  return "Truck";
}

function fleetProfilePath(row: FleetRow): string {
  if (row.kind === "trailer") return `/fleet/trailers/${row.id}`;
  return `/fleet/units/${row.id}`;
}

// Stable searchable text per row (module-level so the controller's memo stays stable).
function fleetSearchText(row: FleetRow): string {
  return [row.unit_number, row.vin, row.make, row.model, row.type, row.vehicle_type, row.equipment_type, row.status, row.assigned_driver_name, row.id]
    .filter(Boolean)
    .join(" ");
}

/** Shared by FleetTablePage page-level search so Showing X of Y matches the table. */
export function fleetRosterSearchText(row: FleetRow): string {
  return fleetSearchText(row);
}

// Stable per-column sort value (module-level for memo stability).
function fleetSortValue(row: FleetRow, key: string): string | number | null {
  switch (key) {
    case "unit_number": return row.unit_number ?? null;
    case "vin": return row.vin ?? null;
    case "type": return displayType(row);
    case "make_model": return `${row.make ?? ""} ${row.model ?? ""}`.trim();
    case "year": return row.year != null ? Number(row.year) : null;
    // Humanised, not raw. The STATUS column rendered the machine enum on every row — "InService" on
    // all 109 units on prod. humanizeEnumLabel keeps the value (it is often the only status recorded)
    // while making it readable: "InService" -> "In service", "OutOfService" -> "Out of service".
    case "status": return row.status ? humanizeEnumLabel(row.status) : null;
    case "assigned_driver": return row.assigned_driver_name ?? null;
    case "irp_expiration": return row.irp_expiration ? new Date(row.irp_expiration).getTime() : null;
    case "us_insurance_expiration": return row.us_insurance_expiration ? new Date(row.us_insurance_expiration).getTime() : null;
    case "mx_insurance_expiration": return row.mx_insurance_expiration ? new Date(row.mx_insurance_expiration).getTime() : null;
    case "oos_reason": return row.oos_reason ?? null;
    case "oos_since": return row.oos_since ? new Date(row.oos_since).getTime() : null;
    case "days_oos": return row.days_oos ?? null;
    case "estimated_completion_date": return row.estimated_completion_date ? new Date(row.estimated_completion_date).getTime() : null;
    case "work_order_id": return row.work_order_display_id ?? row.work_order_id ?? null;
    case "location": return fleetLocationText(row) || null;
    case "odometer": return row.odometer_mi ?? null;
    case "next_pm": return row.next_due_odometer ?? null;
    case "open_wo": return row.open_wo_count ?? null;
    case "dot_oo": return row.kind === "trailer" ? null : row.is_oos ? 1 : 0;
    default: return null;
  }
}

export function FleetTable({
  operatingCompanyId,
  rows,
  softDeleteFilter,
  onSoftDeleteFilterChange,
  showMaintenanceColumns = false,
  hideSearch = false,
}: Props) {
  const navigate = useNavigate();

  // Active column set: base everywhere; maintenance columns inserted before DOT O/O only when opted in.
  const columns = useMemo(() => {
    if (!showMaintenanceColumns) return FLEET_COLUMNS;
    const dotIdx = FLEET_COLUMNS.findIndex((c) => c.key === "dot_oo");
    return [...FLEET_COLUMNS.slice(0, dotIdx), ...FLEET_MAINT_COLUMNS, ...FLEET_COLUMNS.slice(dotIdx)];
  }, [showMaintenanceColumns]);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const invalidateFleetCompany = (companyId: string) =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "maintenance" &&
        query.queryKey[1] === "fleet-table" &&
        query.queryKey.includes(companyId),
    });
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<FleetRow | null>(null);
  const [inactivateConfirmOpen, setInactivateConfirmOpen] = useState(false);

  // List-filter dropdowns (separate from the bulk-EDIT dropdowns of the same name).
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeListFilter, setTypeListFilter] = useState<string[]>([]);
  const staged = useStagedListFilters({
    applied: { softDeleteFilter, statusFilter, typeListFilter },
    empty: { softDeleteFilter: "active" as const, statusFilter: [] as string[], typeListFilter: [] as string[] },
    onApply: (next) => { onSoftDeleteFilterChange(next.softDeleteFilter); setStatusFilter(next.statusFilter); setTypeListFilter(next.typeListFilter); },
  });

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => String(r.status ?? "")).filter(Boolean))).sort(),
    [rows]
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map(displayType))).sort(),
    [rows]
  );

  const listFiltered = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter.length > 0 && !statusFilter.includes(String(r.status ?? ""))) return false;
        if (typeListFilter.length > 0 && !typeListFilter.includes(displayType(r))) return false;
        return true;
      }),
    [rows, statusFilter, typeListFilter]
  );

  // BANK-SORT-ROLLOUT-OPS — ?sort=/?dir= URL persistence (shareable/bookmarkable sort) via the shared
  // useUrlSort hook (BANK-SORT-ROLLOUT-ACCT), fed to ParityTable's controlled sort; ParityTable sorts the rows
  // with each column's sortValue (fleetSortValue — unchanged).
  const urlSort = useUrlSort();
  const vehicleTypes = useMemo(() => Array.from(new Set(rows.map(deriveVehicleType))), [rows]);

  const bulkPermission = useBulkPermission();
  const selection = useBulkSelection({
    cap: FLEET_SELECTION_CAP,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });
  const actionGenerationRef = useRef(0);

  // A company switch is a new action generation. Never let a completion submitted for the
  // previous entity clear the new entity's selection, show a success toast, or refresh the wrong
  // cache key. The selected company is also copied into every mutation input below; Owner RLS is
  // deliberately broad, so closing over the latest render is not an entity-scope guarantee.
  useEffect(() => {
    actionGenerationRef.current += 1;
    selection.clear();
    setInactivateConfirmOpen(false);
    setEditingUnitId(null);
    setEditingRow(null);
  }, [operatingCompanyId]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selection.selectedIds.has(row.id)),
    [rows, selection.selectedIds]
  );

  const hasTrailerSelection = useMemo(
    () => selectedRows.some((row) => row.kind === "trailer"),
    [selectedRows]
  );

  const truckBulkMutation = useMutation({
    mutationFn: (args: { companyId: string; generation: number; unitIds: string[]; patch: BulkApplyPayload }) =>
      apiRequest<{ affected_count: number }>(
        `/api/v1/mdata/units/bulk-update?operating_company_id=${encodeURIComponent(args.companyId)}`,
        {
          method: "POST",
          body: {
            unit_ids: args.unitIds,
            patch: args.patch,
          },
        }
      ),
  });

  const trailerBulkMutation = useMutation({
    mutationFn: (args: { companyId: string; generation: number; equipmentIds: string[]; patch: { status?: BulkApplyPayload["status"]; equipment_type?: string } }) =>
      apiRequest<{ affected_count: number }>(
        `/api/v1/mdata/equipment/bulk-update?operating_company_id=${encodeURIComponent(args.companyId)}`,
        {
          method: "POST",
          body: {
            equipment_ids: args.equipmentIds,
            patch: args.patch,
          },
        }
      ),
  });

  // BULK INACTIVATE = soft-delete (canonical deactivated_at), reusing the per-unit /deactivate
  // endpoints (units + equipment). NEVER a hard delete — the record is always retained. Inactive
  // is a separate dimension from the 5 operational statuses (Active/Sold/Transferred/Damaged/OOS).
  const inactivateMutation = useMutation({
    // Isolate per-unit failures (Promise.allSettled) so ONE failing /deactivate can't reject the
    // whole batch and freeze the page — a partial result is reported and the error surfaced.
    mutationFn: async (input: { companyId: string; generation: number; targets: FleetRow[] }) => {
      const results = await Promise.allSettled(
        input.targets.map((row) => {
          const resource = row.kind === "trailer" ? "equipment" : "units";
          return apiRequest(
            `/api/v1/mdata/${resource}/${row.id}/deactivate?operating_company_id=${encodeURIComponent(input.companyId)}`,
            { method: "POST", body: {} }
          );
        })
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const firstError = failures[0]?.reason;
      const failedTargets = input.targets.filter((_row, index) => results[index]?.status === "rejected");
      if (failures.length > 0) {
        throw Object.assign(new Error(userFacingApiError(firstError, "Inactivate failed")), {
          ok,
          failed: failures.length,
          failedTargets,
        });
      }
      return { ok };
    },
    onSuccess: ({ ok }, input) => {
      if (input.generation !== actionGenerationRef.current || input.companyId !== operatingCompanyId) return;
      pushToast(`${ok} fleet asset(s) inactivated`, "success");
      selection.clear();
      void invalidateFleetCompany(input.companyId);
    },
    onError: (error, input) => {
      if (input.generation !== actionGenerationRef.current || input.companyId !== operatingCompanyId) return;
      const partial = error as Error & { ok?: number; failed?: number; failedTargets?: FleetRow[] };
      if (partial.failedTargets?.length) {
        selection.setSelectedIds(new Set(partial.failedTargets.map((row) => row.id)));
      }
      const prefix = partial.ok ? `${partial.ok} inactivated · ${partial.failed ?? 0} failed. ` : "";
      pushToast(`${prefix}${userFacingApiError(error, "Bulk inactivate failed")}`, "error");
      if (partial.ok) void invalidateFleetCompany(input.companyId);
    },
  });

  // BULK REACTIVATE = clear deactivated_at via the existing PATCH endpoints (units +
  // equipment both accept deactivated_at:null). Soft-delete is reversible — never a hard op.
  const reactivateMutation = useMutation({
    mutationFn: async (input: { companyId: string; generation: number; targets: FleetRow[] }) => {
      const results = await Promise.allSettled(
        input.targets.map((row) =>
          row.kind === "trailer"
            ? patchTrailer(row.id, input.companyId, { deactivated_at: null })
            : patchUnit(row.id, input.companyId, { deactivated_at: null })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      return { ok, failed: failures.length, firstError: failures[0]?.reason };
    },
    onSuccess: ({ ok, failed, firstError }, input) => {
      if (input.generation !== actionGenerationRef.current || input.companyId !== operatingCompanyId) return;
      if (ok > 0) pushToast(`${ok} unit(s) reactivated${failed ? ` · ${failed} failed` : ""}`, failed ? "error" : "success");
      else pushToast(userFacingApiError(firstError, "Reactivate failed"), "error");
      selection.clear();
      void invalidateFleetCompany(input.companyId);
    },
    onError: (error, input) => {
      if (input.generation !== actionGenerationRef.current || input.companyId !== operatingCompanyId) return;
      pushToast(userFacingApiError(error, "Bulk reactivate failed"), "error");
    },
  });

  const bulkApplying =
    truckBulkMutation.isPending ||
    trailerBulkMutation.isPending ||
    inactivateMutation.isPending ||
    reactivateMutation.isPending;

  const applyBulk = async (patch: BulkApplyPayload) => {
    const companyId = operatingCompanyId;
    const generation = actionGenerationRef.current;
    const trucks = selectedRows.filter((row) => row.kind !== "trailer").map((row) => ({ ...row }));
    const trailers = selectedRows.filter((row) => row.kind === "trailer").map((row) => ({ ...row }));
    let affected = 0;

    try {
      if (trucks.length > 0) {
        const res = await truckBulkMutation.mutateAsync({
          companyId,
          generation,
          unitIds: trucks.map((row) => row.id),
          patch,
        });
        affected += res.affected_count;
        if (generation !== actionGenerationRef.current || companyId !== operatingCompanyId) return;
      }
      if (trailers.length > 0) {
        const trailerPatch: { status?: BulkApplyPayload["status"]; equipment_type?: string } = {};
        if (patch.status) trailerPatch.status = patch.status;
        if (patch.equipment_type) {
          trailerPatch.equipment_type = patch.equipment_type;
        } else if (patch.vehicle_type) {
          const normalized = patch.vehicle_type.replace(/\s+/g, "");
          const allowed = [
            "DryVan",
            "Reefer",
            "Flatbed",
            "Tanker",
            "Container",
            "Chassis",
            "StepDeck",
            "Lowboy",
            "Conestoga",
            "RGN",
            "Other",
          ] as const;
          const match = allowed.find((value) => value.toLowerCase() === normalized.toLowerCase());
          if (match) trailerPatch.equipment_type = match;
        }
        if (Object.keys(trailerPatch).length > 0) {
          const res = await trailerBulkMutation.mutateAsync({
            companyId,
            generation,
            equipmentIds: trailers.map((row) => row.id),
            patch: trailerPatch,
          });
          affected += res.affected_count;
        }
      }
      if (generation !== actionGenerationRef.current || companyId !== operatingCompanyId) return;
      pushToast(`${affected} fleet assets updated`, "success");
      selection.clear();
      void invalidateFleetCompany(companyId);
    } catch (error) {
      if (generation !== actionGenerationRef.current || companyId !== operatingCompanyId) return;
      pushToast(userFacingApiError(error, "Bulk update failed"), "error");
    }
  };

  const onInactivateSelected = useCallback(() => {
    if (selectedRows.length === 0) return;
    setInactivateConfirmOpen(true);
  }, [selectedRows]);

  const onReactivateSelected = useCallback(() => {
    if (selectedRows.length === 0) return;
    reactivateMutation.mutate({
      companyId: operatingCompanyId,
      generation: actionGenerationRef.current,
      targets: selectedRows.map((row) => ({ ...row })),
    });
  }, [selectedRows, reactivateMutation, operatingCompanyId]);

  // LEAD 443.181 — the roster renders on THE one table component (ParityTable): sort, column chooser,
  // drag-reorder, resize, paging, search/range and CSV export are ParityTable's; every cell, sort value and
  // export value below is the same expression the hand-built table used.
  const renderFleetCell = (row: FleetRow, key: string): ReactNode => {
    switch (key) {
      case "unit_number":
        // Maintenance view: Link to the profile; the two arms stay distinct (LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES).
        // Base /fleet: EntityLink, never plain text or Link, so the reverse_link is Live-clickable.
        return showMaintenanceColumns ? <Link to={fleetProfilePath(row)} className="font-semibold text-[#1F2A44] hover:underline">{entityLabel(row.unit_number, row.id, "Unit")}</Link> : <EntityLink kind={row.kind === "trailer" ? "trailer" : "unit"} id={row.id} label={entityLabel(row.unit_number, row.id, row.kind === "trailer" ? "Trailer" : "Unit")} className="font-semibold text-[#1F2A44] hover:underline" />;
      case "vin": return String(row.vin ?? "—");
      case "type": return displayType(row);
      case "make_model": return `${String(row.make ?? "—")} ${String(row.model ?? "")}`.trim();
      case "year": return String(row.year ?? "—");
      case "status": return row.status ? humanizeEnumLabel(row.status) : "—";
      case "assigned_driver": return row.assigned_driver_id ? <EntityLink kind="driver" id={row.assigned_driver_id} label={entityLabel(row.assigned_driver_name, row.assigned_driver_id, "Driver")} /> : "—";
      case "irp_expiration": return formatOosDate(row.irp_expiration);
      case "us_insurance_expiration": return formatOosDate(row.us_insurance_expiration);
      case "mx_insurance_expiration": return formatOosDate(row.mx_insurance_expiration);
      case "oos_reason": return row.oos_reason || "—";
      case "oos_since": return formatOosDate(row.oos_since);
      case "days_oos": return row.days_oos == null ? "—" : formatOosDays(row.days_oos);
      case "estimated_completion_date": return formatOosDate(row.estimated_completion_date);
      case "work_order_id": return row.work_order_id ? <EntityLink kind="work_order" id={row.work_order_id} label={entityLabel(row.work_order_display_id, row.work_order_id, "Work order")} /> : "—";
      case "location": return fleetLocationText(row) || row.oos_location || "—";
      case "odometer": return fmtMiles(row.odometer_mi, row.odometer_reading_at);
      case "next_pm": return fmtMiles(row.next_due_odometer);
      case "open_wo": return Number(row.open_wo_count ?? 0) > 0 ? <span className="font-semibold text-[#0F1219]">{row.open_wo_count ?? 0}</span> : <span className="text-gray-400">{row.kind === "trailer" ? "—" : "0"}</span>;
      case "dot_oo": return row.kind === "trailer" ? "—" : row.is_oos ? "Yes" : "No";
      default: return null;
    }
  };

  // Universal-list CSV export (exportFilename=fleet-table): same per-column text as before, fed to ParityTable's
  // export as each column's exportValue — the full filtered+sorted set, visible columns only.
  const fleetExportValue = (row: FleetRow, key: string): string => {
    switch (key) {
      case "unit_number": return entityLabel(row.unit_number, row.id, "Unit");
      case "vin": return String(row.vin ?? "");
      case "type": return displayType(row);
      case "make_model": return `${row.make ?? ""} ${row.model ?? ""}`.trim();
      case "year": return String(row.year ?? "");
      case "status": return String(row.status ?? "");
      case "assigned_driver": return String(row.assigned_driver_name ?? "");
      case "irp_expiration": return String(row.irp_expiration ?? "");
      case "us_insurance_expiration": return String(row.us_insurance_expiration ?? "");
      case "mx_insurance_expiration": return String(row.mx_insurance_expiration ?? "");
      case "location": return fleetLocationText(row);
      case "odometer": return row.odometer_mi != null ? String(Math.round(row.odometer_mi)) : "";
      case "next_pm": return row.next_due_odometer != null ? String(row.next_due_odometer) : "";
      case "open_wo": return row.open_wo_count != null ? String(row.open_wo_count) : "";
      case "dot_oo": return row.kind === "trailer" ? "" : row.is_oos ? "Yes" : "No";
      default: return "";
    }
  };

  const parityColumns: ParityColumn<FleetRow>[] = columns.map((column) => ({
    key: column.key,
    label: column.label,
    alwaysVisible: column.alwaysVisible,
    sortable: column.sortable,
    render: (row: FleetRow) => renderFleetCell(row, column.key),
    sortValue: (row: FleetRow) => fleetSortValue(row, column.key),
    exportValue: (row: FleetRow) => fleetExportValue(row, column.key),
  }));

  const selectedKeys = useMemo(() => [...selection.selectedIds], [selection.selectedIds]);

  return (
    <div className="space-y-2">
      <ParityTable<FleetRow>
        tableTestId="fleet-table"
        rowTestId={(row) => `fleet-row-${row.id}`}
        storageKey={showMaintenanceColumns ? "fleet-roster-maint" : "fleet-roster"}
        columns={parityColumns}
        rows={listFiltered}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(fleetProfilePath(row))}
        initialPageSize={50}
        suppressToolbarSearch={hideSearch}
        exportFilename={showMaintenanceColumns ? "fleet-table" : undefined}
        sortKey={urlSort.sortKey || undefined}
        sortDirection={urlSort.sortDirection}
        onSortChange={(key, dir) => urlSort.onSortChange(key, dir)}
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => selection.setSelectedIds(new Set(keys))}
        maxSelectable={FLEET_SELECTION_CAP}
        onSelectionCapExceeded={() => pushToast(`Select at most ${FLEET_SELECTION_CAP} units at a time.`, "error")}
        filterBar={
          <CollapsedListFilters
            activeFilterCount={(softDeleteFilter !== "active" ? 1 : 0) + (statusFilter.length > 0 ? 1 : 0) + (typeListFilter.length > 0 ? 1 : 0)}
            onApply={staged.apply}
            onReset={staged.reset}
            onCancel={staged.cancel}
            applyDisabled={!staged.dirty}
            testIdPrefix="fleet"
            dataAttributes={{ "data-fleet-filter-toolbar": "collapsed" }}
          >
            <div className="space-y-2">
              <div className="inline-flex rounded-sm border border-gray-300 bg-white p-0.5 text-xs" data-list-status-filter="fleet">
                {(["active", "inactive", "all"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-sm px-2 py-1 font-medium capitalize ${staged.draft.softDeleteFilter === value ? "bg-[#1F2A44] text-white" : "text-gray-700 hover:bg-gray-50"}`}
                    onClick={() => staged.setDraft({ ...staged.draft, softDeleteFilter: value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <MultiSelectDropdown
                label="Status"
                options={statusOptions.map((s) => ({ value: s, label: humanizeEnumLabel(s) }))}
                selected={staged.draft.statusFilter}
                onChange={(next) => staged.setDraft({ ...staged.draft, statusFilter: next })}
                data-testid="fleet-status-multiselect"
              />
              <MultiSelectDropdown
                label="Type"
                options={typeOptions.map((v) => ({ value: v, label: v }))}
                selected={staged.draft.typeListFilter}
                onChange={(next) => staged.setDraft({ ...staged.draft, typeListFilter: next })}
                data-testid="fleet-type-multiselect"
              />
            </div>
          </CollapsedListFilters>
        }
        batchActions={() =>
          // Same permission gate the shared BulkActionBar applied (useBulkPermission → write roles only).
          bulkPermission.canUseBulkOps ? (
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Bulk actions">
              <FleetBulkControls
                vehicleTypes={vehicleTypes}
                showTrailerTypeCatalog={hasTrailerSelection}
                onApply={applyBulk}
                applying={bulkApplying}
              />
              <button
                type="button"
                className="rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={bulkApplying || selection.count === 0}
                onClick={onInactivateSelected}
              >
                Inactivate selected
              </button>
              {softDeleteFilter !== "active" ? (
                <button
                  type="button"
                  className="rounded-sm border border-[#E5E7EB] bg-white px-2 py-1 text-xs font-semibold text-[#1F2A44] hover:bg-[#F7F8FA] disabled:opacity-50"
                  disabled={bulkApplying || selection.count === 0}
                  onClick={onReactivateSelected}
                >
                  Reactivate selected
                </button>
              ) : null}
            </div>
          ) : null
        }
        rowActionsWidth={72}
        rowActions={(row) => (
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            aria-label={
              row.kind === "trailer"
                ? `Edit trailer ${entityLabel(row.unit_number, row.id, "Trailer")}`
                : `Edit unit ${entityLabel(row.unit_number, row.id, "Unit")}`
            }
            onClick={() => {
              setEditingUnitId(row.id);
              setEditingRow(row);
            }}
          >
            Edit
          </button>
        )}
      />

      <EditVehicleModal
        open={editingUnitId !== null && editingRow?.kind !== "trailer"}
        unitId={editingUnitId}
        operatingCompanyId={operatingCompanyId}
        rowPreview={editingRow}
        onClose={() => {
          setEditingUnitId(null);
          setEditingRow(null);
        }}
        onSaved={() => pushToast("Unit updated", "success")}
      />
      <EditTrailerModal
        open={editingUnitId !== null && editingRow?.kind === "trailer"}
        trailerId={editingUnitId ?? ""}
        operatingCompanyId={operatingCompanyId}
        onClose={() => {
          setEditingUnitId(null);
          setEditingRow(null);
        }}
        onSaved={() => pushToast("Trailer updated", "success")}
      />
      <ConfirmModal
        open={inactivateConfirmOpen}
        title="Inactivate units"
        message={`Inactivate ${selectedRows.length} selected unit(s)? This soft-deletes them (reversible) — the records are retained.`}
        confirmLabel="Inactivate"
        danger
        onClose={() => setInactivateConfirmOpen(false)}
        onConfirm={async () => {
          await inactivateMutation.mutateAsync({
            companyId: operatingCompanyId,
            generation: actionGenerationRef.current,
            targets: selectedRows.map((row) => ({ ...row })),
          });
        }}
      />
    </div>
  );
}
