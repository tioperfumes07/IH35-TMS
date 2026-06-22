import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { DispatchLoadRow, LoadStatus } from "../../api/loads";
import type { UnitsWithoutLoad } from "../../api/dispatch";
import type { DataTableErrorState } from "../../lib/tableError";
import { classifyProfit, formatProfitCents, getLoadProfitability, profitBadgeClassName } from "../../lib/loadProfit";
import { ListErrorState } from "../ListErrorState";
import { useToast } from "../Toast";
import { canDragLoad, FLAG_EMOJI_BY_CODE, toRouteSummary } from "./constants";

type Props = {
  loads: DispatchLoadRow[];
  // TRUCK-CENTRIC lane 1 — the active fleet roster minus loaded trucks. Lane "Awaiting assignment"
  // renders one card per truck (not status-derived loads). Loads with no truck go to "Booked
  // unassigned".
  awaitingTrucks?: UnitsWithoutLoad[];
  activeGeofenceBreachVehicleIds?: Set<string>;
  loading: boolean;
  onLoadClick: (loadId: string) => void;
  onStatusDrop: (loadId: string, nextStatus: LoadStatus) => Promise<void>;
  listError?: DataTableErrorState;
};

// A truck-without-a-load as a synthetic kanban card (Unit + Driver; no load). id prefixed "unit:"
// so it is inert to drag/status-drop (handleDragEnd can't find it among loads → no-op).
function truckToKanbanLoad(unit: UnitsWithoutLoad): DispatchLoadRow {
  return {
    id: `unit:${unit.id}`,
    load_number: unit.unit_number,
    status: "unassigned",
    assigned_unit_id: unit.id,
    assigned_unit_number: unit.unit_number,
    assigned_primary_driver_name: unit.driver_name || null,
  } as unknown as DispatchLoadRow;
}

type KanbanLoadExtras = {
  commodity?: string | null;
  weight_lbs?: number | null;
  trailer_type?: string | null;
  load_type?: string | null;
  geofence_state?: string | null;
  pickup_geofence_state?: string | null;
  delivery_geofence_state?: string | null;
  pickup_dwell_minutes?: number | null;
  delivery_dwell_minutes?: number | null;
  pickup_free_time_minutes?: number | null;
  delivery_free_time_minutes?: number | null;
  pickup_detention_minutes?: number | null;
  delivery_detention_minutes?: number | null;
  factoring_status?: string | null;
  net_profit_cents?: number | null;
  margin_pct?: number | null;
};

type KanbanLoad = DispatchLoadRow & KanbanLoadExtras;

// DISPATCH-UI-REFINE-2 ITEM 1 — three densities (additive). Standard is the default.
type KanbanDensity = "compact" | "standard" | "detailed";
const KANBAN_DENSITIES: readonly KanbanDensity[] = ["compact", "standard", "detailed"] as const;
const KANBAN_DEFAULT_DENSITY: KanbanDensity = "standard";

type KanbanColumnDef = {
  key: string;
  title: string;
  collapsedByDefault?: boolean;
  statuses: string[];
  dropStatus: LoadStatus;
  showDwell?: boolean;
};

