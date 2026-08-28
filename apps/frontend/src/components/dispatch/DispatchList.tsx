// @archived — DispatchList: superseded by DispatchBoard (pages/dispatch/DispatchBoard.tsx) via DispatchPage.
// Do not wire into routes/manifest. Enforced by verify-dispatch-list-orphaned.mjs. (0243-c1-4)
import { useMemo, useState } from "react";
import type { DispatchLoadRow } from "../../api/loads";
import "../../design/design-tokens.css";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { ParityTable } from "../parity/ParityTable";
import { flagDotColor, flagDotLabel, flagDotTag, hasVisibleFlag, STATUS_LABEL, formatMoneyCents } from "./constants";
import { DriverHosPill } from "../../pages/dispatch/DriverHosPill";
import { DriverHosClockValue, DriverHosStatusDot } from "./hos/DriverHosClocks";
import { HOS_COLUMNS } from "./hos/hosClocks";
import { InlineUnitPicker } from "./InlineUnitPicker";
import { InlineDriverPicker } from "./InlineDriverPicker";
import type { DispatchListProps, SortField } from "./dispatchListTypes";
import { entityLabel } from "../../lib/entity-label";

export type { DispatchListProps } from "./dispatchListTypes";

type RowOverride = {
  unitId?: string | null;
  unitLabel?: string;
  driverId?: string | null;
  driverLabel?: string;
};

function statusVariant(status: DispatchLoadRow["status"]) {
  if (status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "delivered") return "bg-slate-100 text-slate-700";
  if (status === "in_transit" || status === "at_pickup" || status === "at_delivery") return "bg-slate-100 text-slate-700";
  if (status === "closed" || status === "paid" || status === "invoiced") return "bg-gray-200 text-gray-700";
  return "bg-slate-100 text-slate-700";
}

