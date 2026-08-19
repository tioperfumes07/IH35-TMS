import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { DispatchLoadRow, LoadStatus } from "../../api/loads";
import type { UnitsWithoutLoad } from "../../api/dispatch";
import type { DataTableErrorState } from "../../lib/tableError";
import { classifyProfit, formatProfitCents, getLoadProfitability, profitBadgeClassName } from "../../lib/loadProfit";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import { useToast } from "../Toast";
import { canDragLoad, flagDotColor, flagDotLabel, flagDotTag, hasVisibleFlag, toRouteSummary } from "./constants";

type Props = {
  loads: DispatchLoadRow[];
  // TRUCK-CENTRIC lane 1 — the active fleet roster minus loaded trucks. Lane "Awaiting assignment"
  // renders one card per truck (not status-derived loads). Loads with no truck go to "Booked
  // unassigned".
  awaitingTrucks?: UnitsWithoutLoad[];
  activeGeofenceBreachVehicleIds?: Set<string>;
  loading: boolean;
  onLoadClick: (loadId: string) => void;
  // Awaiting-assignment cards are synthetic trucks (no load) — clicking one books a load FOR that truck
  // rather than opening a (non-existent) load drawer. Receives the bare unit id.
  onBookForUnit?: (unitId: string) => void;
  /** May resolve with `{ driver_bill_mint }` from PATCH …/transition (MILES-ON-BOOK). */
  onStatusDrop: (loadId: string, nextStatus: LoadStatus) => Promise<unknown>;
  // DB-2: clicking a lane header navigates to the List view pre-filtered to that lane's statuses
  // (reuses the existing `statuses` + `view` URL params; additive — header becomes a button).
  onColumnHeaderClick?: (statuses: string[]) => void;
  listError?: DataTableErrorState;
};

/**
 * A synthetic kanban card is a truck-without-a-load, id-prefixed "unit:". It is NOT a load, so it can never
 * be status-dropped: handleDragEnd looks the id up in `loads` and finds nothing.
 *
 * LV-KANBAN-SYNTHETIC-CARD-INERT-DRAG: that inertness used to be invisible. These cards carry
 * `status: "unassigned"`, and `canDragLoad("unassigned")` is true, so they rendered with drag listeners and a
 * `cursor-grab` affordance — the dispatcher could pick one up, drag it across the board, drop it into a lane,
 * and NOTHING happened, with no toast and no explanation. A control that looks live and always does nothing
 * is worse than one that is visibly disabled. The affordance now matches the behaviour.
 */
export function isSyntheticKanbanCardId(id: string): boolean {
  return id.startsWith("unit:");
}
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
  /**
   * FAIL-K1 — the lane is DERIVED from telematics, not from a raw load status, so a drop cannot express it.
   * "Loaded" is reached only when a load is `in_transit` AND the pickup geofence reports `departed`
   * (see resolveKanbanColumnKey). It is NOT a fake column — it populates the moment that signal exists —
   * but its dropStatus was `in_transit`, so dragging a card onto it wrote in_transit and the card
   * reappeared in "In transit". To the dispatcher that reads as "the drop did nothing".
   */
  derivedOnly?: boolean;
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
  { key: "loaded", title: "Loaded", statuses: [], dropStatus: "in_transit", derivedOnly: true },
  { key: "in_transit", title: "In transit", statuses: ["in_transit"], dropStatus: "in_transit" },
  { key: "at_delivery", title: "At delivery", statuses: ["at_delivery"], dropStatus: "at_delivery", showDwell: true },
  // WIRE-07: drop must use delivered_pending_docs so mdata status stamps actual_departure_at.
  // Bare "delivered" skips loadStatusRequiresDeliveryDepartureStamp (backend stamp helper).
  { key: "delivered", title: "Delivered", statuses: ["delivered", "delivered_pending_docs"], dropStatus: "delivered_pending_docs" },
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