// DISPATCH-REDESIGN Part D — Jorge's 10 lanes, exact order. "Cancelled" is KEPT as a
// collapsed 11th lane (additive-only: never delete a lane). Two splits — Awaiting vs Booked
// unassigned, and Loaded vs In transit — depend on the same Samsara geofence/late-detection
// feed that HOS/OOS/cash-ETA are gated on; until that feed is confirmed they separate
// best-effort by status (Loaded stays empty unless a "departed pickup" signal arrives).
const KANBAN_STATUS_GROUPS: KanbanColumnDef[] = [
  // Awaiting assignment is TRUCK-derived (cards injected from awaitingTrucks), so it matches no
  // load status. Loads with no truck (draft/planned/unassigned/booked) fall into Booked unassigned.
  { key: "awaiting_assignment", title: "Awaiting assignment", statuses: [], dropStatus: "planned" },
  { key: "booked_unassigned", title: "Booked unassigned", statuses: ["draft", "planned", "unassigned", "booked"], dropStatus: "booked" },
  { key: "assigned", title: "Assigned", statuses: ["assigned", "assigned_not_dispatched"], dropStatus: "assigned" },
  { key: "dispatched", title: "Dispatched", statuses: ["dispatched"], dropStatus: "dispatched" },
  { key: "at_pickup", title: "At pickup", statuses: ["at_pickup"], dropStatus: "at_pickup", showDwell: true },
  { key: "loaded", title: "Loaded", statuses: [], dropStatus: "in_transit" },
  { key: "in_transit", title: "In transit", statuses: ["in_transit"], dropStatus: "in_transit" },
  { key: "at_delivery", title: "At delivery", statuses: ["at_delivery"], dropStatus: "at_delivery", showDwell: true },
  { key: "delivered", title: "Delivered", statuses: ["delivered", "delivered_pending_docs"], dropStatus: "delivered" },
  { key: "completed", title: "Completed", statuses: ["invoiced", "paid", "closed", "completed_docs_received"], dropStatus: "closed" },
  {
    key: "cancelled",
    title: "Cancelled",
    statuses: ["cancelled", "abandoned", "driver_walkoff", "driver_no_show"],
    dropStatus: "cancelled",
    collapsedByDefault: true,
  },
];

function readExtras(load: DispatchLoadRow): KanbanLoad {
  return load as KanbanLoad;
}

function resolveKanbanColumnKey(load: DispatchLoadRow): string {
  const extras = readExtras(load);
  const status = String(load.status);
  const pickupGeo = extras.pickup_geofence_state ?? null;
  const deliveryGeo = extras.delivery_geofence_state ?? null;
  const geofence = extras.geofence_state ?? null;
  const hasAssignment = Boolean(load.assigned_unit_id || load.assigned_primary_driver_id);

  // Pre-dispatch: an assigned-but-not-yet-dispatched load belongs in "Assigned", even if its
  // status is still draft/booked/planned (status lags the assignment action).
  if (["draft", "planned", "unassigned", "booked"].includes(status) && hasAssignment) {
    return "assigned";
  }

  // Geofence overrides (held feed — only fire when the feed actually populates these states).
  if (status === "dispatched" && (pickupGeo === "at" || pickupGeo === "dwelling" || geofence === "at" || geofence === "dwelling")) {
    return "at_pickup";
  }
  if (status === "in_transit" && (deliveryGeo === "at" || deliveryGeo === "dwelling")) {
    return "at_delivery";
  }
  // "Loaded" = departed pickup but not yet rolling toward delivery. Needs the geofence
  // "departed" signal to separate from "In transit"; until then in_transit → In transit lane.
  if (status === "in_transit" && (pickupGeo === "departed" || geofence === "departed")) {
    return "loaded";
  }

  const group = KANBAN_STATUS_GROUPS.find((entry) => entry.statuses.includes(status));
  // Fallback is Booked unassigned (a load needing a truck) — never the truck-only Awaiting lane.
  return group?.key ?? "booked_unassigned";
}

function groupLoadsByColumn(loads: DispatchLoadRow[]) {
  const grouped = new Map<string, DispatchLoadRow[]>();
  for (const group of KANBAN_STATUS_GROUPS) grouped.set(group.key, []);
  for (const load of loads) {
    const key = resolveKanbanColumnKey(load);
    grouped.set(key, [...(grouped.get(key) ?? []), load]);
  }
  return grouped;
}

function loadModeLabel(load: KanbanLoad): string {
  const trailer = String(load.trailer_type ?? "").toLowerCase();
  if (trailer.includes("reefer")) return "Reefer";
  const loadType = String(load.load_type ?? "").toLowerCase();
  if (loadType.includes("ltl")) return "LTL";
  return "FTL";
}

function formatWeight(weightLbs?: number | null): string {
  if (weightLbs == null || weightLbs <= 0) return "—";
  return `${weightLbs.toLocaleString("en-US")} lbs`;
}

function driverUnitLabel(load: DispatchLoadRow): string {
  const driver = load.assigned_primary_driver_name;
  const unit = load.assigned_unit_number;
  if (!driver && !unit) return "Unassigned";
  if (driver && unit) return `${driver} · ${unit}`;
  return driver ?? unit ?? "Unassigned";
}

