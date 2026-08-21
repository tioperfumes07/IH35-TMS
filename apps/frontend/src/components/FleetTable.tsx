import { humanizeEnumLabel } from "../lib/humanizeEnumLabel";
import { entityLabel } from "../lib/entity-label";
import { userFacingApiError } from "../lib/api-error-message";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { BulkActionBar, TableSelection, TableSelectionHeader, useBulkSelection } from "./bulk";
import { useToast } from "./Toast";
import { FleetBulkControls, type BulkApplyPayload } from "./fleet/BulkActionBar";
import { EditVehicleModal } from "./fleet/EditVehicleModal";
import { EditTrailerModal } from "./fleet/EditTrailerModal";
import { EntityLink } from "./shared/EntityLink";
import { ConfirmModal } from "./shared/ConfirmModal";
import { TableControls, Paginator, TableHeaderCell, useTableController, CollapsedListFilters, useStagedListFilters, type TableColumn } from "./table";
import { patchUnit } from "../api/mdata";
import { patchTrailer } from "../api/fleet-trailers";
import { useUrlSort } from "../hooks/useUrlSort";

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
  next_due_odometer?: number | null;
  open_wo_count?: number | null;
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
const FLEET_COLUMNS: TableColumn[] = [
  { key: "unit_number", label: "Unit", alwaysVisible: true },
  { key: "vin", label: "VIN" },
  { key: "type", label: "Type" },
  { key: "make_model", label: "Make/Model" },
  { key: "year", label: "Year" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "dot_oo", label: "DOT O/O" },
];

// Keystone maintenance columns — inserted before DOT O/O ONLY when showMaintenanceColumns is set.
const FLEET_MAINT_COLUMNS: TableColumn[] = [
  { key: "odometer", label: "Odometer" },
  { key: "next_pm", label: "Next PM" },
  { key: "open_wo", label: "Open WO" },
];

