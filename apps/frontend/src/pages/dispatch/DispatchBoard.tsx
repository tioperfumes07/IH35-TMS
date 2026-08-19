import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DispatchLoadRow } from "../../api/loads";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";

// Record-cell link: the Customer cell links to the customer's detail page. stopPropagation so it does NOT
// also trigger the row's onRowClick (which opens the load drawer). Falls back to plain text when no id.
function renderCustomerCell(load: DispatchLoadRow): ReactNode {
  const label = entityLabel(load.customer_name, load.customer_id, "Customer");
  if (!load.customer_id) return label;
  return (
    <EntityLink
      kind="customer"
      id={load.customer_id}
      label={label}
      onClick={(e) => e.stopPropagation()}
      className="text-slate-700 hover:underline"
      data-testid="loads-customer-link"
    />
  );
}

// Record-cell link: the Load # cell (shared column model across List/Table/Assignment views) links to
// the load's detail page. stopPropagation so it does NOT also trigger the row's onRowClick (which opens
// the load drawer) — same pattern as renderCustomerCell above.
function renderLoadNumberCell(load: DispatchLoadRow, className = "code-cell font-medium"): ReactNode {
  // Awaiting-assignment rows are keyed by a synthetic "unit:<uuid>" or "unit:inshop:<uuid>" id. A load
  // that does not exist must render "Unassigned", not "Load — not visible" — the id-present branch of
  // entityLabel would invert the contract and make every empty truck look like an unresolvable load.
  if (load.id.startsWith("unit:")) {
    return <span className={className}>Unassigned</span>;
  }
  return (
    <EntityLink
      kind="load"
      id={load.id}
      label={entityLabel(load.load_number, load.id, "Load")}
      onClick={(e) => e.stopPropagation()}
      className={className}
    />
  );
}
import {
  listUnitsWithoutLoad,
  listDispatchInShopUnits,
  isDispatchInShopUnit,
  listActiveLoadTriSignals,
  getDispatchLoadPositions,
  quickAssignDispatchLoad,
  type TriSignalRow,
  type UnitsWithoutLoad,
  type DispatchInShopUnit,
} from "../../api/dispatch";
import { getFleetLocationHos } from "../../api/reports";
import type { DispatchListProps } from "../../components/dispatch/dispatchListTypes";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  TableSelection,
  TableSelectionHeader,
  useBulkSelection,
} from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { addLoadToPreSettlement, listOpenPreSettlements, type OpenPreSettlement } from "../../api/driverFinance";
import { STATUS_LABEL, formatMoneyCents, toRouteSummary } from "../../components/dispatch/constants";
import { InlineDriverPicker } from "../../components/dispatch/InlineDriverPicker";
import { InlineUnitPicker } from "../../components/dispatch/InlineUnitPicker";
import { InlineTrailerPicker } from "../../components/dispatch/InlineTrailerPicker";
import {
  DriverStatusColumn,
  LiveEtaFreshnessColumn,
  OnTimePredictionColumn,
  SamsaraEtaColumn,
} from "../../components/dispatch/LiveEtaColumns";
import { CargoTempBadge, isReeferCommodity } from "../../components/dispatch/CargoTempBadge";
import { DriverHosClockValue } from "../../components/dispatch/hos/DriverHosClocks";
import { formatInCompanyTimeZone } from "../../lib/businessDate";
import { HOS_COLUMNS } from "../../components/dispatch/hos/hosClocks";
import { LoadLivePositionCell } from "../../components/dispatch/LoadLivePositionCell";
import { TriSignalPill } from "../../components/dispatch/TriSignalPill";
import { UnitsWithoutLoadTable } from "./components/UnitsWithoutLoadTable";
import { QuickAssignModal } from "./components/QuickAssignModal";
import { TableHeaderCell, useTablePref } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";
import { userFacingApiError } from "../../lib/api-error-message";

export type DispatchBoardProps = Omit<DispatchListProps, "showEtaColumn"> & {
  operatingCompanyId?: string;
  onBulkComplete?: () => void;
  /** DB-6-style hook so a Kanban-equivalent "Book load for this unit" action is also reachable from
      List/Table/Assignment views (Unassigned Units band) — matches DispatchKanban's onBookForUnit. */
  onBookForUnit?: (unitId: string) => void;
};

type BoardMode = "list" | "table" | "assignment";

type BoardLoadExtras = {
  customer_wo_number?: string | null;
  commodity?: string | null;
  linehaul_cents?: number | null;
  trailer_number?: string | null;
};

type BoardLoad = DispatchLoadRow & BoardLoadExtras;

type RowOverride = {
  unitId?: string | null;
  unitLabel?: string;
  driverId?: string | null;
  driverLabel?: string;
  trailerId?: string | null;
  trailerLabel?: string;
};

const LOAD_TRANSITION_OPTIONS = [
  { value: "dispatched", label: "Mark dispatched" },
  { value: "in_transit", label: "Mark in transit" },
  { value: "delivered_pending_docs", label: "Mark delivered (pending docs)" },
  { value: "completed_docs_received", label: "Mark docs received" },
  { value: "cancelled", label: "Cancel load" },
] as const;

const BOARD_MODES: Array<{ id: BoardMode; label: string; testId: string }> = [
  { id: "list", label: "List", testId: "dispatch-board-mode-list" },
  { id: "table", label: "Table", testId: "dispatch-board-mode-table" },
  { id: "assignment", label: "Assignment", testId: "dispatch-board-mode-assignment" },
];

function parseBoardMode(raw: string | null): BoardMode {
  if (raw === "table" || raw === "assignment") return raw;
  return "list";
}