// DISPATCH-UI-REFINE-2 ITEM 2 — UNIT-FIRST cards. Any load that has a unit shows the UNIT NUMBER as
// the primary (bold) line; the LOAD # drops to a muted secondary line. Loads with no unit (e.g. Booked
// unassigned) keep the load # primary. Awaiting-assignment cards are already unit-first (synthetic).
function cardPrimaryLabel(load: DispatchLoadRow): string {
  return load.assigned_unit_number || load.load_number;
}
function cardSecondaryLoadNumber(load: DispatchLoadRow): string | null {
  // Only surface the load # as a secondary line when the unit already occupies the primary line.
  return load.assigned_unit_number ? load.load_number : null;
}
function driverNameLabel(load: DispatchLoadRow): string {
  return load.assigned_primary_driver_name || "Unassigned";
}

function onTimeChipClass(load: DispatchLoadRow): string {
  if (load.on_time_prediction === "green") return "bg-emerald-100 text-emerald-800";
  if (load.on_time_prediction === "amber") return "bg-amber-100 text-amber-800";
  if (load.on_time_prediction === "red") return "bg-red-100 text-red-800";
  if (load.progress_status === "early" || load.progress_status === "on_track") return "bg-emerald-100 text-emerald-800";
  if (load.progress_status === "behind") return "bg-amber-100 text-amber-800";
  if (load.progress_status === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

function onTimeChipLabel(load: DispatchLoadRow): string {
  if (load.on_time_prediction === "green") return "On time";
  if (load.on_time_prediction === "amber") return "At risk";
  if (load.on_time_prediction === "red") return "Late";
  if (load.progress_status === "early") return "Early";
  if (load.progress_status === "on_track") return "On time";
  if (load.progress_status === "behind") return "Behind";
  if (load.progress_status === "delayed") return "Delayed";
  return "Unknown";
}

function isBreakdown(load: DispatchLoadRow): boolean {
  return load.driver_lifecycle_stage === "breakdown";
}

function isEtaHeld(load: DispatchLoadRow): boolean {
  return isBreakdown(load) && !load.samsara_eta_at;
}

function dwellMetrics(load: KanbanLoad, columnKey: string) {
  if (columnKey === "at_pickup") {
    return {
      dwell: load.pickup_dwell_minutes ?? null,
      free: load.pickup_free_time_minutes ?? null,
      det: load.pickup_detention_minutes ?? null,
    };
  }
  if (columnKey === "at_delivery") {
    return {
      dwell: load.delivery_dwell_minutes ?? null,
      free: load.delivery_free_time_minutes ?? null,
      det: load.delivery_detention_minutes ?? null,
    };
  }
  return null;
}

function formatMinutes(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function factoringStatusLabel(status: string | null | undefined): string | null {
  if (!status || status === "not_factored") return null;
  return status.replaceAll("_", " ");
}

function DeliveredProfitBadge({ load }: { load: KanbanLoad }) {
  const inlineCents = load.net_profit_cents;
  const inlineMargin = load.margin_pct;

  const profitabilityQuery = useQuery({
    queryKey: ["kanban", "load-profit", load.id, load.operating_company_id],
    queryFn: () => getLoadProfitability(load.id, load.operating_company_id),
    enabled: inlineCents == null && ["delivered", "delivered_pending_docs"].includes(String(load.status)),
    staleTime: 60_000,
  });

  const netCents = inlineCents ?? profitabilityQuery.data?.net_profit_cents;
  const marginPct = inlineMargin ?? profitabilityQuery.data?.margin_pct;

  if (netCents == null) {
    if (profitabilityQuery.isLoading) {
      return (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${profitBadgeClassName("loading")}`}>Profit…</span>
      );
    }
    return null;
  }

  const variant = classifyProfit(netCents, marginPct ?? 0);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${profitBadgeClassName(variant)}`} title={`Net profit (${marginPct ?? 0}% margin)`}>
      {formatProfitCents(netCents)}
    </span>
  );
}

function KanbanDispatchCard({
  load,
  columnKey,
  hasActiveGeofenceBreach,
  onClick,
}: {
  load: KanbanLoad;
  columnKey: string;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
}) {
  const draggableEnabled = canDragLoad(load.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);
  const commodity = load.commodity?.trim() || "—";
  const weight = formatWeight(load.weight_lbs);
  const mode = loadModeLabel(load);
  const dwell = dwellMetrics(load, columnKey);
  const factoring = factoringStatusLabel(load.factoring_status);
  const isDeliveredColumn = columnKey === "delivered";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(load.id)}
      className={`relative cursor-pointer rounded border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
      data-testid={`kanban-card-${load.load_number}`}
    >
      <div className="absolute inset-y-0 right-0 w-1 rounded-r bg-gray-400" />
      {/* DISPATCH-UI-REFINE-2 ITEM 2 — unit primary, load # secondary (when a unit is assigned). */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-gray-900" data-kanban-card-primary="unit">{cardPrimaryLabel(load)}</div>
        <div className="text-sm">{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</div>
      </div>
      {cardSecondaryLoadNumber(load) ? (
        <div className="font-mono text-[11px] text-gray-500" data-kanban-card-secondary="load-number">
          {cardSecondaryLoadNumber(load)}
        </div>
      ) : null}

      <div className="mt-1 text-xs text-gray-600">{lane}</div>
      <div className="mt-1 text-xs font-medium text-gray-800">{driverNameLabel(load)}</div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-600">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{mode}</span>
        <span>{weight}</span>
        <span className="truncate" title={commodity}>
          {commodity}
        </span>
      </div>

      {dwell ? (
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">Dwell {formatMinutes(dwell.dwell)}</span>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">Free {formatMinutes(dwell.free)}</span>
          <span className={`rounded px-1.5 py-0.5 ${dwell.det != null && dwell.det > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>
            Det {formatMinutes(dwell.det)}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${onTimeChipClass(load)}`}>{onTimeChipLabel(load)}</span>
        {isBreakdown(load) ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">Breakdown</span>
        ) : null}
        {isEtaHeld(load) ? (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">ETA held</span>
        ) : null}
        {hasActiveGeofenceBreach ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Geofence</span>
        ) : null}
      </div>

      {isDeliveredColumn ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {factoring ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">{factoring}</span>
          ) : null}
          <DeliveredProfitBadge load={load} />
        </div>
      ) : null}
    </div>
  );
}

// DISPATCH-REDESIGN Part D — ~40px compact card so all 32 trucks fit on one screen.
// Single dense row: status dot · Unit/Driver · Load # · lane · on-time dot. Still draggable.
// The detailed card is preserved (density toggle) — additive, nothing removed.
function KanbanCompactCard({
  load,
  hasActiveGeofenceBreach,
  onClick,
}: {
  load: KanbanLoad;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
}) {
  const draggableEnabled = canDragLoad(load.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(load.id)}
      title={`${load.load_number} · ${driverUnitLabel(load)} · ${lane}`}
      className={`flex h-10 items-center gap-2 rounded border border-gray-200 bg-white px-2 text-[11px] shadow-sm transition hover:bg-gray-50 ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      data-testid={`kanban-compact-card-${load.load_number}`}
      data-kanban-card-compact="true"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${onTimeChipClass(load).split(" ")[0]}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{driverUnitLabel(load)}</span>
      <span className="shrink-0 font-mono text-[10px] text-gray-500">{load.load_number}</span>
      <span className="hidden min-w-0 max-w-[120px] shrink truncate text-gray-500 sm:inline">{lane}</span>
      {hasActiveGeofenceBreach ? <span className="shrink-0 text-red-600" title="Geofence breach">◆</span> : null}
      {isBreakdown(load) ? <span className="shrink-0 text-red-600" title="Breakdown">▲</span> : null}
    </div>
  );
}

// DISPATCH-UI-REFINE-2 ITEM 1 — STANDARD density (the default): exactly 2 lines. Line 1 = primary
// (unit-first, on-time dot, flag); line 2 = secondary (load # · driver · lane). No origin→dest sentence,
// no "FTL — —" filler row, no "Unknown" badge row. Sits between Compact (1 line) and Detailed (~5 lines).
function KanbanStandardCard({
  load,
  hasActiveGeofenceBreach,
  onClick,
}: {
  load: KanbanLoad;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
}) {
  const draggableEnabled = canDragLoad(load.status);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);
  const secondaryLoad = cardSecondaryLoadNumber(load);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(load.id)}
      title={`${cardPrimaryLabel(load)} · ${load.load_number} · ${lane}`}
      className={`flex flex-col gap-0.5 rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] shadow-sm transition hover:bg-gray-50 ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      data-testid={`kanban-standard-card-${load.load_number}`}
      data-kanban-card-standard="true"
    >
      {/* line 1 — primary: unit-first */}
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${onTimeChipClass(load).split(" ")[0]}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-semibold text-gray-900" data-kanban-card-primary="unit">
          {cardPrimaryLabel(load)}
        </span>
        {hasActiveGeofenceBreach ? <span className="shrink-0 text-red-600" title="Geofence breach">◆</span> : null}
        {isBreakdown(load) ? <span className="shrink-0 text-red-600" title="Breakdown">▲</span> : null}
        <span className="shrink-0 text-sm">{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</span>
      </div>
      {/* line 2 — secondary: load # · driver · lane */}
      <div className="flex items-center gap-1.5 truncate text-[10px] text-gray-500">
        {secondaryLoad ? (
          <span className="shrink-0 font-mono" data-kanban-card-secondary="load-number">
            {secondaryLoad}
          </span>
        ) : null}
        <span className="min-w-0 max-w-[110px] shrink truncate">{driverNameLabel(load)}</span>
        <span className="min-w-0 shrink truncate">· {lane}</span>
      </div>
    </div>
  );
}

function KanbanDispatchColumn({
  column,
  loads,
  density,
  activeGeofenceBreachVehicleIds,
  onLoadClick,
}: {
  column: KanbanColumnDef;
  loads: DispatchLoadRow[];
  density: KanbanDensity;
  activeGeofenceBreachVehicleIds?: Set<string>;
  onLoadClick: (loadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.key}` });

  if (column.collapsedByDefault) {
    return (
      <section className="min-w-[270px] rounded border border-gray-200 bg-white p-2" data-testid={`kanban-column-${column.key}`}>
        <header className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
        </header>
      </section>
    );
  }

  const detailed = density === "detailed";
  const minWidth = density === "compact" ? "min-w-[200px]" : density === "standard" ? "min-w-[230px]" : "min-w-[290px]";
  return (
    <section
      className={`${minWidth} flex-1 rounded border border-gray-200 bg-white p-2`}
      data-testid={`kanban-column-${column.key}`}
    >
      <header className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
      </header>
      <div ref={setNodeRef} className={`max-h-[68vh] ${detailed ? "space-y-2" : "space-y-1"} overflow-y-auto rounded p-1 ${isOver ? "bg-slate-100" : "bg-transparent"}`}>
        {loads.length === 0 ? <div className="rounded border border-dashed border-gray-300 p-3 text-xs text-gray-500">(empty)</div> : null}
        {loads.map((load) => {
          const breach = Boolean(load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id));
          if (density === "compact") {
            return <KanbanCompactCard key={load.id} load={readExtras(load)} hasActiveGeofenceBreach={breach} onClick={onLoadClick} />;
          }
          if (density === "standard") {
            return <KanbanStandardCard key={load.id} load={readExtras(load)} hasActiveGeofenceBreach={breach} onClick={onLoadClick} />;
          }
          return (
            <KanbanDispatchCard
              key={load.id}
              load={readExtras(load)}
              columnKey={column.key}
              hasActiveGeofenceBreach={breach}
              onClick={onLoadClick}
            />
          );
        })}
      </div>
    </section>
  );
}