function fmtMiles(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value).toLocaleString()} mi`;
}

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
  return [row.unit_number, row.vin, row.make, row.model, row.type, row.vehicle_type, row.equipment_type, row.status, row.id]
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
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<FleetRow | null>(null);
  const [inactivateConfirmOpen, setInactivateConfirmOpen] = useState(false);

  // List-filter dropdowns (separate from the bulk-EDIT dropdowns of the same name).
  const [statusFilter, setStatusFilter] = useState("");
  const [typeListFilter, setTypeListFilter] = useState("");
  const staged = useStagedListFilters({
    applied: { softDeleteFilter, statusFilter, typeListFilter },
    empty: { softDeleteFilter: "active" as const, statusFilter: "", typeListFilter: "" },
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
        if (statusFilter && String(r.status ?? "") !== statusFilter) return false;
        if (typeListFilter && displayType(r) !== typeListFilter) return false;
        return true;
      }),
    [rows, statusFilter, typeListFilter]
  );

  // BANK-SORT-ROLLOUT-OPS — ?sort=/?dir= URL persistence (shareable/bookmarkable sort) via the shared
  // useUrlSort hook (BANK-SORT-ROLLOUT-ACCT). Client-side sort logic is unchanged (useTableController +
  // fleetSortValue); this only seeds the initial state from the URL and mirrors every header click back
  // into it. useTableController's toggleSort is 3-state (asc\u2192desc\u2192unsorted); an empty-string key
  // clears the URL param (see useUrlSort.onSortChange).
  const urlSort = useUrlSort();
  const table = useTableController<FleetRow>({
    rows: listFiltered,
    columns,
    // Separate persisted column prefs for the maintenance view so /fleet's stored prefs stay identical.
    tableKey: showMaintenanceColumns ? "fleet-maint" : "fleet",
    searchText: fleetSearchText,
    sortValue: fleetSortValue,
    initialSortKey: urlSort.sortKey || null,
    initialSortDir: urlSort.sortDirection,
    onSortChange: (key, dir) => urlSort.onSortChange(key ?? "", dir),
    defaultPageSize: 50,
  });

  const pageRows = table.paged;
  // select-all targets ONLY the current filtered page — never the whole hidden fleet.
  const pageRowIds = useMemo(() => pageRows.map((row) => row.id), [pageRows]);
  const vehicleTypes = useMemo(() => Array.from(new Set(rows.map(deriveVehicleType))), [rows]);

  const selection = useBulkSelection({
    cap: FLEET_SELECTION_CAP,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });

  const selectedRows = useMemo(
    () => rows.filter((row) => selection.selectedIds.has(row.id)),
    [rows, selection.selectedIds]
  );

  const hasTrailerSelection = useMemo(
    () => selectedRows.some((row) => row.kind === "trailer"),
    [selectedRows]
  );

  const truckBulkMutation = useMutation({
    mutationFn: (args: { unitIds: string[]; patch: BulkApplyPayload }) =>
      apiRequest<{ affected_count: number }>(
        `/api/v1/mdata/units/bulk-update?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
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
    mutationFn: (args: { equipmentIds: string[]; patch: { status?: BulkApplyPayload["status"]; equipment_type?: string } }) =>
      apiRequest<{ affected_count: number }>(
        `/api/v1/mdata/equipment/bulk-update?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
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
    mutationFn: async (targets: FleetRow[]) => {
      const results = await Promise.allSettled(
        targets.map((row) => {
          const resource = row.kind === "trailer" ? "equipment" : "units";
          return apiRequest(`/api/v1/mdata/${resource}/${row.id}/deactivate`, { method: "POST", body: {} });
        })
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const firstError = failures[0]?.reason;
      return { ok, failed: failures.length, firstError };
    },
    onSuccess: ({ ok, failed, firstError }) => {
      if (ok > 0) pushToast(`${ok} unit(s) inactivated${failed ? ` · ${failed} failed` : ""}`, failed ? "error" : "success");
      else pushToast(userFacingApiError(firstError, "Inactivate failed"), "error");
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    // allSettled never rejects, but keep onError as a backstop so a thrown error can't hang the UI.
    onError: (error) => pushToast(userFacingApiError(error, "Bulk inactivate failed"), "error"),
  });

  // BULK REACTIVATE = clear deactivated_at via the existing PATCH endpoints (units +
  // equipment both accept deactivated_at:null). Soft-delete is reversible — never a hard op.
  const reactivateMutation = useMutation({
    mutationFn: async (targets: FleetRow[]) => {
      const results = await Promise.allSettled(
        targets.map((row) =>
          row.kind === "trailer"
            ? patchTrailer(row.id, operatingCompanyId, { deactivated_at: null })
            : patchUnit(row.id, operatingCompanyId, { deactivated_at: null })
        )
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      return { ok, failed: failures.length, firstError: failures[0]?.reason };
    },
    onSuccess: ({ ok, failed, firstError }) => {
      if (ok > 0) pushToast(`${ok} unit(s) reactivated${failed ? ` · ${failed} failed` : ""}`, failed ? "error" : "success");
      else pushToast(userFacingApiError(firstError, "Reactivate failed"), "error");
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Bulk reactivate failed"), "error"),
  });

  const bulkApplying =
    truckBulkMutation.isPending ||
    trailerBulkMutation.isPending ||
    inactivateMutation.isPending ||
    reactivateMutation.isPending;

  const applyBulk = async (patch: BulkApplyPayload) => {
    const trucks = selectedRows.filter((row) => row.kind !== "trailer");
    const trailers = selectedRows.filter((row) => row.kind === "trailer");
    let affected = 0;

    try {
      if (trucks.length > 0) {
        const res = await truckBulkMutation.mutateAsync({
          unitIds: trucks.map((row) => row.id),
          patch,
        });
        affected += res.affected_count;
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
            equipmentIds: trailers.map((row) => row.id),
            patch: trailerPatch,
          });
          affected += res.affected_count;
        }
      }
      pushToast(`${affected} fleet assets updated`, "success");
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    } catch (error) {
      pushToast(userFacingApiError(error, "Bulk update failed"), "error");
    }
  };

  const onInactivateSelected = useCallback(() => {
    if (selectedRows.length === 0) return;
    setInactivateConfirmOpen(true);
  }, [selectedRows]);

  const onReactivateSelected = useCallback(() => {
    if (selectedRows.length === 0) return;
    reactivateMutation.mutate(selectedRows);
  }, [selectedRows, reactivateMutation]);

  const isVisible = (key: string) => table.isColumnVisible(key);

  // Universal-list CSV export: the full filtered+sorted set, visible columns only (exportFilename=fleet-table).
  const exportCsv = useCallback(() => {
    const cols = columns.filter((c) => table.isColumnVisible(c.key));
    const cell = (row: FleetRow, key: string): string => {
      switch (key) {
        case "unit_number": return entityLabel(row.unit_number, row.id, "Unit");
        case "vin": return String(row.vin ?? "");
        case "type": return displayType(row);
        case "make_model": return `${row.make ?? ""} ${row.model ?? ""}`.trim();
        case "year": return String(row.year ?? "");
        case "status": return String(row.status ?? "");
        case "location": return fleetLocationText(row);
        case "odometer": return row.odometer_mi != null ? String(Math.round(row.odometer_mi)) : "";
        case "next_pm": return row.next_due_odometer != null ? String(row.next_due_odometer) : "";
        case "open_wo": return row.open_wo_count != null ? String(row.open_wo_count) : "";
        case "dot_oo": return row.kind === "trailer" ? "" : row.is_oos ? "Yes" : "No";
        default: return "";
      }
    };
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = cols.map((c) => esc(c.label)).join(",");
    const body = table.filtered.map((row) => cols.map((c) => esc(cell(row, c.key))).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fleet-table.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [table, columns]);

  return (
    <div className="space-y-2">
      <TableControls
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search Unit #, VIN, Make/Model…"
        filteredCount={table.filteredCount}
        totalCount={rows.length}
        columns={columns}
        hidden={table.hidden}
        onToggleColumn={table.toggleColumn}
        pageSize={table.pageSize}
        onPageSizeChange={table.setPageSize}
        range={table.range}
        onRangeApply={table.setRange}
        hideSearch={hideSearch}
      >
        <CollapsedListFilters
          activeFilterCount={(softDeleteFilter !== "active" ? 1 : 0) + (statusFilter ? 1 : 0) + (typeListFilter ? 1 : 0)}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="fleet"
          dataAttributes={{ "data-fleet-filter-toolbar": "collapsed" }}
        >
          <div className="space-y-2">
            <div className="inline-flex rounded-sm border border-gray-300 bg-white p-0.5 text-[11px]" data-list-status-filter="fleet">
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
            <select
              aria-label="Filter by status"
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-[12px]"
              value={staged.draft.statusFilter}
              onChange={(e) => staged.setDraft({ ...staged.draft, statusFilter: e.target.value })}
            >
              <option value="">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter by type"
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-[12px]"
              value={staged.draft.typeListFilter}
              onChange={(e) => staged.setDraft({ ...staged.draft, typeListFilter: e.target.value })}
            >
              <option value="">All types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </CollapsedListFilters>
        {showMaintenanceColumns ? (
          <button
            type="button"
            aria-label="Export CSV"
            className="h-8 rounded-sm border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
            onClick={exportCsv}
          >
            ⤓ Export
          </button>
        ) : null}
      </TableControls>

      <BulkActionBar
        selectedCount={selection.count}
        selectedLabel={`Selected: ${selection.count} units`}
        actions={[]}
        applying={bulkApplying}
        onClear={selection.clear}
      >
        <FleetBulkControls
          vehicleTypes={vehicleTypes}
          showTrailerTypeCatalog={hasTrailerSelection}
          onApply={applyBulk}
          applying={bulkApplying}
        />
        <button
          type="button"
          className="rounded-sm border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          disabled={bulkApplying || selection.count === 0}
          onClick={onInactivateSelected}
        >
          Inactivate selected
        </button>
        {softDeleteFilter !== "active" ? (
          <button
            type="button"
            className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={bulkApplying || selection.count === 0}
            onClick={onReactivateSelected}
          >
            Reactivate selected
          </button>
        ) : null}
      </BulkActionBar>

      <TableSelection
        rows={pageRows}
        getId={(row) => row.id}
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        pageRowIds={pageRowIds}
        cap={FLEET_SELECTION_CAP}
        onCapExceeded={(message) => pushToast(message, "error")}
      >
        {(selectCtx) => (
          <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
                <tr>
                  <th className="w-8 px-2 py-1">
                    <TableSelectionHeader
                      selectedIds={selection.selectedIds}
                      pageRowIds={pageRowIds}
                      onSelectionChange={selection.setSelectedIds}
                      cap={FLEET_SELECTION_CAP}
                      onCapExceeded={(message) => pushToast(message, "error")}
                      ariaLabel="Select all units on this page"
                    />
                  </th>
                  {columns.filter((c) => isVisible(c.key)).map((c) => (
                    <TableHeaderCell
                      key={c.key}
                      columnKey={c.key}
                      label={c.label}
                      sortKey={table.sortKey}
                      sortDir={table.sortDir}
                      onToggleSort={table.toggleSort}
                      width={table.widths[c.key]}
                      onResize={table.setColumnWidth}
                    />
                  ))}
                  <th className="w-14 px-2 py-1">Edit</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => navigate(fleetProfilePath(row))}
                  >
                    <td className="px-2 py-1" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select unit ${entityLabel(row.unit_number, row.id, "Unit")}`}
                        checked={selectCtx.isSelected(row.id)}
                        onChange={() => selectCtx.toggle(row.id)}
                      />
                    </td>
                    {showMaintenanceColumns ? (
                      <td className="px-2 py-1" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                        <Link to={fleetProfilePath(row)} className="font-semibold text-slate-700 hover:underline">
                          {entityLabel(row.unit_number, row.id, "Unit")}
                        </Link>
                      </td>
                    ) : (
                      /* Base /fleet: EntityLink (not plain text / not Link) so reverse_link is Live-clickable;
                       * arms stay distinct from maintenance Link (LV-FLEETTABLE-IDENTICAL-TERNARY-BRANCHES). */
                      <td className="px-2 py-1" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                        <EntityLink
                          kind={row.kind === "trailer" ? "trailer" : "unit"}
                          id={row.id}
                          label={entityLabel(
                            row.unit_number,
                            row.id,
                            row.kind === "trailer" ? "Trailer" : "Unit"
                          )}
                          className="font-semibold text-slate-700 hover:underline"
                        />
                      </td>
                    )}
                    {isVisible("vin") ? <td className="truncate px-2 py-1">{String(row.vin ?? "—")}</td> : null}
                    {isVisible("type") ? <td className="truncate px-2 py-1">{displayType(row)}</td> : null}
                    {isVisible("make_model") ? (
                      <td className="truncate px-2 py-1">{`${String(row.make ?? "—")} ${String(row.model ?? "")}`.trim()}</td>
                    ) : null}
                    {isVisible("year") ? <td className="px-2 py-1">{String(row.year ?? "—")}</td> : null}
                    {isVisible("status") ? <td className="px-2 py-1">{String(row.status ?? "—")}</td> : null}
                    {isVisible("location") ? <td className="truncate px-2 py-1 text-xs text-slate-700">{fleetLocationText(row) || "—"}</td> : null}
                    {showMaintenanceColumns && isVisible("odometer") ? <td className="px-2 py-1 tabular-nums">{fmtMiles(row.odometer_mi)}</td> : null}
                    {showMaintenanceColumns && isVisible("next_pm") ? <td className="px-2 py-1 tabular-nums">{fmtMiles(row.next_due_odometer)}</td> : null}
                    {showMaintenanceColumns && isVisible("open_wo") ? (
                      <td className="px-2 py-1 tabular-nums">
                        {row.open_wo_count != null && row.open_wo_count > 0 ? (
                          <span className="font-semibold text-slate-800">{row.open_wo_count}</span>
                        ) : (
                          <span className="text-gray-400">{row.kind === "trailer" ? "—" : "0"}</span>
                        )}
                      </td>
                    ) : null}
                    {isVisible("dot_oo") ? (
                      <td className="px-2 py-1">{row.kind === "trailer" ? "—" : row.is_oos ? "Yes" : "No"}</td>
                    ) : null}
                    <td className="px-2 py-1" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="rounded-sm border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableSelection>

      <Paginator page={table.page} pageCount={table.pageCount} onPageChange={table.setPage} />

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
        onConfirm={() => inactivateMutation.mutate(selectedRows)}
      />
    </div>
  );
}
