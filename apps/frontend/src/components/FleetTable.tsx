import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { BulkActionBar, TableSelection, TableSelectionHeader, useBulkSelection } from "./bulk";
import { useToast } from "./Toast";
import { FleetBulkControls, type BulkApplyPayload } from "./fleet/BulkActionBar";
import { EditVehicleModal } from "./fleet/EditVehicleModal";
import { TableControls, Paginator, TableHeaderCell, useTableController, type TableColumn } from "./table";
import { patchUnit } from "../api/mdata";
import { patchTrailer } from "../api/fleet-trailers";

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
};

export type SoftDeleteFilter = "active" | "inactive" | "all";

type Props = {
  operatingCompanyId: string;
  rows: FleetRow[];
  softDeleteFilter: SoftDeleteFilter;
  onSoftDeleteFilterChange: (value: SoftDeleteFilter) => void;
};

const FLEET_SELECTION_CAP = 100;

// Column registry for the gear/column-chooser. "Unit" is always visible (anchor column).
const FLEET_COLUMNS: TableColumn[] = [
  { key: "unit_number", label: "Unit", alwaysVisible: true },
  { key: "vin", label: "VIN" },
  { key: "type", label: "Type" },
  { key: "make_model", label: "Make/Model" },
  { key: "year", label: "Year" },
  { key: "status", label: "Status" },
  { key: "dot_oo", label: "DOT O/O" },
];

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
  return [row.unit_number, row.vin, row.make, row.model].filter(Boolean).join(" ");
}

// Stable per-column sort value (module-level for memo stability).
function fleetSortValue(row: FleetRow, key: string): string | number | null {
  switch (key) {
    case "unit_number": return row.unit_number ?? null;
    case "vin": return row.vin ?? null;
    case "type": return displayType(row);
    case "make_model": return `${row.make ?? ""} ${row.model ?? ""}`.trim();
    case "year": return row.year != null ? Number(row.year) : null;
    case "status": return row.status ?? null;
    case "dot_oo": return row.kind === "trailer" ? null : row.is_oos ? 1 : 0;
    default: return null;
  }
}

export function FleetTable({ operatingCompanyId, rows, softDeleteFilter, onSoftDeleteFilterChange }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<FleetRow | null>(null);

  // List-filter dropdowns (separate from the bulk-EDIT dropdowns of the same name).
  const [statusFilter, setStatusFilter] = useState("");
  const [typeListFilter, setTypeListFilter] = useState("");

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

  const table = useTableController<FleetRow>({
    rows: listFiltered,
    columns: FLEET_COLUMNS,
    tableKey: "fleet",
    searchText: fleetSearchText,
    sortValue: fleetSortValue,
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
    mutationFn: async (targets: FleetRow[]) => {
      let affected = 0;
      for (const row of targets) {
        const resource = row.kind === "trailer" ? "equipment" : "units";
        await apiRequest(`/api/v1/mdata/${resource}/${row.id}/deactivate`, { method: "POST", body: {} });
        affected += 1;
      }
      return affected;
    },
    onSuccess: (count) => {
      pushToast(`${count} unit(s) inactivated`, "success");
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : "Bulk inactivate failed", "error"),
  });

  // BULK REACTIVATE = clear deactivated_at via the existing PATCH endpoints (units +
  // equipment both accept deactivated_at:null). Soft-delete is reversible — never a hard op.
  const reactivateMutation = useMutation({
    mutationFn: async (targets: FleetRow[]) => {
      let affected = 0;
      for (const row of targets) {
        if (row.kind === "trailer") {
          await patchTrailer(row.id, operatingCompanyId, { deactivated_at: null });
        } else {
          await patchUnit(row.id, { deactivated_at: null });
        }
        affected += 1;
      }
      return affected;
    },
    onSuccess: (count) => {
      pushToast(`${count} unit(s) reactivated`, "success");
      selection.clear();
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    onError: (error) => pushToast(error instanceof Error ? error.message : "Bulk reactivate failed", "error"),
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
      pushToast(error instanceof Error ? error.message : "Bulk update failed", "error");
    }
  };

  const onInactivateSelected = useCallback(() => {
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Inactivate ${selectedRows.length} selected unit(s)? This soft-deletes them (reversible) — the records are retained.`)) {
      return;
    }
    inactivateMutation.mutate(selectedRows);
  }, [selectedRows, inactivateMutation]);

  const onReactivateSelected = useCallback(() => {
    if (selectedRows.length === 0) return;
    reactivateMutation.mutate(selectedRows);
  }, [selectedRows, reactivateMutation]);

  const isVisible = (key: string) => table.isColumnVisible(key);

  return (
    <div className="space-y-2">
      <TableControls
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search Unit #, VIN, Make/Model…"
        filteredCount={table.filteredCount}
        totalCount={rows.length}
        columns={FLEET_COLUMNS}
        hidden={table.hidden}
        onToggleColumn={table.toggleColumn}
        pageSize={table.pageSize}
        onPageSizeChange={table.setPageSize}
      >
        <div className="inline-flex rounded border border-gray-300 bg-white p-0.5 text-[11px]" data-list-status-filter="fleet">
          {(["active", "inactive", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded px-2 py-1 font-medium capitalize ${softDeleteFilter === value ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
              onClick={() => onSoftDeleteFilterChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by status"
          className="h-8 rounded border border-gray-300 px-2 text-[12px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          className="h-8 rounded border border-gray-300 px-2 text-[12px]"
          value={typeListFilter}
          onChange={(e) => setTypeListFilter(e.target.value)}
        >
          <option value="">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
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
          className="rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          disabled={bulkApplying || selection.count === 0}
          onClick={onInactivateSelected}
        >
          Inactivate selected
        </button>
        {softDeleteFilter !== "active" ? (
          <button
            type="button"
            className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
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
          <div className="overflow-hidden rounded border border-gray-200 bg-white">
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
                  {FLEET_COLUMNS.filter((c) => isVisible(c.key)).map((c) => (
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
                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select unit ${row.unit_number ?? row.id}`}
                        checked={selectCtx.isSelected(row.id)}
                        onChange={() => selectCtx.toggle(row.id)}
                      />
                    </td>
                    <td className="px-2 py-1">{String(row.unit_number ?? row.id ?? "—")}</td>
                    {isVisible("vin") ? <td className="truncate px-2 py-1">{String(row.vin ?? "—")}</td> : null}
                    {isVisible("type") ? <td className="truncate px-2 py-1">{displayType(row)}</td> : null}
                    {isVisible("make_model") ? (
                      <td className="truncate px-2 py-1">{`${String(row.make ?? "—")} ${String(row.model ?? "")}`.trim()}</td>
                    ) : null}
                    {isVisible("year") ? <td className="px-2 py-1">{String(row.year ?? "—")}</td> : null}
                    {isVisible("status") ? <td className="px-2 py-1">{String(row.status ?? "—")}</td> : null}
                    {isVisible("dot_oo") ? (
                      <td className="px-2 py-1">{row.kind === "trailer" ? "—" : row.is_oos ? "Yes" : "No"}</td>
                    ) : null}
                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
                        aria-label={`Edit unit ${row.unit_number ?? row.id}`}
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
        open={editingUnitId !== null}
        unitId={editingUnitId}
        operatingCompanyId={operatingCompanyId}
        rowPreview={editingRow}
        onClose={() => {
          setEditingUnitId(null);
          setEditingRow(null);
        }}
        onSaved={() => pushToast("Unit updated", "success")}
      />
    </div>
  );
}