function persistBoardMode(mode: BoardMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (mode === "list") url.searchParams.delete("board");
  else url.searchParams.set("board", mode);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function readBoardModeFromLocation(): BoardMode {
  if (typeof window === "undefined") return "list";
  return parseBoardMode(new URLSearchParams(window.location.search).get("board"));
}

function readBoardLoad(load: DispatchLoadRow): BoardLoad {
  return load as BoardLoad;
}

function laneSummary(load: DispatchLoadRow) {
  return toRouteSummary(load.first_pickup_city, load.first_delivery_city);
}

function formatApptDate(value?: string | null) {
  if (!value) return null;
  // Central Time (CLAUDE.md §8 "Central Time always") — a bare toLocaleDateString() on a full
  // timestamp rolls to the wrong calendar day near midnight in whatever zone the browser happens to
  // be in; force America/Chicago so the appt date always matches the company's wall-clock day.
  const formatted = formatInCompanyTimeZone(value, { month: "short", day: "numeric" });
  return formatted || null;
}

// ETA-MODEL BLOCK 1 — Delivery cell shows the destination city PLUS the effective delivery date
// (= predicted if confirmed-late, else scheduled appt). When predicted > scheduled it turns amber
// with a "late vs appt" tag; hover shows BOTH dates. The scheduled appt is never overwritten.
function renderDeliveryCell(load: DispatchLoadRow) {
  const city = load.first_delivery_city ?? "—";
  const effective = formatApptDate(load.effective_delivery_date);
  const scheduled = formatApptDate(load.scheduled_delivery_date);
  const predicted = formatApptDate(load.predicted_delivery_date);
  const late = Boolean(load.delivery_late_vs_appt);
  return (
    <div className="flex flex-col leading-tight">
      <span>{city}</span>
      {effective ? (
        <span
          className={late ? "font-medium text-slate-700" : "text-gray-500"}
          title={`Scheduled appt: ${scheduled ?? "—"}${predicted ? ` · Predicted: ${predicted}` : ""}`}
        >
          {effective}
          {late ? " · late vs appt" : ""}
        </span>
      ) : null}
    </div>
  );
}

function isUnassignedLoad(load: DispatchLoadRow) {
  return !load.assigned_unit_id;
}

function isBookedReserved(load: DispatchLoadRow) {
  if (load.assigned_unit_id || load.assigned_primary_driver_id) return false;
  // `book-load.service.ts` deliberately persists a booked load with no crew as the canonical
  // `unassigned` mdata status. Keep that status in this entry-path predicate or valid booked loads
  // disappear from the only table that exposes + Quick Assign.
  return ["draft", "booked", "planned", "unassigned"].includes(load.status);
}

function isAssignedLoad(load: DispatchLoadRow) {
  return Boolean(load.assigned_unit_id);
}

// DISPATCH-REDESIGN Part C — TRUCK-CENTRIC sections (Jorge clarification 2026-06-17):
// AWAITING ASSIGNMENT = every ACTIVE TRUCK with NO load right now (the fleet roster minus loaded
//   trucks — derived from unitsWithoutLoad, NOT loads.filter). One row per truck; Unit/Trailer/
//   Driver/HOS populated, load fields "—".
// BOOKED = loads that have a truck (one row per load).
// IN SHOP = trucks down for maintenance/repair (live fleet-table feed; distinct from the pinned
//   Fleet OOS strip = trucks fully out of service). A truck appears in exactly one place.
const SECTION_META: Array<{ key: string; title: string; placeholder?: string }> = [
  { key: "awaiting", title: "Awaiting assignment" },
  { key: "booked", title: "Booked" },
  { key: "in_shop", title: "In shop", placeholder: "No units in shop." },
];

// A truck-without-a-load rendered as a board row: Unit (+Driver/Trailer when known) populated, all
// load-specific cells fall through to "—". id is prefixed "unit:"; row-click books the unit when the
// parent passes onBookForUnit, otherwise it stays inert because there is no load drawer to open yet.
function unitToBoardRow(unit: UnitsWithoutLoad): BoardLoad {
  return {
    id: `unit:${unit.id}`,
    assigned_unit_id: unit.id,
    assigned_unit_number: unit.unit_number,
    assigned_primary_driver_id: unit.driver_id,
    assigned_primary_driver_name: unit.driver_name || null,
    trailer_number: unit.trailer_number ?? null,
    load_number: "",
    status: "unassigned",
  } as unknown as BoardLoad;
}

function inShopUnitToBoardRow(unit: DispatchInShopUnit): BoardLoad {
  return {
    id: `unit:inshop:${unit.id}`,
    assigned_unit_id: unit.id,
    assigned_unit_number: unit.unit_number,
    assigned_primary_driver_id: null,
    assigned_primary_driver_name: null,
    trailer_number: null,
    load_number: "",
    status: "unassigned",
    customer_wo_number: (unit.open_wo_count ?? 0) > 0 ? `${unit.open_wo_count} open` : null,
  } as unknown as BoardLoad;
}

function unitIdFromBoardRowId(id: string) {
  return id.startsWith("unit:") ? id.replace(/^unit:(?:inshop:)?/, "") : null;
}

function sortUnassignedFirst(loads: DispatchLoadRow[]) {
  return [...loads].sort((a, b) => {
    const aRank = isUnassignedLoad(a) ? 0 : 1;
    const bRank = isUnassignedLoad(b) ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });
}

// Columns the dispatcher can click-sort; every plain-data column is sortable — only computed/live
// widget cells (HOS clocks, cargo temp, live GPS, status signal, risk, driver status) are excluded,
// same exemption class as the GLOBAL-SORT-RULE action-column carve-out (docs/specs/GLOBAL-SORT-RULE.md).
const DISPATCH_SORTABLE_COLS = new Set([
  "load", "unit", "trailer", "driver", "customer", "commodity", "pickup", "delivery", "wo", "linehaul", "status",
]);

function compareDispatch(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function dispatchSortValue(load: BoardLoad, key: string): string | number | null {
  switch (key) {
    case "load": return load.load_number ?? null;
    case "unit": return load.assigned_unit_number ?? null;
    case "trailer": return load.trailer_number ?? null;
    case "driver": return load.assigned_primary_driver_name ?? null;
    case "customer": return load.customer_name ?? null;
    case "commodity": return load.commodity ?? null;
    case "pickup": return load.first_pickup_city ?? null;
    case "delivery": return load.first_delivery_city ?? null;
    case "wo": return load.customer_wo_number ?? null;
    case "linehaul": return load.rate_total_cents ?? null;
    case "status": return load.status ?? null;
    default: return null;
  }
}

function statusVariant(status: DispatchLoadRow["status"]) {
  if (status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "delivered") return "bg-slate-100 text-slate-700";
  if (status === "in_transit" || status === "at_pickup" || status === "at_delivery") return "bg-slate-100 text-slate-700";
  if (status === "closed" || status === "paid" || status === "invoiced") return "bg-gray-200 text-gray-700";
  return "bg-slate-100 text-slate-700";
}

function riskTierClass(load: DispatchLoadRow) {
  if (load.on_time_prediction === "green") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "amber") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "red") return "bg-red-100 text-red-800";
  if (load.progress_status === "early" || load.progress_status === "on_track") return "bg-slate-100 text-slate-700";
  if (load.progress_status === "behind") return "bg-slate-100 text-slate-700";
  if (load.progress_status === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

function riskTierLabel(load: DispatchLoadRow) {
  if (load.on_time_prediction === "green") return "On time";
  if (load.on_time_prediction === "amber") return "At risk";
  if (load.on_time_prediction === "red") return "Late";
  if (load.progress_status === "early") return "Early";
  if (load.progress_status === "on_track") return "On time";
  if (load.progress_status === "behind") return "Behind";
  if (load.progress_status === "delayed") return "Delayed";
  return "Unknown";
}

function isAtRiskOfLate(load: DispatchLoadRow) {
  return (
    load.on_time_prediction === "amber" ||
    load.on_time_prediction === "red" ||
    load.progress_status === "behind" ||
    load.progress_status === "delayed"
  );
}

function linehaulCents(load: BoardLoad) {
  if (typeof load.linehaul_cents === "number" && load.linehaul_cents > 0) return load.linehaul_cents;
  return load.rate_total_cents;
}

function DocComplianceCell({ load }: { load: DispatchLoadRow }) {
  const ready = load.geofence_ready;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ready ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-700"}`}
      title={ready ? "Pre-dispatch doc gate passed" : "Doc compliance pending"}
    >
      {ready ? "Ready" : "Pending"}
    </span>
  );
}

function RiskCell({ load }: { load: DispatchLoadRow }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskTierClass(load)}`}
        title={isAtRiskOfLate(load) ? "At risk of late delivery" : undefined}
      >
        {riskTierLabel(load)}
      </span>
    </div>
  );
}

function AssignmentBand({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="space-y-1" data-testid={`dispatch-assignment-band-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between border-b border-gray-200 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
        <span className="text-[11px] text-gray-500">{count}</span>
      </div>
      {children}
    </section>
  );
}