export function DispatchKanban({ loads, awaitingTrucks = [], activeGeofenceBreachVehicleIds, loading, onLoadClick, onStatusDrop, listError }: Props) {
  const [optimisticLoads, setOptimisticLoads] = useState<DispatchLoadRow[]>(loads);
  // DISPATCH-UI-REFINE-2 ITEM 1 — default to STANDARD (2-line) density. Compact (1-line) + Detailed
  // (~5-line) remain available via the toggle (additive). Standard balances fleet density vs readability.
  const [density, setDensity] = useState<KanbanDensity>(KANBAN_DEFAULT_DENSITY);
  const { pushToast } = useToast();

  useEffect(() => {
    setOptimisticLoads(loads);
  }, [loads]);

  const grouped = useMemo(() => groupLoadsByColumn(optimisticLoads), [optimisticLoads]);
  // Lane 1 cards = trucks-without-a-load (roster minus loaded), one compact card per truck.
  const awaitingTruckCards = useMemo(() => awaitingTrucks.map(truckToKanbanLoad), [awaitingTrucks]);
  // Fleet out-of-service strip (Part D). No fleet-OOS feed reaches this board yet, so we
  // surface breakdown loads best-effort and flag that the full OOS feed is held — same gate
  // as HOS/geofence. Once Jorge wires the OOS source this strip lists every down unit.
  const outOfServiceLoads = useMemo(() => optimisticLoads.filter(isBreakdown), [optimisticLoads]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeId = event.active.id;
    const overId = event.over?.id;
    if (!activeId || !overId) return;
    const loadId = String(activeId);
    const targetColumnKey = String(overId).replace("column:", "");
    const targetGroup = KANBAN_STATUS_GROUPS.find((group) => group.key === targetColumnKey);
    const load = optimisticLoads.find((item) => item.id === loadId);
    if (!targetGroup || !load) return;
    if (resolveKanbanColumnKey(load) === targetColumnKey) return;

    const nextStatus = targetGroup.dropStatus;
    const previousLoads = optimisticLoads;
    setOptimisticLoads((current) =>
      current.map((item) => (item.id === loadId ? { ...item, status: nextStatus, flag_code: nextStatus === "cancelled" ? "RED" : item.flag_code } : item))
    );
    try {
      await onStatusDrop(loadId, nextStatus);
      pushToast(`Load ${load.load_number} moved to ${targetGroup.title}`, "success");
    } catch {
      setOptimisticLoads(previousLoads);
      pushToast("Status change rejected by server. Reverted.", "error");
    }
  };

  if (listError) {
    return (
      <ListErrorState
        title="Couldn't load dispatch board"
        status={listError.status}
        message={listError.message}
        onRetry={listError.onRetry}
      />
    );
  }

  if (loading) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading dispatch board...</div>;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="relative" data-testid="dispatch-kanban-board">
        <div className="mb-2 flex items-center justify-end gap-1 text-[11px]">
          <span className="text-gray-500">Density</span>
          {KANBAN_DENSITIES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDensity(mode)}
              className={`rounded border px-2 py-0.5 font-semibold capitalize ${
                density === mode ? "border-slate-300 bg-[#1F2A44] text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
              data-testid={`kanban-density-${mode}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_STATUS_GROUPS.map((group) => (
            <KanbanDispatchColumn
              key={group.key}
              column={group}
              loads={group.key === "awaiting_assignment" ? awaitingTruckCards : grouped.get(group.key) ?? []}
              density={density}
              activeGeofenceBreachVehicleIds={activeGeofenceBreachVehicleIds}
              onLoadClick={onLoadClick}
            />
          ))}
        </div>

        {/* Part D — Fleet out-of-service strip, pinned at the bottom of the board. */}
        <section
          className="sticky bottom-0 mt-2 rounded border border-amber-200 bg-amber-50 p-2"
          data-testid="dispatch-kanban-oos-strip"
        >
          <header className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">Fleet out of service</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700">{outOfServiceLoads.length}</span>
          </header>
          {outOfServiceLoads.length === 0 ? (
            <p className="mt-1 text-[11px] italic text-amber-700">
              Full fleet out-of-service feed pending — no units flagged.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {outOfServiceLoads.map((load) => (
                <button
                  key={load.id}
                  type="button"
                  onClick={() => onLoadClick(load.id)}
                  className="flex items-center gap-2 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] hover:bg-amber-100"
                >
                  <span className="text-red-600" aria-hidden>▲</span>
                  <span className="font-semibold text-gray-900">{driverUnitLabel(load)}</span>
                  <span className="font-mono text-[10px] text-gray-500">{load.load_number}</span>
                  <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-800">Breakdown</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </DndContext>
  );
}