function progressPill(progress?: DispatchLoadRow["progress_status"]) {
  if (progress === "early" || progress === "on_track") return "bg-slate-100 text-slate-700";
  if (progress === "behind") return "bg-slate-100 text-slate-700";
  if (progress === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

export function DispatchList({
  loads,
  activeGeofenceBreachVehicleIds,
  totalCount,
  limit,
  offset,
  loading,
  sortField,
  sortDirection,
  onSortChange,
  onPageChange,
  onRowClick,
  onExportCsv,
  listError,
  showEtaColumn = false,
  bulkSelection,
  onExportSelectedCsv,
  selectedCount = 0,
  inlineQuicksaveEnabled = false,
  operatingCompanyId,
  openPreSettlements,
  onAddToPreSettlement,
}: DispatchListProps) {
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const effectiveLoads = useMemo(
    () =>
      loads.map((load) => {
        const override = rowOverrides[load.id];
        if (!override) return load;
        return {
          ...load,
          assigned_unit_id: override.unitId !== undefined ? override.unitId : load.assigned_unit_id,
          assigned_unit_number: override.unitLabel ?? load.assigned_unit_number,
          assigned_primary_driver_id:
            override.driverId !== undefined ? override.driverId : load.assigned_primary_driver_id,
          assigned_primary_driver_name: override.driverLabel ?? load.assigned_primary_driver_name,
        };
      }),
    [loads, rowOverrides]
  );

  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, totalCount);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  const onHeaderClick = (field: SortField) => {
    if (sortField !== field) {
      onSortChange(field, "asc");
      return;
    }
    onSortChange(field, sortDirection === "asc" ? "desc" : "asc");
  };

  if (listError) {
    return (
      <section className="space-y-2">
        <ListErrorState
          title="Couldn't load dispatch list"
          status={listError.status}
          message={listError.message}
          onRetry={listError.onRetry}
        />
      </section>
    );
  }

  if (!loading && loads.length === 0) {
    return (
      <div className="rounded-sm border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No loads match your filters.{" "}
        <button type="button" className="font-semibold text-slate-700 hover:underline" onClick={() => onPageChange(0)}>
          Go back to first page
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Showing {from}-{to} of {totalCount}</div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && onExportSelectedCsv ? (
            <Button type="button" variant="secondary" size="sm" onClick={onExportSelectedCsv}>
              Export Selected to CSV
            </Button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={onExportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* DISP-F3600: ParityTable owns Search+Range+gear on archived DispatchList desktop grid. */}
      <div className="hidden md:block">
        <ParityTable<DispatchLoadRow>
          rows={effectiveLoads}
          pageSize={limit}
          hidePager
          rowKey={(load) => load.id}
          loading={loading}
          storageKey="dispatch-list-archived"
          exportFilename="dispatch-list"
          tableTestId="dispatch-list-parity-table"
          emptyText="No loads match your filters."
          onRowClick={(load) => onRowClick(load.id)}
          selectable={Boolean(bulkSelection)}
          selectedKeys={bulkSelection ? [...bulkSelection.selectedIds] : undefined}
          onSelectionChange={
            bulkSelection
              ? (keys) => bulkSelection.onSelectionChange(new Set(keys))
              : undefined
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
              {(
                [
                  ["load_number", "Load #"],
                  ["status", "Status"],
                  ["rate_total_cents", "Rate"],
                  ["created_at", "Created"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="inline-flex items-center gap-0.5 rounded-sm border border-gray-200 px-1.5 py-0.5 hover:bg-gray-50"
                  onClick={() => onHeaderClick(key)}
                >
                  {label}
                  {sortField === key ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
              ))}
            </div>
          }
          columns={[
            {
              key: "flag",
              label: "Flag",
              alwaysVisible: true,
              render: (load) =>
                hasVisibleFlag(load.flag_code) ? (
                  <span
                    className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ backgroundColor: flagDotColor(load.flag_code) }}
                    title={flagDotLabel(load.flag_code)}
                  >
                    {flagDotTag(load.flag_code)}
                  </span>
                ) : null,
            },
            {
              key: "load_number",
              label: "Load #",
              cellClass: "code-cell font-medium text-gray-800",
              render: (load) => {
                const effectiveDriverId = rowOverrides[load.id]?.driverId ?? load.assigned_primary_driver_id;
                const openPreSettlement = effectiveDriverId ? openPreSettlements?.get(effectiveDriverId) : undefined;
                const showPreSettlementPrompt = Boolean(
                  openPreSettlement &&
                    openPreSettlement.first_load_id !== load.id &&
                    !["delivered", "delivered_pending_docs", "completed_docs_received", "closed", "paid", "invoiced", "cancelled"].includes(
                      load.status
                    )
                );
                return (
                  <div className="space-y-1">
                    <div>{entityLabel(load.load_number, load.id, "Load")}</div>
                    {showPreSettlementPrompt && openPreSettlement ? (
                      <div
                        className="flex flex-wrap items-center gap-2 rounded-sm bg-slate-100 px-2 py-1 text-xs text-slate-700"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="font-semibold">Driver has open pre-settlement</span>
                        {openPreSettlement.settlement_number ? (
                          <span className="font-mono text-slate-700">
                            {entityLabel(openPreSettlement.settlement_number, openPreSettlement.settlement_id, "Settlement")}
                          </span>
                        ) : null}
                        <span className="text-slate-700">· add this load to it?</span>
                        <button
                          type="button"
                          className="rounded-sm bg-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAddToPreSettlement?.(openPreSettlement.settlement_id, load.id, load.operating_company_id);
                          }}
                        >
                          Add to it
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "customer",
              label: "Customer",
              cellClass: "min-w-0 max-w-[240px]",
              render: (load) => (
                <span title={load.customer_name ?? undefined} className="single-line-name">
                  {entityLabel(load.customer_name, null, "Customer")}
                </span>
              ),
            },
            {
              key: "pickup",
              label: "Pickup",
              render: (load) => load.first_pickup_city ?? "-",
            },
            {
              key: "delivery",
              label: "Delivery",
              render: (load) => load.first_delivery_city ?? "-",
            },
            {
              key: "unit",
              label: "Unit",
              cellClass: "code-cell",
              render: (load) =>
                inlineQuicksaveEnabled && operatingCompanyId ? (
                  <span onClick={(event) => event.stopPropagation()}>
                    <InlineUnitPicker
                      loadId={load.id}
                      operatingCompanyId={operatingCompanyId}
                      unitId={load.assigned_unit_id}
                      displayLabel={entityLabel(load.assigned_unit_number, load.assigned_unit_id, "Unit")}
                      onAssigned={({ unitId, label }) =>
                        setRowOverrides((prev) => ({
                          ...prev,
                          [load.id]: { ...prev[load.id], unitId, unitLabel: label },
                        }))
                      }
                      onRollback={() =>
                        setRowOverrides((prev) => {
                          const next = { ...prev };
                          delete next[load.id]?.unitId;
                          return next;
                        })
                      }
                    />
                  </span>
                ) : (
                  load.assigned_unit_number ?? entityLabel(null, load.assigned_unit_id, "Unit")
                ),
            },
            {
              key: "driver",
              label: "Driver",
              cellClass: "min-w-0 max-w-[240px]",
              render: (load) =>
                inlineQuicksaveEnabled && operatingCompanyId ? (
                  <span onClick={(event) => event.stopPropagation()}>
                    <InlineDriverPicker
                      loadId={load.id}
                      operatingCompanyId={operatingCompanyId}
                      driverId={load.assigned_primary_driver_id}
                      displayLabel={entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")}
                      onAssigned={({ driverId, label }) =>
                        setRowOverrides((prev) => ({
                          ...prev,
                          [load.id]: { ...prev[load.id], driverId, driverLabel: label },
                        }))
                      }
                      onRollback={() =>
                        setRowOverrides((prev) => {
                          const next = { ...prev };
                          delete next[load.id]?.driverId;
                          return next;
                        })
                      }
                    />
                  </span>
                ) : (
                  <span title={load.assigned_primary_driver_name ?? undefined} className="single-line-name inline-flex items-center gap-1.5">
                    <DriverHosStatusDot driverId={load.assigned_primary_driver_id} operatingCompanyId={load.operating_company_id} />
                    {entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")}
                  </span>
                ),
            },
            ...HOS_COLUMNS.map((c, cIndex) => ({
              key: `hos_${c.key}`,
              label: c.label,
              cellClass: "font-mono text-[11px] text-gray-700",
              render: (load: DispatchLoadRow) => (
                <DriverHosClockValue
                  driverId={load.assigned_primary_driver_id}
                  operatingCompanyId={load.operating_company_id}
                  colKey={c.key}
                  // HOS-RETRY-CONCAT: only the first of the 6 HOS columns shows a Retry control on
                  // error — all 6 share one query, so 6 independent buttons rendered with no separator.
                  showRetryOnError={cIndex === 0}
                />
              ),
            })),
            {
              key: "status",
              label: "Status",
              render: (load) => (
                <div className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusVariant(load.status)}`}>
                    {STATUS_LABEL[load.status]}
                  </span>
                  {load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id) ? (
                    <span className="rounded-sm bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Geofence alert</span>
                  ) : null}
                </div>
              ),
            },
            {
              key: "progress",
              label: "Progress",
              render: (load) => (
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${progressPill(load.progress_status)}`}
                  title={
                    load.progress_eta_delta_minutes == null
                      ? "No live GPS/appointment delta available."
                      : `ETA delta vs scheduled: ${load.progress_eta_delta_minutes} min`
                  }
                >
                  {(load.progress_status ?? "unknown").replace("_", " ")}
                </span>
              ),
            },
            ...(showEtaColumn
              ? [
                  {
                    key: "eta",
                    label: "ETA",
                    render: (load: DispatchLoadRow) => (
                      <span className="text-[11px] text-gray-600">
                        {load.status === "in_transit" && load.samsara_eta_at
                          ? new Date(load.samsara_eta_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                    ),
                  },
                ]
              : []),
            {
              key: "rate_total_cents",
              label: "Rate",
              render: (load) => formatMoneyCents(load.rate_total_cents, load.currency_code),
            },
            {
              key: "created_at",
              label: "Created",
              render: (load) => new Date(load.created_at).toLocaleDateString(),
            },
          ]}
        />
      </div>

      <div className="space-y-2 md:hidden">
        {loading ? <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-gray-500">Loading loads...</div> : null}
        {!loading &&
          loads.map((load) => (
            <button
              key={load.id}
              type="button"
              onClick={() => onRowClick(load.id)}
              className="w-full rounded-sm border border-gray-200 bg-white p-3 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="code-cell font-semibold">{entityLabel(load.load_number, load.id, "Load")}</div>
                <div>
                  {hasVisibleFlag(load.flag_code) ? (
                    <span
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                      style={{ backgroundColor: flagDotColor(load.flag_code) }}
                      title={flagDotLabel(load.flag_code)}
                    >
                      {flagDotTag(load.flag_code)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-1 min-w-0 text-sm text-gray-700">
                <span title={load.customer_name ?? undefined} className="single-line-name">
                  {entityLabel(load.customer_name, null, "Customer")}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {load.first_pickup_city ?? "-"} {"->"} {load.first_delivery_city ?? "-"}
              </div>
              <div className="mt-2 flex min-w-0 items-center justify-between text-xs">
                <span title={load.assigned_primary_driver_name ?? undefined} className="single-line-name">
                  {entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")}
                </span>
                <span>{formatMoneyCents(load.rate_total_cents, load.currency_code)}</span>
              </div>
              <div className="mt-2">
                <DriverHosPill driverId={load.assigned_primary_driver_id} operatingCompanyId={load.operating_company_id} />
              </div>
              <div className="mt-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${progressPill(load.progress_status)}`}
                  title={
                    load.progress_eta_delta_minutes == null
                      ? "No live GPS/appointment delta available."
                      : `ETA delta vs scheduled: ${load.progress_eta_delta_minutes} min`
                  }
                >
                  {(load.progress_status ?? "unknown").replace("_", " ")}
                </span>
                {load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id) ? (
                  <span className="ml-2 rounded-sm bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Geofence alert</span>
                ) : null}
              </div>
              {showEtaColumn && load.status === "in_transit" && load.samsara_eta_at ? (
                <div className="mt-2">
                  ETA {new Date(load.samsara_eta_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              ) : null}
            </button>
          ))}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
        <Button type="button" variant="secondary" size="sm" disabled={!hasPrev} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="text-gray-600">
          Showing {from}-{to} of {totalCount}
        </span>
        <Button type="button" variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPageChange(offset + limit)}>
          Next
        </Button>
      </div>
    </section>
  );
}