// DISPATCH-UI-REFINE-2 ITEM 2 — UNIT-FIRST cards. Any load that has a unit shows the UNIT NUMBER as
// the primary (bold) line; the LOAD # drops to a muted secondary line. Loads with no unit (e.g. Booked
// unassigned) keep the load # primary. Awaiting-assignment cards are already unit-first (synthetic).
function cardPrimaryLabel(load: DispatchLoadRow): string {
  if (load.assigned_unit_number) {
    return entityLabel(load.assigned_unit_number, load.assigned_unit_id, "Unit");
  }
  return entityLabel(load.load_number, load.id, "Load");
}
function cardSecondaryLoadNumber(load: DispatchLoadRow): string | null {
  // The FK decides whether the unit occupies the primary line. A historical/missing unit label still
  // renders an honest unit tombstone, so the load drill must remain available as the secondary line.
  return load.assigned_unit_id ? entityLabel(load.load_number, load.id, "Load") : null;
}
function driverNameLabel(load: DispatchLoadRow): string {
  if (!load.assigned_primary_driver_name && !load.assigned_primary_driver_id) return "Unassigned";
  return entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver");
}

function onTimeChipClass(load: DispatchLoadRow): string {
  if (load.on_time_prediction === "green") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "amber") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "red") return "bg-red-100 text-red-800";
  if (load.progress_status === "early" || load.progress_status === "on_track") return "bg-slate-100 text-slate-700";
  if (load.progress_status === "behind") return "bg-slate-100 text-slate-700";
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
  const draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);
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
      className={`relative cursor-pointer rounded border border-gray-200 bg-white p-3 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
      data-testid={`kanban-card-${load.load_number}`}
    >
      <div className="absolute inset-y-0 right-0 w-1 rounded-r bg-gray-400" />
      {/* DISPATCH-UI-REFINE-2 ITEM 2 — unit primary, load # secondary (when a unit is assigned). */}
      <div className="flex items-center justify-between gap-2">
        {load.assigned_unit_id ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={load.assigned_unit_id}
            name={load.assigned_unit_number}
            noun="Unit"
            className="font-semibold text-gray-900"
            data-testid="kanban-card-primary-entity-link"
            data-kanban-card-primary="unit"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <EntityLink kind="load" id={load.id} label={cardPrimaryLabel(load)} className="font-semibold text-gray-900" data-testid="kanban-card-primary-entity-link" onClick={(event) => event.stopPropagation()} />
        )}
        {hasVisibleFlag(load.flag_code) ? (
          <span
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: flagDotColor(load.flag_code) }}
            title={flagDotLabel(load.flag_code)}
          >
            {flagDotTag(load.flag_code)}
          </span>
        ) : null}
      </div>
      {cardSecondaryLoadNumber(load) ? (
        <EntityLink
          kind="load"
          id={load.id}
          label={cardSecondaryLoadNumber(load) ?? undefined}
          className="font-mono text-[11px] text-gray-500"
          data-kanban-card-secondary="load-number"
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}

      <div className="mt-1 text-xs text-gray-600">{lane}</div>
      <div className="mt-1 text-xs font-medium text-gray-800">
        {load.assigned_primary_driver_id ? (
          <EntityLinkOrTombstone kind="driver" id={load.assigned_primary_driver_id} name={load.assigned_primary_driver_name} noun="Driver" onClick={(event) => event.stopPropagation()} />
        ) : (
          driverNameLabel(load)
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-600">
        <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{mode}</span>
        <span>{weight}</span>
        <span className="truncate" title={commodity}>
          {commodity}
        </span>
      </div>

      {dwell ? (
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-slate-700">Dwell {formatMinutes(dwell.dwell)}</span>
          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-slate-700">Free {formatMinutes(dwell.free)}</span>
          <span className={`rounded-sm px-1.5 py-0.5 ${dwell.det != null && dwell.det > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>
            Det {formatMinutes(dwell.det)}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${onTimeChipClass(load)}`}>{onTimeChipLabel(load)}</span>
        {isBreakdown(load) ? (
          <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">Breakdown</span>
        ) : null}
        {isEtaHeld(load) ? (
          <span className="rounded-sm bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">ETA held</span>
        ) : null}
        {hasActiveGeofenceBreach ? (
          <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Geofence</span>
        ) : null}
      </div>

      {isDeliveredColumn ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {factoring ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">{factoring}</span>
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
  const draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);
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
      title={[
        load.assigned_primary_driver_id
          ? entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")
          : null,
        load.assigned_unit_id ? entityLabel(load.assigned_unit_number, load.assigned_unit_id, "Unit") : null,
        entityLabel(load.load_number, load.id, "Load"),
        lane,
      ]
        .filter(Boolean)
        .join(" · ")}
      className={`flex h-10 items-center gap-2 rounded border border-gray-200 bg-white px-2 text-[11px] shadow-xs transition hover:bg-gray-50 ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      data-testid={`kanban-compact-card-${load.load_number}`}
      data-kanban-card-compact="true"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${onTimeChipClass(load).split(" ")[0]}`} aria-hidden />
      {/* Exact Leaves home.kanban:driver|unit — compact primary was plain driverUnitLabel */}
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-semibold text-gray-900">
        {load.assigned_primary_driver_id ? (
          <EntityLinkOrTombstone
            kind="driver"
            id={load.assigned_primary_driver_id}
            name={load.assigned_primary_driver_name}
            noun="Driver"
            data-testid="kanban-compact-driver-link"
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
        {load.assigned_primary_driver_id && load.assigned_unit_id ? <span aria-hidden>·</span> : null}
        {load.assigned_unit_id ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={load.assigned_unit_id}
            name={load.assigned_unit_number}
            noun="Unit"
            data-testid="kanban-compact-unit-link"
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
        {!load.assigned_primary_driver_id && !load.assigned_unit_id ? <span>Unassigned</span> : null}
      </span>
      <EntityLinkOrTombstone
        kind="load"
        id={load.id}
        name={load.load_number}
        noun="Load"
        className="shrink-0 font-mono text-[10px]"
        data-testid="kanban-compact-load-link"
        onClick={(event) => event.stopPropagation()}
      />
      {/* KANBAN-COMPACT-TRUNCATE (owner-live): the driver label was truncating because this SECONDARY lane
          text held up to 120px of the same row at every width above `sm`. The driver is the identifying
          field on a compact card, so the lane now yields first — it appears only on wide boards and takes
          less room when it does. Field ORDER is unchanged (§7 additive-only); only the lane's responsive
          visibility and max width move. */}
      <span className="hidden min-w-0 max-w-[90px] shrink truncate text-gray-500 xl:inline">{lane}</span>
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
  const draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);
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
      title={`${cardPrimaryLabel(load)} · ${entityLabel(load.load_number, load.id, "Load")} · ${lane}`}
      className={`flex flex-col gap-0.5 rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] shadow-xs transition hover:bg-gray-50 ${
        isDragging ? "opacity-60" : ""
      } ${draggableEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      data-testid={`kanban-standard-card-${load.load_number}`}
      data-kanban-card-standard="true"
    >
      {/* line 1 — primary: unit-first */}
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${onTimeChipClass(load).split(" ")[0]}`} aria-hidden />
        {load.assigned_unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.assigned_unit_number} noun="Unit" className="min-w-0 flex-1 truncate font-semibold text-gray-900" data-testid="kanban-standard-primary-entity-link" data-kanban-card-primary="unit" onClick={(event) => event.stopPropagation()} />
        ) : (
          <EntityLink kind="load" id={load.id} label={cardPrimaryLabel(load)} className="min-w-0 flex-1 truncate font-semibold text-gray-900" data-testid="kanban-standard-primary-entity-link" onClick={(event) => event.stopPropagation()} />
        )}
        {hasActiveGeofenceBreach ? <span className="shrink-0 text-red-600" title="Geofence breach">◆</span> : null}
        {isBreakdown(load) ? <span className="shrink-0 text-red-600" title="Breakdown">▲</span> : null}
        {hasVisibleFlag(load.flag_code) ? (
          <span
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: flagDotColor(load.flag_code) }}
            title={flagDotLabel(load.flag_code)}
          >
            {flagDotTag(load.flag_code)}
          </span>
        ) : null}
      </div>
      {/* line 2 — secondary: load # · driver · lane */}
      <div className="flex items-center gap-1.5 truncate text-[10px] text-gray-500">
        {secondaryLoad ? (
          <EntityLink
            kind="load"
            id={load.id}
            label={secondaryLoad}
            className="shrink-0 font-mono"
            onClick={(event) => event.stopPropagation()}
            data-testid="kanban-card-secondary-load-link"
            data-kanban-card-secondary="load-number"
          />
        ) : null}
        {/* KANBAN-COMPACT-TRUNCATE — owner saw "Leon… Unkno…" at STANDARD density too, so this is not a
            compact-only bug. The driver was capped at an arbitrary max-w-[110px] and so truncated even when
            the card had room to spare, and the lane competed for the same row at every width. The driver is
            the identifying field, so it now takes the free space (flex-1) and the lane — the least
            identifying part — yields first and only appears on wide boards. Field ORDER is unchanged
            (§7 additive-only): only widths and the lane's responsive visibility move. */}
        {load.assigned_primary_driver_id ? (
          <EntityLinkOrTombstone
            kind="driver"
            id={load.assigned_primary_driver_id}
            name={load.assigned_primary_driver_name}
            noun="Driver"
            className="min-w-0 flex-1 truncate"
            data-testid="kanban-standard-driver-link"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" data-kanban-card-secondary="driver">{driverNameLabel(load)}</span>
        )}
        <span className="hidden min-w-0 max-w-[90px] shrink truncate xl:inline">· {lane}</span>
      </div>
    </div>
  );
}

// Awaiting-assignment lane cards are synthetic trucks (no load), so they must NOT reuse the draggable
// KanbanCard components — dnd-kit's pointer listeners swallow the click, so the card never fired
// onBookForUnit and had no visible affordance. This is a purpose-built, NON-draggable card with an
// explicit "+ Book load" button; clicking anywhere opens the Book wizard pre-filled with this truck.
function AwaitingTruckCard({ load, onBook }: { load: DispatchLoadRow; onBook: (id: string) => void }) {
  const unitLabel = load.assigned_unit_number
    ? entityLabel(load.assigned_unit_number, load.assigned_unit_id, "Unit")
    : entityLabel(load.load_number, load.id, "Load");
  const driverLabel =
    load.assigned_primary_driver_name || load.assigned_primary_driver_id
      ? entityLabel(load.assigned_primary_driver_name, load.assigned_primary_driver_id, "Driver")
      : null;
  // Clicking anywhere on the card OR the explicit "+ Book load" button opens the Book wizard pre-filled with
  // this truck. The button is a real <button> (not a span) so it's an unmistakable, findable affordance; it
  // stops propagation only to avoid a harmless double-fire with the card click.
  // Exact Leaves home.kanban:unit|driver — unit/driver were plain labels despite IDs.
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`awaiting-truck-card-${load.id}`}
      onClick={() => onBook(load.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onBook(load.id);
        }
      }}
      className="cursor-pointer rounded-sm border border-gray-200 bg-white p-2 hover:border-slate-400 hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-2">
        {load.assigned_unit_id ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={load.assigned_unit_id}
            name={load.assigned_unit_number}
            noun="Unit"
            className="min-w-0 truncate text-xs font-semibold text-gray-900"
            data-testid="awaiting-truck-unit-link"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 truncate text-xs font-semibold text-gray-900">{unitLabel}</span>
        )}
        <button
          type="button"
          data-testid={`awaiting-truck-book-${load.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onBook(load.id);
          }}
          className="shrink-0 rounded-sm bg-[#1F2A44] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#2a3656]"
        >
          + Book load
        </button>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-gray-500">
        {load.assigned_primary_driver_id ? (
          <EntityLinkOrTombstone
            kind="driver"
            id={load.assigned_primary_driver_id}
            name={load.assigned_primary_driver_name}
            noun="Driver"
            data-testid="awaiting-truck-driver-link"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          driverLabel ?? "No driver assigned"
        )}
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
  onColumnHeaderClick,
}: {
  column: KanbanColumnDef;
  loads: DispatchLoadRow[];
  density: KanbanDensity;
  activeGeofenceBreachVehicleIds?: Set<string>;
  onLoadClick: (loadId: string) => void;
  onColumnHeaderClick?: (statuses: string[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.key}` });

  // DB-2: lanes that map to real load statuses get a clickable header → filtered List view.
  // Synthetic lanes (awaiting_assignment has statuses: []) stay plain.
  const headerLink =
    onColumnHeaderClick && column.statuses.length > 0 ? (
      <button
        type="button"
        onClick={() => onColumnHeaderClick(column.statuses)}
        className="text-left text-sm font-semibold text-gray-700 hover:text-slate-900 hover:underline"
        data-testid={`kanban-column-header-link-${column.key}`}
        title={`View ${column.title} loads in the list`}
      >
        {column.title}
      </button>
    ) : (
      <h3 className="text-sm font-semibold text-gray-700">{column.title}</h3>
    );

  if (column.collapsedByDefault) {
    return (
      <section className="min-w-[270px] rounded-sm border border-gray-200 bg-white p-2" data-testid={`kanban-column-${column.key}`}>
        <header className="flex items-center justify-between border-b border-gray-100 pb-2">
          {headerLink}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
        </header>
      </section>
    );
  }

  const detailed = density === "detailed";
  const minWidth = density === "compact" ? "min-w-[200px]" : density === "standard" ? "min-w-[230px]" : "min-w-[290px]";
  return (
    <section
      className={`${minWidth} flex-1 rounded-sm border border-gray-200 bg-white p-2`}
      data-testid={`kanban-column-${column.key}`}
    >
      <header className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
        {headerLink}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
      </header>
      <div ref={setNodeRef} className={`max-h-[68vh] ${detailed ? "space-y-2" : "space-y-1"} overflow-y-auto rounded-sm p-1 ${isOver ? "bg-slate-100" : "bg-transparent"}`}>
        {loads.length === 0 ? <div className="rounded-sm border border-dashed border-gray-300 p-3 text-xs text-gray-500">(empty)</div> : null}
        {loads.map((load) => {
          const breach = Boolean(load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id));
          if (column.key === "awaiting_assignment") {
            // onLoadClick for this lane is the book handler (see DispatchKanban) — open Book pre-filled.
            return <AwaitingTruckCard key={load.id} load={load} onBook={onLoadClick} />;
          }
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

export function DispatchKanban({ loads, awaitingTrucks = [], activeGeofenceBreachVehicleIds, loading, onLoadClick, onBookForUnit, onStatusDrop, onColumnHeaderClick, listError }: Props) {
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

  // KANBAN-CLICK-DEAD (owner-live). Every card is a `useDraggable`, and dnd-kit's DEFAULT PointerSensor has
  // NO activation constraint: pointerdown starts a drag immediately and preventDefaults, so the browser never
  // dispatches the follow-up `click`. The cards' onClick therefore never fired and clicking a load did
  // nothing — while DRAGGING worked perfectly, which is exactly the asymmetry the owner reported.
  // A distance constraint makes a stationary press stay a click and anything past 8px become a drag.
  // KeyboardSensor is kept so the board stays operable without a pointer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeId = event.active.id;
    const overId = event.over?.id;
    // LV-KANBAN-DROP-OUTSIDE-DROPPABLE-IS-SILENT. `event.over` is null whenever the release does not
    // resolve over a registered droppable — a near-miss with the pointer, or the keyboard sensor moving
    // the overlay in pixel steps that never snap to a lane. This used to return bare: no request, no
    // revert, no toast. A dispatcher then cannot tell "the server refused" from "my drag missed the
    // lane" from "it worked", and a human really did report a load as moved when nothing had happened.
    // It is NOT an error — they simply missed — so the tone is neutral. But it must not be silence.
    if (!activeId || !overId) {
      pushToast("Drop the card onto a lane to change its status.", "info");
      return;
    }
    const loadId = String(activeId);
    const targetColumnKey = String(overId).replace("column:", "");
    const targetGroup = KANBAN_STATUS_GROUPS.find((group) => group.key === targetColumnKey);
    const load = optimisticLoads.find((item) => item.id === loadId);
    if (!load && isSyntheticKanbanCardId(loadId)) {
      // Truck card: not a load, nothing to transition. Unreachable today because synthetic cards are no
      // longer draggable (#4793), but it stays feedback-bearing so no early return in this handler is silent.
      pushToast("That is a truck without a load — book it to a load first.", "info");
      return;
    }
    if (!targetGroup || !load) {
      // Not the synthetic case — an unknown column or a load id the board is rendering but does not hold.
      // That is a bug state, not a user action, so it must not vanish silently.
      pushToast("Could not move that card — the board could not identify it. Refresh and try again.", "error");
      return;
    }
    if (targetGroup.derivedOnly) {
      // FAIL-K1: refuse the write rather than perform a misleading one. Dropping here used to set
      // `in_transit`; with no `departed` geofence the card then rendered in "In transit", so the operator
      // saw their card jump to a lane they did not choose and had no idea why.
      pushToast(
        `${targetGroup.title} is set by telematics (pickup departure), not by dragging. Move the load to In transit instead.`,
        "info"
      );
      return;
    }
    if (resolveKanbanColumnKey(load) === targetColumnKey) {
      // A true no-op: the card is already in this lane. Still say so — silence is what made a missed drop
      // indistinguishable from a successful one.
      pushToast(`Load ${load.load_number} is already in ${targetGroup.title}.`, "info");
      return;
    }

    const nextStatus = targetGroup.dropStatus;
    const previousLoads = optimisticLoads;
    setOptimisticLoads((current) =>
      current.map((item) => (item.id === loadId ? { ...item, status: nextStatus, flag_code: nextStatus === "cancelled" ? "RED" : item.flag_code } : item))
    );
    try {
      const dropResult = await onStatusDrop(loadId, nextStatus);
      pushToast(`Load ${load.load_number} moved to ${targetGroup.title}`, "success");
      const mint = (dropResult as { driver_bill_mint?: { outcome?: string; missing?: string[] } } | null)?.driver_bill_mint;
      if (mint?.outcome === "skipped_no_pay_rate") {
        const missing =
          Array.isArray(mint.missing) && mint.missing.length > 0 ? mint.missing.join(", ") : "pay inputs";
        pushToast(
          `Driver pay NOT minted for ${load.load_number} — missing ${missing}. Enter shortest miles so pay can be priced (never invent from customer rate).`,
          "info"
        );
      }
    } catch (error) {
      setOptimisticLoads(previousLoads);
      // KANBAN-REVERSE-NOMOVE (owner-live): forward moves worked, backward ones "did not move". They were
      // being REJECTED by the server, but this catch discarded the error and printed a generic sentence, so
      // the dispatcher was told the move failed and never WHY — indistinguishable from a dead board.
      // Surface the server's own reason; keep the generic line only as the fallback when there is none.
      const reason = error instanceof Error ? error.message.trim() : "";
      pushToast(
        reason
          ? `Can't move ${load.load_number} to ${targetGroup.title} — ${reason}`
          : `Can't move ${load.load_number} to ${targetGroup.title}. The server rejected it and gave no reason. Reverted.`,
        "error"
      );
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
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading dispatch board...</div>;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
              onLoadClick={
                group.key === "awaiting_assignment" && onBookForUnit
                  ? (cardId) => onBookForUnit(cardId.replace(/^unit:/, ""))
                  : onLoadClick
              }
              onColumnHeaderClick={onColumnHeaderClick}
            />
          ))}
        </div>

        {/* Part D — Fleet out-of-service strip, pinned at the bottom of the board. */}
        <section
          className="sticky bottom-0 mt-2 rounded-sm border border-slate-200 bg-slate-100 p-2"
          data-testid="dispatch-kanban-oos-strip"
        >
          <header className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Fleet out of service</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">{outOfServiceLoads.length}</span>
          </header>
          {outOfServiceLoads.length === 0 ? (
            <p className="mt-1 text-[11px] italic text-slate-700">
              Full fleet out-of-service feed pending — no units flagged.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {outOfServiceLoads.map((load) => (
                <div
                  key={load.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onLoadClick(load.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onLoadClick(load.id);
                    }
                  }}
                  className="flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-100"
                  data-testid="kanban-oos-chip"
                >
                  <span className="text-red-600" aria-hidden>
                    ▲
                  </span>
                  {/* Exact Leaves home.kanban:driver|unit — strip was plain text despite IDs */}
                  <span className="flex min-w-0 items-center gap-1 font-semibold text-gray-900">
                    {load.assigned_primary_driver_id ? (
                      <EntityLinkOrTombstone
                        kind="driver"
                        id={load.assigned_primary_driver_id}
                        name={load.assigned_primary_driver_name}
                        noun="Driver"
                        data-testid="kanban-oos-driver-link"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null}
                    {load.assigned_primary_driver_id && load.assigned_unit_id ? <span aria-hidden>·</span> : null}
                    {load.assigned_unit_id ? (
                      <EntityLinkOrTombstone
                        kind="unit"
                        id={load.assigned_unit_id}
                        name={load.assigned_unit_number}
                        noun="Unit"
                        data-testid="kanban-oos-unit-link"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null}
                    {!load.assigned_primary_driver_id && !load.assigned_unit_id ? (
                      <span>Unassigned</span>
                    ) : null}
                  </span>
                  <EntityLinkOrTombstone
                    kind="load"
                    id={load.id}
                    name={load.load_number}
                    noun="Load"
                    className="font-mono text-[10px] text-gray-500"
                    data-testid="kanban-oos-load-link"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="rounded-sm bg-red-100 px-1.5 text-[10px] font-semibold text-red-800">Breakdown</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DndContext>
  );
}