export function DispatchBoard({
  operatingCompanyId,
  onBulkComplete,
  loads,
  onExportCsv,
  totalCount,
  limit,
  offset,
  loading,
  listError,
  activeGeofenceBreachVehicleIds,
  onRowClick,
  onPageChange,
  onBookForUnit,
}: DispatchBoardProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [boardMode, setBoardModeState] = useState<BoardMode>(readBoardModeFromLocation);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<string>(LOAD_TRANSITION_OPTIONS[0].value);
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [quickAssignLoad, setQuickAssignLoad] = useState<BoardLoad | null>(null);
  const bulk = useEntityBulkAction();
  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });

  const pageRowIds = useMemo(() => loads.map((load) => load.id), [loads]);

  const companyId = operatingCompanyId ?? loads[0]?.operating_company_id ?? "";
  const inlineQuicksaveEnabled = true;

  const openPreSettlementsQuery = useQuery({
    queryKey: ["pre-settlements-open", companyId],
    queryFn: () => listOpenPreSettlements(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const unitsWithoutLoadQuery = useQuery({
    queryKey: ["dispatch-board", "units-without-load", companyId],
    queryFn: () => listUnitsWithoutLoad(companyId),
    // Needed in every mode now — the List/Table "Awaiting assignment" section is truck-derived
    // (active fleet roster minus loaded trucks), not loads.filter.
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });
  const unassignedUnits = unitsWithoutLoadQuery.data?.units ?? [];

  const inShopUnitsQuery = useQuery({
    queryKey: ["dispatch-board", "in-shop-units", companyId],
    queryFn: async () => {
      const payload = await listDispatchInShopUnits(companyId);
      return (payload.rows ?? []).filter(isDispatchInShopUnit);
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const inShopUnits = inShopUnitsQuery.data ?? [];
  const inShopUnitIds = useMemo(() => new Set(inShopUnits.map((unit) => unit.id)), [inShopUnits]);

  const triSignalsQuery = useQuery({
    queryKey: ["dispatch-board", "tri-signals", companyId],
    queryFn: () => listActiveLoadTriSignals(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const triSignalByLoadId = useMemo(() => {
    const map = new Map<string, TriSignalRow>();
    for (const row of triSignalsQuery.data?.signals ?? []) {
      map.set(row.load_uuid, row);
    }
    return map;
  }, [triSignalsQuery.data]);

  const openPreSettlementsMap = useMemo<Map<string, OpenPreSettlement>>(() => {
    const map = new Map<string, OpenPreSettlement>();
    for (const ps of openPreSettlementsQuery.data?.pre_settlements ?? []) {
      if (ps.driver_id) map.set(ps.driver_id, ps);
    }
    return map;
  }, [openPreSettlementsQuery.data]);

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

  const { widths: dispatchColWidths, setColumnWidth: setDispatchColWidth } = useTablePref("dispatch-board", { pageSize: 200 });
  // BANK-SORT-ROLLOUT-OPS — ?sort=/?dir= URL persistence so a dispatcher's chosen column sort
  // survives a refresh or a shared/bookmarked board link (same contract as ?board= board-mode above).
  // Uses the shared useUrlSort hook (BANK-SORT-ROLLOUT-ACCT); TableHeaderCell wants sortKey as
  // string|null (useUrlSort returns "" when unset), so coerce below.
  const { sortKey: rawDispatchSortKey, sortDirection: dispatchSortDir, toggleSort: toggleDispatchSort } = useUrlSort();
  const dispatchSortKey = rawDispatchSortKey || null;

  const sortedLoads = useMemo(() => {
    const base = sortUnassignedFirst(effectiveLoads);
    if (!dispatchSortKey) return base;
    return [...base].sort((a, b) => {
      const va = dispatchSortValue(a, dispatchSortKey);
      const vb = dispatchSortValue(b, dispatchSortKey);
      const cmp = compareDispatch(va, vb);
      return dispatchSortDir === "asc" ? cmp : -cmp;
    });
  }, [effectiveLoads, dispatchSortKey, dispatchSortDir]);

  // Live GPS — last-known position per visible load (in-app Samsara store), one batched call.
  // Replaces the hardcoded null stub so the Live GPS column shows real coordinates when present.
  const visibleLoadIds = useMemo(
    () => sortedLoads.filter((load) => load.assigned_unit_id).map((load) => load.id).sort(),
    [sortedLoads]
  );
  const loadPositionsQuery = useQuery({
    queryKey: ["dispatch-board", "load-positions", companyId, visibleLoadIds],
    queryFn: () => getDispatchLoadPositions(companyId, visibleLoadIds),
    enabled: Boolean(companyId) && visibleLoadIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const positionByLoad = loadPositionsQuery.data?.positions_by_load ?? {};

  // AUTO-04: live city/state per unit from the existing fleet-location-hos feed (reverse-geo #1233, ~3-min fresh).
  // Read-only; keyed by unit so each load row shows its assigned unit's current location.
  const fleetLocationQuery = useQuery({
    queryKey: ["dispatch-board", "fleet-location", companyId],
    queryFn: () => getFleetLocationHos(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
  });
  const locationByUnit = useMemo(() => {
    const m: Record<string, { city: string | null; state: string | null }> = {};
    for (const r of fleetLocationQuery.data?.rows ?? []) m[r.unit_id] = { city: r.city, state: r.state };
    return m;
  }, [fleetLocationQuery.data]);

  const bookedLoads = useMemo(() => sortedLoads.filter(isBookedReserved), [sortedLoads]);
  const assignedLoads = useMemo(() => sortedLoads.filter(isAssignedLoad), [sortedLoads]);

  // TRUCK-CENTRIC List/Table sections. Awaiting = roster minus loaded trucks minus in-shop units;
  // Booked = active loads (one row per load); In shop = live maintenance roster (InMaintenance or
  // open WO). Every active truck lands in exactly one place.
  const boardSections = useMemo(() => {
    const awaitingRows = unassignedUnits
      .filter((unit) => !inShopUnitIds.has(unit.id))
      .map(unitToBoardRow);
    const inShopRows = inShopUnits.map(inShopUnitToBoardRow);
    // Defensive dedupe by load id — a load must never render twice in Booked (two DISTINCT loads on
    // the same truck legitimately remain, since they have different ids).
    const seenBooked = new Set<string>();
    const bookedRows = sortedLoads.filter((load) => {
      if (seenBooked.has(load.id)) return false;
      seenBooked.add(load.id);
      return true;
    });
    return SECTION_META.map((meta) => ({
      ...meta,
      rows:
        meta.key === "awaiting"
          ? awaitingRows
          : meta.key === "booked"
            ? bookedRows
            : meta.key === "in_shop"
              ? inShopRows
              : [],
    }));
  }, [unassignedUnits, inShopUnits, inShopUnitIds, sortedLoads]);

  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, totalCount);

  // DB-4 (honest count): the List/Table renders the FULL awaiting-truck roster (un-paginated)
  // in its own section alongside the paginated loads, all inside one table (locked structure for
  // global sort). A bare "Showing X of Y" therefore read as if it described every visible row
  // (e.g. "Showing 1-5 of 5" with 44 rows on screen = 5 loads + 39 awaiting trucks). Scope the
  // pagination count to loads and surface the roster total separately so the numbers reconcile.
  const awaitingTruckCount = boardSections.find((section) => section.key === "awaiting")?.rows.length ?? 0;
  const loadCountSummary =
    `Showing ${from}-${to} of ${totalCount} ${totalCount === 1 ? "load" : "loads"}` +
    (awaitingTruckCount > 0
      ? ` · ${awaitingTruckCount} ${awaitingTruckCount === 1 ? "truck" : "trucks"} awaiting (full roster)`
      : "");
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  const setBoardMode = (mode: BoardMode) => {
    setBoardModeState(mode);
    persistBoardMode(mode);
  };

  const addLoadMutation = useMutation({
    mutationFn: ({ settlementId, loadId, ocId }: { settlementId: string; loadId: string; ocId: string }) =>
      addLoadToPreSettlement(settlementId, { operating_company_id: ocId, load_id: loadId }),
    onSuccess: () => {
      pushToast("Load linked to pre-settlement", "success");
      void openPreSettlementsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["pre-settlements-open"] });
    },
    onError: (err) => {
      pushToast(userFacingApiError(err, "Failed to link load to pre-settlement"), "error");
    },
  });

  const exportSelectedCsv = () => {
    const selected = sortedLoads.filter((load) => selection.selectedIds.has(load.id));
    const headers = ["load_number", "customer_name", "lane", "unit", "driver", "risk", "status"];
    const bodyRows = selected.map((load) =>
      [
        load.load_number,
        load.customer_name ?? "",
        laneSummary(load),
        load.assigned_unit_number ?? "",
        load.assigned_primary_driver_name ?? "",
        riskTierLabel(load),
        load.status,
      ].map((item) => `"${String(item).replace(/"/g, '""')}"`)
    );
    const csv = [headers.join(","), ...bodyRows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dispatch-loads-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runStatusBulk = async (reason?: string) => {
    if (!companyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    const ids = Array.from(selection.selectedIds);
    setStatusModalOpen(false);
    try {
      await bulk.runBulk(
        {
          domain: "dispatch",
          resource: "loads",
          ids,
          action: "set_status",
          payload: {
            transition: pendingTransition,
            ...(pendingTransition === "delivered_pending_docs" || pendingTransition === "completed_docs_received"
              ? { delivered_at: new Date().toISOString() }
              : {}),
          },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["loads"]],
        },
        () => {
          selection.clear();
          onBulkComplete?.();
        }
      );
    } catch (error) {
      pushToast(userFacingApiError(error, "Bulk load update failed"), "error");
    }
  };

  const renderUnitCell = (load: DispatchLoadRow) =>
    inlineQuicksaveEnabled && companyId ? (
      <InlineUnitPicker
        loadId={load.id}
        operatingCompanyId={companyId}
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
    ) : (
      <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.assigned_unit_number} noun="Unit" />
    );

  const renderDriverCell = (load: DispatchLoadRow) =>
    inlineQuicksaveEnabled && companyId ? (
      <InlineDriverPicker
        loadId={load.id}
        operatingCompanyId={companyId}
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
    ) : (
      <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.assigned_primary_driver_name} noun="Driver" />
    );

  const renderTrailerCell = (load: BoardLoad) =>
    inlineQuicksaveEnabled && companyId ? (
      <InlineTrailerPicker
        loadId={load.id}
        operatingCompanyId={companyId}
        trailerId={rowOverrides[load.id]?.trailerId ?? (load as { trailer_id?: string | null }).trailer_id ?? null}
        displayLabel={rowOverrides[load.id]?.trailerLabel ?? entityLabel(load.trailer_number, (load as { trailer_id?: string | null }).trailer_id, "Trailer")}
        onAssigned={({ trailerId, label }) =>
          setRowOverrides((prev) => ({
            ...prev,
            [load.id]: { ...prev[load.id], trailerId, trailerLabel: label },
          }))
        }
        onRollback={() =>
          setRowOverrides((prev) => {
            const next = { ...prev };
            delete next[load.id]?.trailerId;
            return next;
          })
        }
      />
    ) : (
      <EntityLinkOrTombstone
        kind="trailer"
        id={(load as { trailer_id?: string | null }).trailer_id ?? null}
        name={load.trailer_number}
        noun="Trailer"
      />
    );

  const renderTriSignalCell = (load: DispatchLoadRow) => (
    <TriSignalPill signal={triSignalByLoadId.get(load.id)} loading={triSignalsQuery.isLoading && Boolean(companyId)} />
  );

  const renderStatusCell = (load: DispatchLoadRow) => (
    <div className="flex items-center gap-1">
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusVariant(load.status)}`}>
        {STATUS_LABEL[load.status]}
      </span>
      {load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id) ? (
        <span className="rounded-sm bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Geofence alert</span>
      ) : null}
    </div>
  );

  const renderPreSettlementPrompt = (load: DispatchLoadRow, colSpan: number) => {
    const effectiveDriverId = rowOverrides[load.id]?.driverId ?? load.assigned_primary_driver_id;
    const openPreSettlement = effectiveDriverId ? openPreSettlementsMap.get(effectiveDriverId) : undefined;
    const showPreSettlementPrompt = Boolean(
      openPreSettlement &&
        openPreSettlement.first_load_id !== load.id &&
        !["delivered", "delivered_pending_docs", "completed_docs_received", "closed", "paid", "invoiced", "cancelled"].includes(
          load.status
        )
    );
    if (!showPreSettlementPrompt || !openPreSettlement) return null;
    return (
      <tr className="border-b border-slate-200 bg-slate-100">
        <td colSpan={colSpan} className="px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="font-semibold">Driver has open pre-settlement</span>
            {openPreSettlement.settlement_number ? (
              <span className="font-mono text-slate-700">
                <EntityLink kind="settlement" id={openPreSettlement.settlement_id} label={entityLabel(openPreSettlement.settlement_number, openPreSettlement.settlement_id, "Settlement")} />
              </span>
            ) : null}
            <span className="text-slate-700">· add this load to it?</span>
            <button
              type="button"
              className="rounded-sm bg-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
              onClick={(event) => {
                event.stopPropagation();
                addLoadMutation.mutate({
                  settlementId: openPreSettlement.settlement_id,
                  loadId: load.id,
                  ocId: load.operating_company_id,
                });
              }}
            >
              Add to it
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderLoadRows = (
    rows: DispatchLoadRow[],
    columns: Array<{ key: string; header: string; cell: (load: BoardLoad) => ReactNode }>,
    options?: { showBulk?: boolean }
  ) => {
    const showBulk = options?.showBulk ?? true;
    const colSpan = columns.length + (showBulk ? 1 : 0);

    return rows.map((load) => {
      const boardLoad = readBoardLoad(load);
      return (
        <Fragment key={load.id}>
          <tr onClick={() => onRowClick(load.id)} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50">
            {showBulk ? (
              <td className="px-2 py-1" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select load ${load.load_number}`}
                  checked={selection.selectedIds.has(load.id)}
                  onChange={() => {
                    const next = new Set(selection.selectedIds);
                    if (next.has(load.id)) next.delete(load.id);
                    else next.add(load.id);
                    selection.setSelectedIds(next);
                  }}
                />
              </td>
            ) : null}
            {columns.map((column) => (
              <td key={column.key} className="px-3 py-1 text-[11px] leading-tight">
                {column.cell(boardLoad)}
              </td>
            ))}
          </tr>
          {renderPreSettlementPrompt(load, colSpan)}
        </Fragment>
      );
    });
  };

  // DISPATCH-REDESIGN Part B — ONE shared column model so List renders the SAME grid as Table.
  // Order: Unit · Trailer · Driver · [6 Samsara HOS clocks] · Load # · Customer · Commodity · Pickup ·
  // Delivery · WO # · Cargo temp · Linehaul · Status signal · Live GPS · Risk · Status. Lane is split
  // into Pickup (City, ST) + Delivery (City, ST).
  const boardColumns: Array<{ key: string; header: string; cell: (load: BoardLoad) => ReactNode }> = [
    { key: "unit", header: "Unit", cell: (load) => renderUnitCell(load) },
    { key: "trailer", header: "Trailer", cell: (load) => renderTrailerCell(load) },
    // DB-6: Load # sits immediately after Trailer in the shared column model (app-wide list + table).
    { key: "load", header: "Load #", cell: (load) => renderLoadNumberCell(load, "code-cell font-medium text-gray-800") },
    { key: "driver", header: "Driver", cell: (load) => renderDriverCell(load) },
    // DISPATCH-UI-REFINE-2 ITEM 5 — the locked Samsara 6-clock set on the live board. The old summary
    // pair was REMOVED per Jorge (it overlapped Drive/Shift/Cycle and cluttered the grid); only these 6
    // remain. Drive/Shift/Break/Cycle = H:MM remaining; Stop By / Resume At are PROJECTED. Cells show
    // "—" until the Samsara HOS feed seeds hos.duty_status_events.
    ...HOS_COLUMNS.map((hosCol) => ({
      key: `hos_${hosCol.key}`,
      header: hosCol.label,
      cell: (load: BoardLoad) => (
        <DriverHosClockValue
          driverId={load.assigned_primary_driver_id}
          operatingCompanyId={load.operating_company_id}
          colKey={hosCol.key}
        />
      ),
    })),
    // UX-B: Location (last-known unit city) sits right after the HOS clocks (Resume At).
    // (DB-6 moved Load # up to immediately after Trailer in the shared column model.)
    {
      key: "location",
      header: "Location",
      cell: (load) => {
        const loc = load.assigned_unit_id ? locationByUnit[load.assigned_unit_id] : undefined;
        const text = loc ? [loc.city, loc.state].filter(Boolean).join(", ") : "";
        return text ? <span className="text-xs text-slate-700">{text}</span> : <span className="text-[10px] text-slate-400">—</span>;
      },
    },
    { key: "customer", header: "Customer", cell: renderCustomerCell },
    { key: "commodity", header: "Commodity", cell: (load) => load.commodity ?? "—" },
    { key: "pickup", header: "Pickup", cell: (load) => load.first_pickup_city ?? "—" },
    { key: "delivery", header: "Delivery", cell: (load) => renderDeliveryCell(load) },
    { key: "wo", header: "WO #", cell: (load) => load.customer_wo_number ?? "—" },
    {
      key: "cargo_temp",
      header: "Cargo temp",
      cell: (load) => (
        <CargoTempBadge
          loadId={load.id}
          operatingCompanyId={load.operating_company_id}
          reefer={isReeferCommodity(load.commodity)}
        />
      ),
    },
    { key: "linehaul", header: "Linehaul", cell: (load) => formatMoneyCents(linehaulCents(load), load.currency_code) },
    { key: "status_signal", header: "Status signal", cell: (load) => renderTriSignalCell(load) },
    { key: "live_gps", header: "Live GPS", cell: (load) => <LoadLivePositionCell position={positionByLoad[load.id] ?? null} loadId={load.id} /> },
    { key: "risk", header: "Risk", cell: (load) => <RiskCell load={load} /> },
    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
    { key: "driver_status", header: "Driver Status", cell: (load) => <DriverStatusColumn load={load} /> },
    { key: "samsara_eta", header: "Samsara ETA", cell: (load) => <SamsaraEtaColumn load={load} /> },
    { key: "on_time", header: "On-time", cell: (load) => <OnTimePredictionColumn load={load} /> },
    { key: "eta_freshness", header: "Freshness", cell: (load) => <LiveEtaFreshnessColumn load={load} /> },
  ];

  // List and Table share the same column model (the grid look is identical).
  const listColumns = boardColumns;
  const tableColumns = boardColumns;

  const renderListOrTable = (columns: typeof listColumns) => {
    if (listError) {
      return (
        <ListErrorState
          title="Couldn't load dispatch list"
          status={listError.status}
          message={listError.message}
          onRetry={listError.onRetry}
        />
      );
    }

    if (!loading && sortedLoads.length === 0) {
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
          <div className="text-sm text-gray-600">
            {loadCountSummary}
          </div>
          <div className="flex items-center gap-2">
            {selection.count > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={exportSelectedCsv}>
                Export Selected to CSV
              </Button>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={onExportCsv}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
          <TableSelection
            rows={sortedLoads}
            getId={(load) => load.id}
            selectedIds={selection.selectedIds}
            onSelectionChange={selection.setSelectedIds}
            pageRowIds={pageRowIds}
            onCapExceeded={(message) => pushToast(message, "error")}
          >
            {(selectCtx) => (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <TableSelectionHeader
                        selectedIds={selection.selectedIds}
                        pageRowIds={pageRowIds}
                        onSelectionChange={selection.setSelectedIds}
                        onCapExceeded={(message) => pushToast(message, "error")}
                      />
                    </th>
                    {columns.map((column) => (
                      <TableHeaderCell
                        key={column.key}
                        columnKey={column.key}
                        label={column.header}
                        sortable={DISPATCH_SORTABLE_COLS.has(column.key)}
                        sortKey={dispatchSortKey}
                        sortDir={dispatchSortDir}
                        onToggleSort={toggleDispatchSort}
                        width={dispatchColWidths[column.key]}
                        onResize={setDispatchColWidth}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="px-3 py-3 text-gray-400">
                        Loading loads...
                      </td>
                    </tr>
                  ) : (
                    // DISPATCH-REDESIGN Part C — three labeled sections inside ONE table so the
                    // shared column sort/resize stays global across all rows. No load is dropped:
                    // every row lands in exactly one section. In shop rows come from the live
                    // maintenance fleet-table feed (read-only).
                    boardSections.map((section) => {
                      const rows = section.rows;
                      return (
                        <Fragment key={section.key}>
                          <tr className="border-b border-gray-200 bg-gray-100">
                            <td colSpan={columns.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                              {section.title}
                              <span className="ml-2 rounded-full bg-white px-1.5 text-[10px] font-bold text-gray-500">{rows.length}</span>
                            </td>
                          </tr>
                          {section.key === "in_shop" && inShopUnitsQuery.isError ? (
                            <tr className="border-b border-gray-100">
                              <td colSpan={columns.length + 1} className="px-3 py-2">
                                <ListErrorState
                                  title="Couldn't load in-shop units"
                                  status={(inShopUnitsQuery.error as { status?: number } | null)?.status ?? 0}
                                  message={
                                    inShopUnitsQuery.error instanceof Error
                                      ? inShopUnitsQuery.error.message
                                      : "In-shop unit feed failed"
                                  }
                                  onRetry={() => void inShopUnitsQuery.refetch()}
                                  className="py-4"
                                />
                              </td>
                            </tr>
                          ) : null}
                          {section.placeholder && rows.length === 0 && !(section.key === "in_shop" && inShopUnitsQuery.isError) ? (
                            <tr className="border-b border-gray-100">
                              <td colSpan={columns.length + 1} className="px-3 py-2 text-[11px] italic text-gray-400">
                                {section.placeholder}
                              </td>
                            </tr>
                          ) : null}
                          {rows.map((load) => {
                            const boardLoad = readBoardLoad(load);
                            const unitId = unitIdFromBoardRowId(load.id);
                            const onUnitBook = unitId && onBookForUnit ? () => onBookForUnit(unitId) : undefined;
                            return (
                              <Fragment key={load.id}>
                                <tr
                                  onClick={() => {
                                    if (onUnitBook) onUnitBook();
                                    else if (!unitId) onRowClick(load.id);
                                  }}
                                  className={`border-b border-gray-100 hover:bg-gray-50 ${onUnitBook || !unitId ? "cursor-pointer" : ""}`}
                                >
                                  <td className="px-2 py-1" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      aria-label={`Select load ${load.load_number}`}
                                      checked={selectCtx.isSelected(load.id)}
                                      onChange={() => selectCtx.toggle(load.id)}
                                    />
                                  </td>
                                  {columns.map((column) => (
                                    <td key={column.key} className="px-3 py-1 text-[11px] leading-tight">
                                      {column.cell(boardLoad)}
                                    </td>
                                  ))}
                                </tr>
                                {renderPreSettlementPrompt(load, columns.length + 1)}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </TableSelection>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
          <Button type="button" variant="secondary" size="sm" disabled={!hasPrev} onClick={() => onPageChange(Math.max(0, offset - limit))}>
            Previous
          </Button>
          <span className="text-gray-600">
            {loadCountSummary}
          </span>
          <Button type="button" variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPageChange(offset + limit)}>
            Next
          </Button>
        </div>
      </section>
    );
  };

  const renderAssignmentView = () => {
    if (listError) {
      return (
        <ListErrorState
          title="Couldn't load assignment board"
          status={listError.status}
          message={listError.message}
          onRetry={listError.onRetry}
        />
      );
    }

    return (
      <div className="space-y-4" data-testid="dispatch-board-assignment-view">
        <AssignmentBand title="Unassigned Units" count={unassignedUnits.length}>
          <UnitsWithoutLoadTable
            rows={unassignedUnits}
            loading={unitsWithoutLoadQuery.isLoading}
            onRowClick={(unit) => onBookForUnit?.(unit.id)}
          />
        </AssignmentBand>

        <AssignmentBand title="Booked Loads" count={bookedLoads.length}>
          <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                <tr>
                  {["Load", "Customer", "Lane", "Delivery", "Doc-Compliance", "Cargo Temp", "Status", "Assign"].map((header) => (
                    <th key={header} className="px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-gray-400">
                      Loading booked loads...
                    </td>
                  </tr>
                ) : (
                  renderLoadRows(bookedLoads, [
                    {
                      key: "load",
                      header: "Load",
                      cell: (load) => renderLoadNumberCell(load),
                    },
                    { key: "customer", header: "Customer", cell: renderCustomerCell },
                    { key: "lane", header: "Lane", cell: (load) => laneSummary(load) },
                    { key: "delivery", header: "Delivery", cell: (load) => load.first_delivery_city ?? "—" },
                    { key: "doc", header: "Doc-Compliance", cell: (load) => <DocComplianceCell load={load} /> },
                    {
                      key: "cargo_temp",
                      header: "Cargo Temp",
                      cell: (load) => (
                        <CargoTempBadge
                          loadId={load.id}
                          operatingCompanyId={load.operating_company_id}
                          reefer={isReeferCommodity(load.commodity)}
                        />
                      ),
                    },
                    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
                    {
                      key: "assign",
                      header: "Assign",
                      cell: (load) => (
                        <button
                          type="button"
                          className="rounded-sm border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickAssignLoad(load);
                          }}
                        >
                          + Quick Assign
                        </button>
                      ),
                    },
                  ], { showBulk: false })
                )}
                {!loading && bookedLoads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-center text-gray-500">
                      No reserved loads waiting for assignment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AssignmentBand>

        <AssignmentBand title="Assigned Units" count={assignedLoads.length}>
          <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                <tr>
                  {["Unit", "Trailer", "Cargo Temp", "Load", "Customer", "Driver", "Lane", "Delivery", "Status"].map((header) => (
                    <th key={header} className="px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-gray-400">
                      Loading assigned units...
                    </td>
                  </tr>
                ) : (
                  renderLoadRows(assignedLoads, [
                    { key: "unit", header: "Unit", cell: (load) => renderUnitCell(load) },
                    { key: "trailer", header: "Trailer", cell: (load) => renderTrailerCell(load) },
                    {
                      key: "cargo_temp",
                      header: "Cargo Temp",
                      cell: (load) => (
                        <CargoTempBadge
                          loadId={load.id}
                          operatingCompanyId={load.operating_company_id}
                          reefer={isReeferCommodity(load.commodity)}
                        />
                      ),
                    },
                    {
                      key: "load",
                      header: "Load",
                      cell: (load) => renderLoadNumberCell(load),
                    },
                    { key: "customer", header: "Customer", cell: renderCustomerCell },
                    { key: "driver", header: "Driver", cell: (load) => renderDriverCell(load) },
                    { key: "lane", header: "Lane", cell: (load) => laneSummary(load) },
                    { key: "delivery", header: "Delivery", cell: (load) => load.first_delivery_city ?? "—" },
                    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
                  ], { showBulk: false })
                )}
                {!loading && assignedLoads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-center text-gray-500">
                      No assigned units on current page.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AssignmentBand>
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="dispatch-board">
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white p-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Board view</span>
        {BOARD_MODES.map((mode) => (
          <Button
            key={mode.id}
            type="button"
            size="sm"
            variant={boardMode === mode.id ? "primary" : "secondary"}
            data-testid={mode.testId}
            onClick={() => setBoardMode(mode.id)}
          >
            {mode.label}
          </Button>
        ))}
      </div>

      <BulkActionBar
        selectedCount={selection.count}
        actions={[
          {
            id: "set-status",
            label: "Set status",
            onClick: () => setStatusModalOpen(true),
          },
        ]}
        onClear={selection.clear}
      />

      {boardMode === "assignment"
        ? renderAssignmentView()
        : boardMode === "table"
          ? renderListOrTable(tableColumns)
          : renderListOrTable(listColumns)}

      <BulkActionModal
        open={statusModalOpen}
        actionLabel="Set load status"
        affectedCount={selection.count}
        requiresReason
        description="Apply a dispatch status transition to selected loads. Invalid transitions are reported per row."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Transition
            <select
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={pendingTransition}
              onChange={(event) => setPendingTransition(event.target.value)}
            >
              {LOAD_TRANSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
        onCancel={() => setStatusModalOpen(false)}
        onConfirm={({ reason }) => void runStatusBulk(reason)}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/dispatch/loads/${encodeURIComponent(id)}`}
      />

      {quickAssignLoad ? (
        <QuickAssignModal
          open={Boolean(quickAssignLoad)}
          operatingCompanyId={quickAssignLoad.operating_company_id}
          loadId={quickAssignLoad.id}
          loadNumber={quickAssignLoad.load_number}
          hardWarnings={[]}
          onClose={() => setQuickAssignLoad(null)}
          onSubmit={async (payload) => {
            try {
              await quickAssignDispatchLoad(quickAssignLoad.id, {
                operating_company_id: quickAssignLoad.operating_company_id,
                ...payload,
              });
              pushToast("Load quick-assigned", "success");
              await queryClient.invalidateQueries({ queryKey: ["dispatch", "loads"] });
              onBulkComplete?.();
            } catch (error) {
              // CU-09 / FAIL-U1: prefer message/blocker; never toast a bare E_* machine code.
              pushToast(userFacingApiError(error, "Quick assign failed"), "error");
            }
          }}
        />
      ) : null}
    </div>
  );
}
