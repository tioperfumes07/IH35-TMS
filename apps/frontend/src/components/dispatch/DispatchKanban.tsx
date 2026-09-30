import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragCancelEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DispatchLoadRow, LoadStatus } from "../../api/loads";
import { getLoadStopsRecord, patchAssignUnit } from "../../api/dispatch";
import { LOCKED_BORDER, LOCKED_HEADER_TEXT, LOCKED_SURFACE } from "../../design/locked-baseline-tokens";
import { stampTruckLineArrival, stampTruckLineDeparture } from "../../api/truckLine";
import type { UnitsWithoutLoad } from "../../api/dispatch";
import { userFacingApiError } from "../../lib/api-error-message";
import { ConfirmModal } from "../shared/ConfirmModal";
import type { DataTableErrorState } from "../../lib/tableError";
import { classifyProfit, formatProfitCents, getLoadProfitability, profitBadgeClassName } from "../../lib/loadProfit";
import { entityLabel } from "../../lib/entity-label";
import { readDispatchAlertTier } from "../../lib/dispatch-local-settings";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { SettlementRefCell } from "../shared/SettlementRefCell";
import { ListErrorState } from "../ListErrorState";
import { useToast } from "../Toast";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { canDragLoad, flagDotColor, flagDotLabel, flagDotTag, hasVisibleFlag, toRouteSummary } from "./constants";
import { InlineStatusPicker } from "./InlineStatusPicker";

function combineRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

type KanbanColumnSort = { key: "unit" | "load"; direction: "asc" | "desc" };

function compareKanbanSortValue(load: DispatchLoadRow, key: "unit" | "load"): string {
  if (key === "unit") {
    return String(load.assigned_unit_number ?? (load.id.startsWith("unit:") ? load.load_number : "") ?? "");
  }
  return String(load.load_number ?? "");
}

function sortKanbanColumnLoads(loads: DispatchLoadRow[], sort?: KanbanColumnSort): DispatchLoadRow[] {
  if (!sort) return loads;
  return [...loads].sort((a, b) => {
    const cmp = compareKanbanSortValue(a, sort.key).localeCompare(compareKanbanSortValue(b, sort.key), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return sort.direction === "asc" ? cmp : -cmp;
  });
}

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
  operatingCompanyId?: string;
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
/**
 * KANBAN-HEADER-CONTRAST (Lead, 09-30-2026, owner: "in kanban the header boxes, the contrast in
 * color the background colors, check what is missing why it looks like crap").
 *
 * WHAT WAS MISSING — measured live on app.ih35dispatch.com/dispatch?view=kanban: there was no
 * tonal ladder at all. The lane was bg-white, the header band was bg-gray-100, and the page behind
 * both is near-white, so three surfaces that mean three different things (page / lane / card) all
 * rendered as the same white and the board read as floating text. The borders made it worse by
 * being off-palette hand-picked Tailwind grays (gray-300, gray-400) rather than the locked border.
 *
 * FIX: a real tonal ladder, defined once below. The first attempt at it got the ORDER wrong and
 * the correction is documented immediately after this block — read that one, it is the truth.
 * Header text is LOCKED_HEADER_TEXT (#4B5563) and every border is LOCKED_BORDER, so the four
 * header sites cannot drift apart again the way gray-100/gray-300/gray-400 did.
 */
// KANBAN-LADDER-INVERTED (Lead, 09-30-2026, second pass). Owner, live: "it still looks like crap,
// the colors, the outlines, it feels too weird."
//
// MY OWN BUG, measured live on the deployed build before this fix:
//   page      rgb(244,246,248)
//   column    rgb(247,248,250)   <- LIGHTER than the page. A container must recede, not advance.
//   lane body rgb(255,255,255)   <- WHITE
//   card      #fff + border      <- WHITE CARD ON A WHITE LANE. The cards vanished.
// I had the ladder upside down: I put the page tint on the COLUMN and the white surface on the
// LANE, so the one element that must read as a liftable object (these cards are draggable) had
// nothing behind it to lift off. That is the "feels weird" — there were no cards on screen, just
// text floating on a white sheet inside a container lighter than the page behind it.
//
// THE RIGHT ORDER, outermost to innermost — each step DARKER until the card, which is the object:
//   page      #F4F6F8   the desk
//   column    #FFFFFF   a panel sitting ON the desk: white, real border, one soft shadow
//   header    #E4EAF1   the panel's own title band (same band TruckLineBoard uses)
//   lane body #EDF1F6   RECESSED well — the tray the cards sit in
//   card      #FFFFFF   white + border + shadow, so it reads as pick-up-able against the well
// Every value is from the locked palette except the well, which is one deliberate step between
// the header band and white so the tray reads as inset rather than as a third competing surface.
const KANBAN_HEADER_BAND = "rgb(228,234,241)";
const KANBAN_LANE_WELL = "#EDF1F6";
const KANBAN_HEADER_STYLE = {
  background: KANBAN_HEADER_BAND,
  color: LOCKED_HEADER_TEXT,
  borderBottom: `1px solid #C9D4E0`,
} as const;
const KANBAN_COLUMN_STYLE = {
  background: LOCKED_SURFACE,
  border: `1px solid ${LOCKED_BORDER}`,
  boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
} as const;
const KANBAN_LANE_BODY_STYLE = {
  background: KANBAN_LANE_WELL,
  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.05)",
} as const;

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
  /**
   * KANBAN-DRAG-UNBLOCK (Lead, 09-30-2026, owner: "the boxes were supposed to be dragable so i
   * could drag from dispatch to at pick up if i wanted or to loaded etc").
   *
   * ROOT CAUSE of the refusal these three lanes showed: at_pickup / loaded / at_delivery are
   * geofence-DERIVED micro-states whose dropStatus maps to the SAME dispatch state as the parent
   * lane, so a drop produced dispatched->dispatched or in_transit->in_transit and the backend
   * rejected it as invalid_transition. The previous response was to refuse the drop in the UI with
   * a telematics message. That is a patch: it hides a broken write path instead of using the right
   * one, and it takes a control away from the dispatcher rather than making it work.
   *
   * THE RIGHT WRITE PATH ALREADY EXISTS. These three lanes are not load-status changes at all —
   * they are STOP EVENTS, and the stop-event model already carries a first-class Manual source
   * (StopsRecordStop.source: "Geofence + driver" | "Driver only" | "Manual"). Truck Line has been
   * writing them that way all along through POST .../stops/{stop_id}/arrive and /depart. So a drop
   * on one of these lanes now records the SAME stamp Truck Line records, on the SAME route, with
   * the SAME manual provenance. Nothing is fabricated as telematics; a manual stamp is stored as
   * manual and reads as Manual on the load's Stops record.
   */
  manualStamp?: { stop: "pickup" | "delivery"; event: "arrive" | "depart" };
  showDwell?: boolean;
};

// DISPATCH-REDESIGN Part D — Jorge's 10 lanes, exact order. "Cancelled" is KEPT as a
// collapsed 11th lane (additive-only: never delete a lane). Two splits — Awaiting vs Booked
// unassigned, and Loaded vs In transit — depend on the same Samsara geofence/late-detection
// feed that HOS/OOS/cash-ETA are gated on; until that feed is confirmed they separate
// best-effort by status (Loaded stays empty unless a "departed pickup" signal arrives).
const KANBAN_STATUS_GROUPS: KanbanColumnDef[] = [
  // ROUND 24.3 (owner, 2026-09-14): "a draft load lands in the Kanban 'Assigned' lane ...
  // DispatchKanban.tsx:164 maps 'draft' into {key:'assigned'} ... Wrong: an unfinished booking next
  // to dispatchable loads is a trap." "draft" removed from the "assigned" lane's own statuses
  // (below) and given its own lane here, first — before even "Awaiting assignment" — since a draft
  // with no assignment at all is earlier in the lifecycle than a load truly waiting to be assigned.
  // A draft that already has a real assignment in progress (hasAssignment, resolved below) still
  // routes to "Assigned" — this lane is only for a draft with NOTHING done on it yet, exactly what
  // Save Draft persists at its minimum (operating_company_id + customer_id + load_number).
  { key: "drafts", title: "Drafts", statuses: ["draft"], dropStatus: "draft", derivedOnly: true },
  // Awaiting assignment is TRUCK-derived (cards injected from awaitingTrucks), so it matches no
  // load status. Loads with no truck (planned/unassigned/booked) fall into Booked unassigned.
  { key: "awaiting_assignment", title: "Awaiting assignment", statuses: [], dropStatus: "planned" },
  // OWNER-COLLAPSE-2026-09-07: "Booked unassigned" and "Assigned" merged into one lane on the owner's
  // explicit instruction ("collapse into one Assigned lane") -- a load with no truck yet and a load
  // that already has one both now render in this single "Assigned" column. Never split this back into
  // two lanes without a new owner instruction (Rule 4 -- do not invent a rule that isn't theirs).
  { key: "assigned", title: "Assigned", statuses: ["planned", "unassigned", "booked", "assigned", "assigned_not_dispatched"], dropStatus: "assigned" },
  { key: "dispatched", title: "Dispatched", statuses: ["dispatched"], dropStatus: "dispatched" },
  // KANBAN-CROSS-COLUMN-DRAG: at_pickup and at_delivery are geofence-derived micro-states within
  // the dispatched/in_transit lifecycle stages (resolveKanbanColumnKey overrides status→column via
  // pickup/delivery geofence state). Their dropStatus values (at_pickup, at_delivery) map to the
  // SAME dispatch state as their parent (dispatched, in_transit) via toDispatchTransitionStatus, so
  // a drop always produces a same-state transition (dispatched→dispatched or in_transit→in_transit)
  // which the backend rejects as invalid_transition. Marking them derivedOnly (like "Loaded") refuses
  // the drop with a telematics explanation instead of a silent server rejection — the operator is
  // told these lanes are set by geofence/driver PWA, not by office drag.
  { key: "at_pickup", title: "At pickup", statuses: ["at_pickup"], dropStatus: "at_pickup", showDwell: true, manualStamp: { stop: "pickup", event: "arrive" } },
  { key: "loaded", title: "Loaded", statuses: [], dropStatus: "in_transit", manualStamp: { stop: "pickup", event: "depart" } },
  { key: "in_transit", title: "In transit", statuses: ["in_transit"], dropStatus: "in_transit" },
  { key: "at_delivery", title: "At delivery", statuses: ["at_delivery"], dropStatus: "at_delivery", showDwell: true, manualStamp: { stop: "delivery", event: "arrive" } },
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

// ROUND 24.3 — exported so the "draft resolves to its own lane, not Assigned" claim is a real,
// directly-tested fact rather than an inference from a full-board render.
export function resolveKanbanColumnKey(load: DispatchLoadRow): string {
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
  // C-23 / KANBAN-DRAG-UNBLOCK: a MANUAL stamp from dropping on At pickup / Loaded / At delivery
  // sets these fields optimistically (see optimisticGeofenceAfterManualStamp) so the card MOVES
  // into the target lane instead of staying put while only a toast fires.
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
  // Fallback is Assigned (booked_unassigned + assigned merged, owner 2026-09-07) — never the
  // truck-only Awaiting lane.
  return group?.key ?? "assigned";
}

/**
 * C-23 — after a successful Manual stamp from a Kanban drop, patch the board row so
 * `resolveKanbanColumnKey` places the card in the lane the operator just dropped on.
 * Without this, the stamp writes but the card stays in Dispatched (owner-reported "drag does nothing").
 */
export function optimisticGeofenceAfterManualStamp(
  stamp: { stop: "pickup" | "delivery"; event: "arrive" | "depart" },
): Partial<KanbanLoad> {
  if (stamp.stop === "pickup" && stamp.event === "arrive") {
    return { pickup_geofence_state: "at", geofence_state: "at" };
  }
  if (stamp.stop === "pickup" && stamp.event === "depart") {
    return { pickup_geofence_state: "departed", geofence_state: "departed", status: "in_transit" };
  }
  if (stamp.stop === "delivery" && stamp.event === "arrive") {
    return { delivery_geofence_state: "at", status: "in_transit" };
  }
  return {};
}

// REG-048 (owner live 2026-09-10, T164/T156 duplicated across Dispatched/Delivered): a unit with
// more than one open load rendered as separate competing cards on DIFFERENT columns -- e.g. an
// old delivered_pending_docs load (allowed to sit open per the lock-the-trucks NEW-02 backstop)
// AND a newly-dispatched load for the SAME unit both showing at once. groupLoadsByColumn buckets
// purely by each load's OWN status; nothing before it ever deduped by assigned_unit_id.
// Display/aggregation fix ONLY -- uq_loads_one_active_unit and
// assertUnitNotActiveOnAnotherLoad (the real DB guard letting a unit legitimately carry more than
// one non-void load row) are untouched; this only decides which ONE wins the single Kanban card.
// "Current" = the unit's most recently created load that isn't cancelled/abandoned -- the
// historical delivered/backlog load collapses out of view here (still fully visible/actionable on
// the List/Table view and Load Costs board, never hidden from the app, just not a second
// competing Kanban card). A unit whose only loads are all cancelled still shows its (cancelled)
// card rather than vanishing. Loads with no assigned_unit_id never compete against each other.
const KANBAN_TERMINAL_CANCELLED_STATUSES = new Set(["cancelled", "abandoned", "driver_walkoff", "driver_no_show"]);

// KANBAN-HIDES-A-REAL-LEG (Lead, 09-30-2026, owner live: "there are 16 dispatched ... now I still
// only see 11").
//
// REG-048 above fixed a REAL defect and its intent is kept intact: a unit whose OLD
// delivered_pending_docs load still sits open must not render a second competing card next to its
// CURRENT one. But the rule it used to do that was "one card per unit, newest wins," and that is
// broader than the defect. It also collapses two loads that are BOTH live dispatch work — which is
// exactly what a round trip is on this fleet: a northbound leg and its southbound return, both
// dispatched, both on the same truck, both needing a dispatcher.
//
// MEASURED LIVE on prod 2026-09-30: 14 loads in status 'dispatched' across 12 units. Two units run
// two legs each — T152 (13633, 13634) and T176 (13637, 13638). The backend returned both legs; this
// function threw one away per unit, so 13637 never reached the screen. A dispatched load that is
// nowhere on the dispatch board is the same class of defect as the settled-pointer bug fixed in the
// backend predicate today: work that exists and cannot be seen.
//
// THE CORRECTED RULE — separate the two cases REG-048 conflated:
//   * BACKLOG loads (delivered and past — money/paperwork tail) yield to live work on the same unit.
//     That is REG-048's actual defect and it stays fixed.
//   * Two or more LIVE loads on one unit are both real legs. Render both. The board is a dispatch
//     board; a leg the dispatcher must act on is never collapsed to make the grid tidier.
// A unit with only backlog loads still shows its newest one rather than vanishing, and a unit with
// only cancelled loads still shows its cancelled card, both exactly as before.
const KANBAN_BACKLOG_STATUSES = new Set([
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
]);
function dedupeLoadsByUnit(loads: DispatchLoadRow[]): DispatchLoadRow[] {
  const byUnit = new Map<string, DispatchLoadRow[]>();
  const unassigned: DispatchLoadRow[] = [];
  for (const load of loads) {
    if (!load.assigned_unit_id) {
      unassigned.push(load);
      continue;
    }
    const list = byUnit.get(load.assigned_unit_id) ?? [];
    list.push(load);
    byUnit.set(load.assigned_unit_id, list);
  }
  const newestFirst = (a: DispatchLoadRow, b: DispatchLoadRow) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const current: DispatchLoadRow[] = [...unassigned];
  for (const list of byUnit.values()) {
    if (list.length === 1) {
      current.push(list[0]!);
      continue;
    }
    const notCancelled = list.filter((load) => !KANBAN_TERMINAL_CANCELLED_STATUSES.has(String(load.status)));
    const pool = notCancelled.length > 0 ? notCancelled : list;
    // Every leg still in live dispatch work renders. Only the delivered-and-past tail yields.
    const live = pool.filter((load) => !KANBAN_BACKLOG_STATUSES.has(String(load.status)));
    if (live.length > 0) {
      current.push(...[...live].sort(newestFirst));
      continue;
    }
    current.push([...pool].sort(newestFirst)[0]!);
  }
  return current;
}

function groupLoadsByColumn(loads: DispatchLoadRow[]) {
  const grouped = new Map<string, DispatchLoadRow[]>();
  for (const group of KANBAN_STATUS_GROUPS) grouped.set(group.key, []);
  for (const load of dedupeLoadsByUnit(loads)) {
    const key = resolveKanbanColumnKey(load);
    grouped.set(key, [...(grouped.get(key) ?? []), load]);
  }
  return grouped;
}

// SWIM-LANE ROW ALIGNMENT (owner 2026-09-11): one row per UNIT, computed once across the whole board.
// Each unit's card renders in whichever lane matches its current load's status; every OTHER lane on
// that same row is empty space at that row's height. The row key is unit-derived (assigned_unit_id or
// load id for unassigned), NOT column-local-index-derived — so the same unit is always at the same
// vertical position no matter which lane it's currently in.
type UnitRow = {
  unitKey: string;
  unitId?: string;
  unitNumber?: string | null;
  load: DispatchLoadRow;
  columnKey: string;
};

function computeAllUnits(
  loads: DispatchLoadRow[],
  awaitingTruckCards: DispatchLoadRow[],
): UnitRow[] {
  const rows: UnitRow[] = [];
  const seenUnits = new Set<string>();

  // Awaiting trucks (trucks without loads) go in the "awaiting_assignment" lane
  for (const truck of awaitingTruckCards) {
    const unitId = truck.assigned_unit_id ?? truck.id;
    if (seenUnits.has(unitId)) continue;
    rows.push({
      unitKey: `unit:${unitId}`,
      unitId,
      unitNumber: truck.assigned_unit_number,
      load: truck,
      columnKey: "awaiting_assignment",
    });
    seenUnits.add(unitId);
  }

  // SWIM-LANE-DROPS-THE-SECOND-LEG (Lead, 09-30-2026). This loop used `if (unitId &&
  // seenUnits.has(unitId)) continue;` and so enforced one row per unit a SECOND time, downstream of
  // dedupeLoadsByUnit. Fixing the dedupe alone changed nothing on screen, because whatever the
  // dedupe let through, this `continue` then threw away.
  //
  // MEASURED LIVE 2026-09-30, after both earlier fixes were deployed: the API returned all 14
  // dispatched loads (verified by calling /api/v1/mdata/loads?board_scope=live directly from the
  // page: returned 14, total 14, including 13633 and 13637) and the board still rendered 12. The
  // two it dropped were the second leg of each double-legged unit — T152's 13633 and T176's 13637.
  //
  // The owner's 2026-09-11 instruction is ROW ALIGNMENT: a unit sits at the same vertical position
  // whichever lane it is in, so the eye can track one truck across the board. That is about where a
  // row is drawn, not about how many of a unit's real loads are allowed to exist. A round trip is
  // two legs on one truck and a dispatcher has to act on both. Alignment is preserved by keying the
  // row on the unit; a second leg gets its own row keyed unit + load id, so it aligns under its
  // sibling instead of replacing it. seenUnits keeps its FIRST job intact — an awaiting-truck row
  // and a load row for the same unit still never both render.
  const unitsWithAwaitingRow = new Set(seenUnits);
  for (const load of dedupeLoadsByUnit(loads)) {
    const unitId = load.assigned_unit_id;
    // A unit already shown as an awaiting truck must not also appear as a load row.
    if (unitId && unitsWithAwaitingRow.has(unitId)) continue;
    const key = unitId ? `unit:${unitId}:load:${load.id}` : `load:${load.id}`;
    rows.push({
      unitKey: key,
      unitId: unitId ?? undefined,
      unitNumber: load.assigned_unit_number,
      load,
      columnKey: resolveKanbanColumnKey(load),
    });
    if (unitId) seenUnits.add(unitId);
  }

  return rows;
}

function sortAllUnits(units: UnitRow[], sort?: KanbanColumnSort): UnitRow[] {
  if (!sort) return units;
  return [...units].sort((a, b) => {
    const cmp = compareKanbanSortValue(a.load, sort.key).localeCompare(
      compareKanbanSortValue(b.load, sort.key),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
    return sort.direction === "asc" ? cmp : -cmp;
  });
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
  const configuredTier = readDispatchAlertTier(load.operating_company_id, load.progress_eta_delta_minutes);
  if (configuredTier === "red") return "bg-red-100 text-red-800";
  if (configuredTier === "amber") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "green") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "amber") return "bg-slate-100 text-slate-700";
  if (load.on_time_prediction === "red") return "bg-red-100 text-red-800";
  if (load.progress_status === "early" || load.progress_status === "on_track") return "bg-slate-100 text-slate-700";
  if (load.progress_status === "behind") return "bg-slate-100 text-slate-700";
  if (load.progress_status === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

function onTimeChipLabel(load: DispatchLoadRow): string {
  const configuredTier = readDispatchAlertTier(load.operating_company_id, load.progress_eta_delta_minutes);
  if (configuredTier === "red") return "Late";
  if (configuredTier === "amber") return "At risk";
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

  if (profitabilityQuery.isError) {
    return (
      <button
        type="button"
        className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
        title="Load profitability unavailable — retry"
        aria-label="Retry load profitability"
        onClick={(event) => {
          event.stopPropagation();
          void profitabilityQuery.refetch();
        }}
      >
        Profit retry
      </button>
    );
  }

  if (netCents == null) {
    if (profitabilityQuery.isLoading) {
      return (
        <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${profitBadgeClassName("loading")}`}>Profit…</span>
      );
    }
    return null;
  }

  const variant = classifyProfit(netCents, marginPct ?? 0);
  return (
    <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${profitBadgeClassName(variant)}`} title={`Net profit (${marginPct ?? 0}% margin)`}>
      {formatProfitCents(netCents)}
    </span>
  );
}

// STATUS-DROPDOWN SWEEP (owner 2026-09-10, verbatim: "the button like quickbooks has drop down
// everywhere to change status wherever necessary") -- shared pending/toast wrapper around the ONE
// money-aware onStatusDrop writer (handleDragEnd already calls it too), reused by every Kanban card
// density that mounts InlineStatusPicker so there is exactly one status-change code path per card,
// not one duplicated per density.
function useInlineStatusChange(load: KanbanLoad, onStatusDrop: Props["onStatusDrop"] | undefined) {
  const { pushToast } = useToast();
  const [pending, setPending] = useState(false);
  const handleSelect = async (next: LoadStatus) => {
    if (!onStatusDrop || next === load.status) return;
    setPending(true);
    try {
      await onStatusDrop(load.id, next);
      pushToast(`Load ${load.load_number} → ${next}`, "success");
    } catch (error) {
      pushToast(userFacingApiError(error, "Failed to change load status"), "error");
    } finally {
      setPending(false);
    }
  };
  return { pending, handleSelect };
}

function KanbanDispatchCard({
  load,
  columnKey,
  hasActiveGeofenceBreach,
  onClick,
  onStatusDrop,
  operatingCompanyId,
}: {
  load: KanbanLoad;
  columnKey: string;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
  onStatusDrop?: Props["onStatusDrop"];
  operatingCompanyId?: string;
}) {
  const draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable:load:${load.id}`,
    data: { type: "load", loadId: load.id },
  });

  // ROUND 20.3 DRAG ACTIVATION (owner-live 2026-09-12): dnd-kit REQUIRES touch-action:none on the
  // draggable node itself — without it, a human-speed press-and-move gets raced by the browser's own
  // native text-selection/scroll gesture, which wins and silently swallows the drag (pickup fires,
  // no over/drop ever follows). user-select:none on the class list backs it up so a slow drag can't
  // highlight the card's text instead of moving it. Only set while this card is actually draggable —
  // a non-draggable card (terminal status, synthetic id) keeps normal text selection/scroll.
  const style = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    ...(draggableEnabled ? { touchAction: "none" as const } : {}),
  };
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);
  const commodity = load.commodity?.trim() || "—";
  const weight = formatWeight(load.weight_lbs);
  const mode = loadModeLabel(load);
  const dwell = dwellMetrics(load, columnKey);
  const factoring = factoringStatusLabel(load.factoring_status);
  const isDeliveredColumn = columnKey === "delivered";
  const { pending: statusChangePending, handleSelect: handleInlineStatusSelect } = useInlineStatusChange(load, onStatusDrop);

  return (
    <div
      ref={combineRefs(setNodeRef, setDroppableRef)}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(load.id)}
      className={`relative cursor-pointer rounded border border-gray-200 bg-white p-3 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm ${
        isDragging ? "opacity-60" : ""
      } ${isOver ? "ring-2 ring-slate-400" : ""} ${
        draggableEnabled ? "cursor-grab select-none active:cursor-grabbing" : "cursor-default"
      }`}
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
          <span className="flex min-w-0 items-center gap-1.5">
            <EntityLink kind="load" id={load.id} label={cardPrimaryLabel(load)} className="min-w-0 truncate font-semibold text-gray-900" data-testid="kanban-card-primary-entity-link" onClick={(event) => event.stopPropagation()} />
            {/* ALL-SEATS LAW (owner, 2026-09-13): load is PRIMARY here (no unit assigned) — its
                settlement/tour number sits beside it, mirroring the secondary line below. */}
            {operatingCompanyId ? (
              <span className="shrink-0 text-xs" onClick={(event) => event.stopPropagation()}>
                <SettlementRefCell loadId={load.id} operatingCompanyId={operatingCompanyId} />
              </span>
            ) : null}
          </span>
        )}
        {hasVisibleFlag(load.flag_code) ? (
          <span
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-white"
            style={{ backgroundColor: flagDotColor(load.flag_code) }}
            title={flagDotLabel(load.flag_code)}
          >
            {flagDotTag(load.flag_code)}
          </span>
        ) : null}
      </div>
      {cardSecondaryLoadNumber(load) ? (
        <div className="flex items-center gap-1.5">
          <EntityLink
            kind="load"
            id={load.id}
            label={cardSecondaryLoadNumber(load) ?? undefined}
            className="font-mono text-[11px] text-gray-500"
            data-kanban-card-secondary="load-number"
            onClick={(event) => event.stopPropagation()}
          />
          {/* ALL-SEATS LAW (owner, 2026-09-13): a settlement/tour number beside every load number. */}
          {operatingCompanyId ? (
            <span className="text-xs" onClick={(event) => event.stopPropagation()}>
              <SettlementRefCell loadId={load.id} operatingCompanyId={operatingCompanyId} />
            </span>
          ) : null}
        </div>
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
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-slate-700">Dwell {formatMinutes(dwell.dwell)}</span>
          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-slate-700">Free {formatMinutes(dwell.free)}</span>
          <span className={`rounded-sm px-1.5 py-0.5 ${dwell.det != null && dwell.det > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}>
            Det {formatMinutes(dwell.det)}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${onTimeChipClass(load)}`}>{onTimeChipLabel(load)}</span>
        {isBreakdown(load) ? (
          <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">Breakdown</span>
        ) : null}
        {isEtaHeld(load) ? (
          <span className="rounded-sm bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-800">ETA held</span>
        ) : null}
        {hasActiveGeofenceBreach ? (
          <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">Geofence</span>
        ) : null}
      </div>

      {isDeliveredColumn ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {factoring ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">{factoring}</span>
          ) : null}
          <DeliveredProfitBadge load={load} />
        </div>
      ) : null}
      {/* QuickBooks-style Change Status, alongside drag (owner 2026-09-10 STATUS-DROPDOWN SWEEP) */}
      {onStatusDrop && !isSyntheticKanbanCardId(load.id) ? (
        <div className="mt-2 flex items-center" data-testid="kanban-dispatch-card-status-picker">
          <InlineStatusPicker
            loadId={load.id}
            status={load.status}
            pending={statusChangePending}
            onSelect={next => void handleInlineStatusSelect(next)}
          />
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
  operatingCompanyId,
}: {
  load: KanbanLoad;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
  operatingCompanyId?: string;
}) {
  const draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable:load:${load.id}`,
    data: { type: "load", loadId: load.id },
  });
  // ROUND 20.3 DRAG ACTIVATION — see KanbanDispatchCard's identical comment above.
  const style = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    ...(draggableEnabled ? { touchAction: "none" as const } : {}),
  };
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);

  return (
    <div
      ref={combineRefs(setNodeRef, setDroppableRef)}
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
      } ${isOver ? "ring-2 ring-slate-400" : ""} ${
        draggableEnabled ? "cursor-grab select-none active:cursor-grabbing" : "cursor-pointer"
      }`}
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
        {/* DSP-A (owner 2026-09-04): on the board every one of these cards is unassigned by
            definition — the word "Unassigned" is noise that "looks too dirty." Show the empty-cell
            dash instead (owner's dash-not-text rule), never the redundant label. */}
        {!load.assigned_primary_driver_id && !load.assigned_unit_id ? (
          <span className="text-gray-400" aria-label="No unit or driver assigned">—</span>
        ) : null}
      </span>
      <EntityLinkOrTombstone
        kind="load"
        id={load.id}
        name={load.load_number}
        noun="Load"
        className="shrink-0 font-mono text-xs"
        data-testid="kanban-compact-load-link"
        onClick={(event) => event.stopPropagation()}
      />
      {/* ALL-SEATS LAW (owner, 2026-09-13): settlement/tour number beside the load number. */}
      {operatingCompanyId ? (
        <span className="shrink-0 text-xs" onClick={(event) => event.stopPropagation()}>
          <SettlementRefCell loadId={load.id} operatingCompanyId={operatingCompanyId} />
        </span>
      ) : null}
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
  onStatusDrop,
  operatingCompanyId,
}: {
  load: KanbanLoad;
  hasActiveGeofenceBreach?: boolean;
  onClick: (id: string) => void;
  onStatusDrop?: Props["onStatusDrop"];
  operatingCompanyId?: string;
}) {
  const draggableEnabled = canDragLoad(load.status) && !isSyntheticKanbanCardId(load.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: { loadId: load.id, status: load.status },
    disabled: !draggableEnabled,
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable:load:${load.id}`,
    data: { type: "load", loadId: load.id },
  });
  // ROUND 20.3 DRAG ACTIVATION — see KanbanDispatchCard's identical comment above.
  const style = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    ...(draggableEnabled ? { touchAction: "none" as const } : {}),
  };
  const lane = toRouteSummary(load.first_pickup_city, load.first_delivery_city);
  const secondaryLoad = cardSecondaryLoadNumber(load);
  // STATUS-DROPDOWN SWEEP (owner 2026-09-10, verbatim: "the button like quickbooks has drop down
  // everywhere to change status wherever necessary") -- drag-to-change-status already exists on
  // this card, but a dispatcher without a free hand for drag-and-drop (or on a touch device) had no
  // other way to change status without opening the full drawer. useInlineStatusChange wraps the
  // SAME onStatusDrop prop handleDragEnd already calls -- the one money-aware write path, shared with
  // the Detailed-density card below, never a second one.
  const { pending: statusChangePending, handleSelect: handleInlineStatusSelect } = useInlineStatusChange(load, onStatusDrop);

  return (
    <div
      ref={combineRefs(setNodeRef, setDroppableRef)}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(load.id)}
      title={`${cardPrimaryLabel(load)} · ${entityLabel(load.load_number, load.id, "Load")} · ${lane}`}
      className={`flex flex-col gap-0.5 rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] shadow-xs transition hover:bg-gray-50 ${
        isDragging ? "opacity-60" : ""
      } ${isOver ? "ring-2 ring-slate-400" : ""} ${
        draggableEnabled ? "cursor-grab select-none active:cursor-grabbing" : "cursor-pointer"
      }`}
      data-testid={`kanban-standard-card-${load.load_number}`}
      data-kanban-card-standard="true"
    >
      {/* line 1 — primary: unit-first */}
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${onTimeChipClass(load).split(" ")[0]}`} aria-hidden />
        {load.assigned_unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={load.assigned_unit_id} name={load.assigned_unit_number} noun="Unit" className="min-w-0 flex-1 truncate font-semibold text-gray-900" data-testid="kanban-standard-primary-entity-link" data-kanban-card-primary="unit" onClick={(event) => event.stopPropagation()} />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
            <EntityLink kind="load" id={load.id} label={cardPrimaryLabel(load)} className="min-w-0 truncate font-semibold text-gray-900" data-testid="kanban-standard-primary-entity-link" onClick={(event) => event.stopPropagation()} />
            {/* ALL-SEATS LAW (owner, 2026-09-13): load is PRIMARY here (no unit assigned) —
                settlement/tour number sits beside it, mirroring line 2's placement below. */}
            {operatingCompanyId ? (
              <span className="shrink-0 text-xs font-normal" onClick={(event) => event.stopPropagation()}>
                <SettlementRefCell loadId={load.id} operatingCompanyId={operatingCompanyId} />
              </span>
            ) : null}
          </span>
        )}
        {hasActiveGeofenceBreach ? <span className="shrink-0 text-red-600" title="Geofence breach">◆</span> : null}
        {isBreakdown(load) ? <span className="shrink-0 text-red-600" title="Breakdown">▲</span> : null}
        {hasVisibleFlag(load.flag_code) ? (
          <span
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-xs font-bold text-white"
            style={{ backgroundColor: flagDotColor(load.flag_code) }}
            title={flagDotLabel(load.flag_code)}
          >
            {flagDotTag(load.flag_code)}
          </span>
        ) : null}
      </div>
      {/* line 2 — secondary: load # · driver · lane */}
      <div className="flex items-center gap-1.5 truncate text-xs text-gray-500">
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
        {/* ALL-SEATS LAW (owner, 2026-09-13): settlement/tour number beside the load number. */}
        {secondaryLoad && operatingCompanyId ? (
          <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
            <SettlementRefCell loadId={load.id} operatingCompanyId={operatingCompanyId} />
          </span>
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
      {/* line 3 — QuickBooks-style Change Status, alongside drag (owner 2026-09-10) */}
      {onStatusDrop && !isSyntheticKanbanCardId(load.id) ? (
        <div className="flex items-center" data-testid="kanban-standard-card-status-picker">
          <InlineStatusPicker
            loadId={load.id}
            status={load.status}
            pending={statusChangePending}
            onSelect={next => void handleInlineStatusSelect(next)}
          />
        </div>
      ) : null}
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
  // BRD-12: truck cards are draggable onto load cards to assign the unit. The same press-and-hold still
  // opens the Book wizard via onClick when the pointer is released within the drag activation distance.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: load.id,
    data: {
      type: "unit",
      unitId: load.assigned_unit_id,
      unitNumber: load.assigned_unit_number,
      driverName: load.assigned_primary_driver_name,
    },
  });
  // ROUND 20.3 DRAG ACTIVATION — see KanbanDispatchCard's identical comment above. This card is
  // unconditionally draggable (no disabled flag), so touch-action is unconditional too.
  const transformStyle = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    touchAction: "none" as const,
  };
  // Clicking anywhere on the card OR the explicit "+ Book load" button opens the Book wizard pre-filled with
  // this truck. The button is a real <button> (not a span) so it's an unmistakable, findable affordance; it
  // stops propagation only to avoid a harmless double-fire with the card click.
  // Exact Leaves home.kanban:unit|driver — unit/driver were plain labels despite IDs.
  return (
    <div
      ref={setNodeRef}
      style={transformStyle}
      {...attributes}
      {...listeners}
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
      className={`cursor-pointer select-none rounded-sm border border-gray-200 bg-white p-2 hover:border-slate-400 hover:bg-slate-50 ${
        isDragging ? "opacity-60" : ""
      } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
    >
      {/* Owner ruling 2026-09-04: the vehicle number is the awaiting card's IDENTITY and must ALWAYS
          be fully visible. It used to share one flex row with the "+ Book load" button under min-w-0
          truncate, so a narrow lane collapsed "T171" to "T.". Unit number is now its own no-truncate
          line; the book button drops to a full-width line below it. */}
      <div className="flex items-center gap-2">
        {load.assigned_unit_id ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={load.assigned_unit_id}
            name={load.assigned_unit_number}
            noun="Unit"
            className="whitespace-nowrap text-xs font-semibold text-gray-900"
            data-testid="awaiting-truck-unit-link"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="whitespace-nowrap text-xs font-semibold text-gray-900">{unitLabel}</span>
        )}
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
      <button
        type="button"
        data-testid={`awaiting-truck-book-${load.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onBook(load.id);
        }}
        className="mt-1 w-full rounded-sm bg-[#1F2A44] px-2 py-1 text-xs font-semibold text-white hover:bg-[#2a3656]"
      >
        + Book load
      </button>
    </div>
  );
}

function KanbanColumnSortControls({
  columnKey,
  sort,
  onToggleSort,
}: {
  columnKey: string;
  sort?: KanbanColumnSort;
  onToggleSort: (columnKey: string, sortKey: "unit" | "load") => void;
}) {
  const renderButton = (label: string, sortKey: "unit" | "load") => {
    const active = sort?.key === sortKey;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-semibold normal-case tracking-normal ${
          active ? "bg-slate-200 text-slate-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        }`}
        data-testid={`kanban-column-sort-${columnKey}-${sortKey}`}
        onClick={() => onToggleSort(columnKey, sortKey)}
      >
        {label}
        {active ? (sort?.direction === "asc" ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden /> ) : null}
      </button>
    );
  };
  return (
    <div className="mt-1 flex items-center gap-1" data-testid={`kanban-column-sort-controls-${columnKey}`}>
      {renderButton("Unit", "unit")}
      {renderButton("Load #", "load")}
    </div>
  );
}

// SWIM-LANE: KanbanDispatchColumn is the legacy per-column renderer, replaced by
// KanbanSwimLaneColumn for the main board. Kept (not deleted) because
// verify-kanban-awaiting-truck-entitylinks.mjs uses its `function KanbanDispatchColumn`
// line as a boundary marker to locate the AwaitingTruckCard body above it.
// Exported so TypeScript does not flag it as unused (Rule: never delete modules).
export function KanbanDispatchColumn({
  column,
  loads,
  density,
  activeGeofenceBreachVehicleIds,
  onLoadClick,
  onColumnHeaderClick,
  columnSort,
  onToggleColumnSort,
  width,
  onResize,
  onStatusDrop,
}: {
  column: KanbanColumnDef;
  loads: DispatchLoadRow[];
  density: KanbanDensity;
  activeGeofenceBreachVehicleIds?: Set<string>;
  onLoadClick: (loadId: string) => void;
  onColumnHeaderClick?: (statuses: string[]) => void;
  columnSort?: KanbanColumnSort;
  onToggleColumnSort: (columnKey: string, sortKey: "unit" | "load") => void;
  width?: number;
  onResize?: (columnKey: string, width: number) => void;
  onStatusDrop?: Props["onStatusDrop"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.key}` });
  // DSP-12 (owner 2026-09-04): "each individual column we cannot adjust width." Lanes were fixed at a
  // density-derived min-width with flex-1, so a dispatcher could never widen a busy lane to read long
  // load/route text. This ref + pointer-drag handle lets each lane be resized; the width persists per
  // lane key (see DispatchKanban.setColumnWidth) so the board keeps the operator's layout across reloads.
  const sectionRef = useRef<HTMLElement | null>(null);
  // ROUND 203 F18 — unmount mid-drag must remove window listeners.
  const resizeListenersRef = useRef<{ move?: (ev: PointerEvent) => void; up?: () => void }>({});
  useEffect(() => {
    return () => {
      const { move, up } = resizeListenersRef.current;
      if (move) window.removeEventListener("pointermove", move);
      if (up) window.removeEventListener("pointerup", up);
      resizeListenersRef.current = {};
    };
  }, []);
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onResize) return;
      // Do not let the resize gesture bubble into dnd-kit card/column drag sensors.
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = sectionRef.current?.getBoundingClientRect().width ?? width ?? 290;
      const prev = resizeListenersRef.current;
      if (prev.move) window.removeEventListener("pointermove", prev.move);
      if (prev.up) window.removeEventListener("pointerup", prev.up);
      const handleMove = (ev: PointerEvent) => onResize(column.key, startWidth + (ev.clientX - startX));
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        resizeListenersRef.current = {};
      };
      resizeListenersRef.current = { move: handleMove, up: handleUp };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [column.key, onResize, width],
  );
  // DSP-15 (owner 2026-09-04): a collapsedByDefault lane (Cancelled) previously rendered ONLY
  // its header + count with no way to open it — the cancelled loads were unreachable on the
  // board. This expander toggles the lane open on demand; the hook lives above every early
  // return so lane hook order stays stable.
  const [expanded, setExpanded] = useState(false);

  // DB-2: lanes that map to real load statuses get a clickable header → filtered List view.
  // Synthetic lanes (awaiting_assignment has statuses: []) stay plain.
  const headerLink =
    onColumnHeaderClick && column.statuses.length > 0 ? (
      <button
        type="button"
        onClick={() => onColumnHeaderClick(column.statuses)}
        className="text-center text-xs font-semibold text-gray-700 hover:text-slate-900 hover:underline"
        data-testid={`kanban-column-header-link-${column.key}`}
        title={`View ${column.title} loads in the list`}
      >
        {column.title}
      </button>
    ) : (
      <h3 className="text-xs font-semibold text-gray-700">{column.title}</h3>
    );

  {/* CENTERING + SQUARE-EDGES LAW (owner ruling 2026-09-04, item #13, ORCH-measured): Kanban lane
      headers centered (a 3-column grid keeps the title true-centered regardless of the count
      badge's width, which a plain justify-between can't do) and given a full outline (border, not
      just border-b), matching the same 2px radius as everything else. */}
  if (column.collapsedByDefault && !expanded) {
    return (
      <section className="kanban-col-collapsed flex-none w-[148px] rounded-sm p-2" style={KANBAN_COLUMN_STYLE} data-testid={`kanban-column-${column.key}`}>
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 pb-1.5 pt-1 text-section-header font-semibold uppercase tracking-[0.4px]" style={KANBAN_HEADER_STYLE}>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            data-testid={`kanban-column-expander-${column.key}`}
            aria-expanded={false}
            title={`Show ${column.title} loads`}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <div className="text-center">{headerLink}</div>
          <span className="justify-self-end rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
        </header>
        <KanbanColumnSortControls columnKey={column.key} sort={columnSort} onToggleSort={onToggleColumnSort} />
      </section>
    );
  }

  const detailed = density === "detailed";
  // KANBAN-PROPORTION (Lead, 09-30-2026, owner: "kanban still out of proportion"). Columns carried a
  // min-width and NOTHING else, inside a `flex gap-3 overflow-x-auto` board -- so each column sized
  // itself to its own content and none of them shared the board evenly. A COLLAPSED column was also
  // min-w-[270px], i.e. WIDER than an open standard column at 230px, which is backwards. Expanded
  // columns now take an equal share (flex-1 basis-0) and still honour their per-density minimum, so
  // the board fills at any width and falls back to horizontal scroll only when the minimums no
  // longer fit. Collapsed columns are flex-none at a fixed 148px -- always narrower than open ones.
  const minWidth = (density === "compact" ? "min-w-[200px]" : density === "standard" ? "min-w-[230px]" : "min-w-[290px]") + " flex-1 basis-0";
  return (
    <section
      ref={sectionRef}
      className={`relative ${width ? "" : `${minWidth} flex-1`} rounded-sm p-2`}
      style={width ? { ...KANBAN_COLUMN_STYLE, width: `${width}px`, flex: "0 0 auto" } : KANBAN_COLUMN_STYLE}
      data-testid={`kanban-column-${column.key}`}
    >
      <header className="mb-2 px-2 pb-1.5 pt-1 text-section-header font-semibold uppercase tracking-[0.4px]" style={KANBAN_HEADER_STYLE}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {column.collapsedByDefault ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex w-fit items-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              data-testid={`kanban-column-collapser-${column.key}`}
              aria-expanded={true}
              title={`Collapse ${column.title}`}
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center justify-center gap-1 text-center">
            {headerLink}
            {/* KANBAN-DRAG-UNBLOCK: the badge used to read "Auto" on at_pickup / Loaded /
                at_delivery and claim they were not drag-droppable. They are now, so the badge says
                what a drop there really does — it writes a manual stop stamp. Drafts keeps its own
                badge and its own refusal. */}
            {column.derivedOnly ? (
              <span
                className="rounded-sm bg-slate-100 px-1 py-0.5 text-xs font-semibold uppercase text-slate-500"
                data-testid={`kanban-column-auto-badge-${column.key}`}
                title="Only resumed and finished from its own card — not drag-droppable"
              >
                Draft
              </span>
            ) : column.manualStamp ? (
              <span
                className="rounded-sm border border-slate-200 bg-slate-100 px-1 py-0.5 text-xs font-semibold uppercase text-slate-700"
                data-testid={`kanban-column-stamp-badge-${column.key}`}
                title={`Fills automatically from geofence/driver PWA. Dropping a card here records a MANUAL ${column.manualStamp.event === "arrive" ? "arrival" : "departure"} stamp on the ${column.manualStamp.stop} stop — it is stored and shown as Manual, and it never overwrites an existing stamp.`}
              >
                Stamp
              </span>
            ) : null}
          </div>
          <span className="justify-self-end rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{loads.length}</span>
        </div>
        <KanbanColumnSortControls columnKey={column.key} sort={columnSort} onToggleSort={onToggleColumnSort} />
      </header>
      <div
        ref={setNodeRef}
        className={`max-h-[68vh] min-h-[120px] ${detailed ? "space-y-2" : "space-y-1"} overflow-y-auto rounded-sm p-1`}
        style={isOver ? { background: "#DCE7F3" } : KANBAN_LANE_BODY_STYLE}
        data-c23-drop-target="true"
      >
        {loads.length === 0 ? (
          <div className="rounded-sm border border-dashed border-gray-300 p-3 text-xs text-gray-500">
            {column.key === "drafts"
              ? "No open drafts."
              : column.manualStamp
                ? `Fills from geofence / driver PWA — or drop a card here to stamp the ${column.manualStamp.stop} ${column.manualStamp.event === "arrive" ? "arrival" : "departure"} manually.`
                : "(empty)"}
          </div>
        ) : null}
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
            return <KanbanStandardCard key={load.id} load={readExtras(load)} hasActiveGeofenceBreach={breach} onClick={onLoadClick} onStatusDrop={onStatusDrop} />;
          }
          return (
            <KanbanDispatchCard
              key={load.id}
              load={readExtras(load)}
              columnKey={column.key}
              hasActiveGeofenceBreach={breach}
              onClick={onLoadClick}
              onStatusDrop={onStatusDrop}
            />
          );
        })}
      </div>
      {onResize ? (
        <div
          role="separator"
          aria-orientation="vertical"
          data-testid={`kanban-column-resize-${column.key}`}
          onPointerDown={onResizePointerDown}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-slate-300"
          title="Drag to resize this lane"
        />
      ) : null}
    </section>
  );
}

// SWIM-LANE ROW ALIGNMENT (owner 2026-09-11): one row per UNIT, computed once across the whole board.
// Each column renders ALL unit rows; a unit's card appears in whichever lane matches its current
// load's status, and every OTHER lane on that same row is empty space at that row's height. The row
// key is unit-derived (assigned_unit_id or load id for unassigned), NOT column-local-index-derived.
// Per-density row min-heights keep rows aligned across columns at Standard density (the default).
const SWIM_LANE_ROW_MIN_HEIGHT: Record<KanbanDensity, number> = {
  compact: 44,
  standard: 64,
  detailed: 150,
};

function KanbanSwimLaneColumn({
  column,
  allUnits,
  density,
  activeGeofenceBreachVehicleIds,
  onLoadClick,
  onColumnHeaderClick,
  boardSort,
  onToggleColumnSort,
  width,
  onResize,
  onStatusDrop,
  operatingCompanyId,
}: {
  column: KanbanColumnDef;
  allUnits: UnitRow[];
  density: KanbanDensity;
  activeGeofenceBreachVehicleIds?: Set<string>;
  onLoadClick: (loadId: string) => void;
  onColumnHeaderClick?: (statuses: string[]) => void;
  boardSort?: KanbanColumnSort;
  onToggleColumnSort: (columnKey: string, sortKey: "unit" | "load") => void;
  width?: number;
  onResize?: (columnKey: string, width: number) => void;
  onStatusDrop?: Props["onStatusDrop"];
  /** ALL-SEATS LAW (owner, 2026-09-13): needed so each card's SettlementRefCell can resolve its
   *  load's settlement/tour number. */
  operatingCompanyId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.key}` });
  const sectionRef = useRef<HTMLElement | null>(null);
  // ROUND 203 F18 — unmount mid-drag must remove window listeners (truck-centric lane).
  const resizeListenersRef = useRef<{ move?: (ev: PointerEvent) => void; up?: () => void }>({});
  useEffect(() => {
    return () => {
      const { move, up } = resizeListenersRef.current;
      if (move) window.removeEventListener("pointermove", move);
      if (up) window.removeEventListener("pointerup", up);
      resizeListenersRef.current = {};
    };
  }, []);
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onResize) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = sectionRef.current?.getBoundingClientRect().width ?? width ?? 290;
      const prev = resizeListenersRef.current;
      if (prev.move) window.removeEventListener("pointermove", prev.move);
      if (prev.up) window.removeEventListener("pointerup", prev.up);
      const handleMove = (ev: PointerEvent) => onResize(column.key, startWidth + (ev.clientX - startX));
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        resizeListenersRef.current = {};
      };
      resizeListenersRef.current = { move: handleMove, up: handleUp };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [column.key, onResize, width],
  );
  const [expanded, setExpanded] = useState(false);

  const headerLink =
    onColumnHeaderClick && column.statuses.length > 0 ? (
      <button
        type="button"
        onClick={() => onColumnHeaderClick(column.statuses)}
        className="text-center text-xs font-semibold text-gray-700 hover:text-slate-900 hover:underline"
        data-testid={`kanban-column-header-link-${column.key}`}
        title={`View ${column.title} loads in the list`}
      >
        {column.title}
      </button>
    ) : (
      <h3 className="text-xs font-semibold text-gray-700">{column.title}</h3>
    );

  // Count of cards actually in this column (for the badge)
  const columnCardCount = allUnits.filter((u) => u.columnKey === column.key).length;

  if (column.collapsedByDefault && !expanded) {
    return (
      <section className="kanban-col-collapsed flex-none w-[148px] rounded-sm p-2" style={KANBAN_COLUMN_STYLE} data-testid={`kanban-column-${column.key}`}>
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 pb-1.5 pt-1 text-section-header font-semibold uppercase tracking-[0.4px]" style={KANBAN_HEADER_STYLE}>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            data-testid={`kanban-column-expander-${column.key}`}
            aria-expanded={false}
            title={`Show ${column.title} loads`}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <div className="text-center">{headerLink}</div>
          <span className="justify-self-end rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{columnCardCount}</span>
        </header>
        <KanbanColumnSortControls columnKey={column.key} sort={boardSort} onToggleSort={onToggleColumnSort} />
      </section>
    );
  }

  const detailed = density === "detailed";
  // KANBAN-PROPORTION (Lead, 09-30-2026, owner: "kanban still out of proportion"). Columns carried a
  // min-width and NOTHING else, inside a `flex gap-3 overflow-x-auto` board -- so each column sized
  // itself to its own content and none of them shared the board evenly. A COLLAPSED column was also
  // min-w-[270px], i.e. WIDER than an open standard column at 230px, which is backwards. Expanded
  // columns now take an equal share (flex-1 basis-0) and still honour their per-density minimum, so
  // the board fills at any width and falls back to horizontal scroll only when the minimums no
  // longer fit. Collapsed columns are flex-none at a fixed 148px -- always narrower than open ones.
  const minWidth = (density === "compact" ? "min-w-[200px]" : density === "standard" ? "min-w-[230px]" : "min-w-[290px]") + " flex-1 basis-0";
  const rowMinH = SWIM_LANE_ROW_MIN_HEIGHT[density];
  const rowGap = detailed ? "8px" : "4px";
  // ROUND 20.3 SWIM-LANE BLOAT (owner-live 2026-09-12): SWIM-LANE ROW ALIGNMENT (2026-09-11) renders
  // an empty placeholder for EVERY unit on the whole board (~32) in EVERY column, so a lightly-loaded
  // column (e.g. 6 real cards) still carries ~26 leading/trailing placeholder rows before/after its
  // own cards — measured live: 6 Dispatched cards started at y≈999 with ~800px of empty space above
  // them. Trim the run of placeholders BEFORE the first and AFTER the last real card THIS column
  // owns — interior placeholders between two of this column's own cards are kept, so cross-column row
  // alignment still holds for the units that matter to this column's own visible range. A column with
  // zero real cards renders none (falls through to the existing "(empty)" state below).
  const firstOwnIndex = allUnits.findIndex((unit) => unit.columnKey === column.key);
  const lastOwnIndex = (() => {
    for (let i = allUnits.length - 1; i >= 0; i -= 1) {
      if (allUnits[i]!.columnKey === column.key) return i;
    }
    return -1;
  })();
  const visibleUnits = firstOwnIndex === -1 ? [] : allUnits.slice(firstOwnIndex, lastOwnIndex + 1);

  return (
    <section
      ref={sectionRef}
      className={`relative ${width ? "" : `${minWidth} flex-1`} rounded-sm p-2`}
      style={width ? { ...KANBAN_COLUMN_STYLE, width: `${width}px`, flex: "0 0 auto" } : KANBAN_COLUMN_STYLE}
      data-testid={`kanban-column-${column.key}`}
    >
      <header className="mb-2 px-2 pb-1.5 pt-1 text-section-header font-semibold uppercase tracking-[0.4px]" style={KANBAN_HEADER_STYLE}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {column.collapsedByDefault ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex w-fit items-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              data-testid={`kanban-column-collapser-${column.key}`}
              aria-expanded={true}
              title={`Collapse ${column.title}`}
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center justify-center gap-1 text-center">
            {headerLink}
            {column.derivedOnly ? (
              <span
                className="rounded-sm bg-slate-100 px-1 py-0.5 text-xs font-semibold uppercase text-slate-500"
                data-testid={`kanban-column-auto-badge-${column.key}`}
                title="Only resumed and finished from its own card — not drag-droppable"
              >
                Draft
              </span>
            ) : column.manualStamp ? (
              <span
                className="rounded-sm border border-slate-200 bg-slate-100 px-1 py-0.5 text-xs font-semibold uppercase text-slate-700"
                data-testid={`kanban-column-stamp-badge-${column.key}`}
                title={`Fills automatically from geofence/driver PWA. Dropping a card here records a MANUAL ${column.manualStamp.event === "arrive" ? "arrival" : "departure"} stamp on the ${column.manualStamp.stop} stop — it is stored and shown as Manual, and it never overwrites an existing stamp.`}
              >
                Stamp
              </span>
            ) : null}
          </div>
          <span className="justify-self-end rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{columnCardCount}</span>
        </div>
        <KanbanColumnSortControls columnKey={column.key} sort={boardSort} onToggleSort={onToggleColumnSort} />
      </header>
      <div
        ref={setNodeRef}
        className="max-h-[68vh] min-h-[120px] overflow-y-auto rounded-sm p-1"
        style={{ display: "flex", flexDirection: "column", gap: rowGap, ...(isOver ? { background: "#DCE7F3" } : KANBAN_LANE_BODY_STYLE) }}
        data-testid={`kanban-swim-lane-body-${column.key}`}
        data-c23-drop-target="true"
      >
        {visibleUnits.length === 0 ? (
          <div className="rounded-sm border border-dashed border-gray-300 p-3 text-xs text-gray-500">
            {column.key === "drafts"
              ? "No open drafts."
              : column.manualStamp
                ? `Fills from geofence / driver PWA — or drop a card here to stamp the ${column.manualStamp.stop} ${column.manualStamp.event === "arrive" ? "arrival" : "departure"} manually.`
                : "(empty)"}
          </div>
        ) : null}
        {visibleUnits.map((unit) => {
          if (unit.columnKey !== column.key) {
            // Empty placeholder — same min-height as a card row so the same unit aligns across all lanes
            return (
              <div
                key={`empty:${unit.unitKey}:${column.key}`}
                style={{ minHeight: `${rowMinH}px` }}
                data-testid={`kanban-swim-lane-empty-${column.key}-${unit.unitKey}`}
                data-kanban-swim-lane-row-key={unit.unitKey}
                data-kanban-swim-lane-empty="true"
              />
            );
          }
          const load = unit.load;
          const breach = Boolean(load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id));
          if (column.key === "awaiting_assignment") {
            return (
              <div key={unit.unitKey} style={{ minHeight: `${rowMinH}px` }} data-kanban-swim-lane-row-key={unit.unitKey}>
                <AwaitingTruckCard load={load} onBook={onLoadClick} />
              </div>
            );
          }
          if (density === "compact") {
            return (
              <div key={unit.unitKey} style={{ minHeight: `${rowMinH}px` }} data-kanban-swim-lane-row-key={unit.unitKey}>
                <KanbanCompactCard load={readExtras(load)} hasActiveGeofenceBreach={breach} onClick={onLoadClick} operatingCompanyId={operatingCompanyId} />
              </div>
            );
          }
          if (density === "standard") {
            return (
              <div key={unit.unitKey} style={{ minHeight: `${rowMinH}px` }} data-kanban-swim-lane-row-key={unit.unitKey}>
                <KanbanStandardCard load={readExtras(load)} hasActiveGeofenceBreach={breach} onClick={onLoadClick} onStatusDrop={onStatusDrop} operatingCompanyId={operatingCompanyId} />
              </div>
            );
          }
          return (
            <div key={unit.unitKey} style={{ minHeight: `${rowMinH}px` }} data-kanban-swim-lane-row-key={unit.unitKey}>
              <KanbanDispatchCard load={readExtras(load)} columnKey={column.key} hasActiveGeofenceBreach={breach} onClick={onLoadClick} onStatusDrop={onStatusDrop} operatingCompanyId={operatingCompanyId} />
            </div>
          );
        })}
      </div>
      {onResize ? (
        <div
          role="separator"
          aria-orientation="vertical"
          data-testid={`kanban-column-resize-${column.key}`}
          onPointerDown={onResizePointerDown}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-slate-300"
          title="Drag to resize this lane"
        />
      ) : null}
    </section>
  );
}

type PendingKanbanAssign = {
  unitId: string;
  unitNumber?: string | null;
  loadId: string;
  loadNumber?: string | null;
};

export function DispatchKanban({
  loads,
  awaitingTrucks = [],
  activeGeofenceBreachVehicleIds,
  loading,
  onLoadClick,
  onBookForUnit,
  onStatusDrop,
  onColumnHeaderClick,
  operatingCompanyId,
  listError,
}: Props) {
  const [optimisticLoads, setOptimisticLoads] = useState<DispatchLoadRow[]>(loads);
  // C-23 — Manual stamp drops must keep the card in the stamped lane across loads refetch.
  // invalidateQueries reloads rows that may not yet carry geofence fields; without this overlay
  // the card snaps back to Dispatched and the drag looks dead.
  const [stampOverrides, setStampOverrides] = useState<Record<string, Partial<KanbanLoad>>>({});
  // DISPATCH-UI-REFINE-2 ITEM 1 — default to STANDARD (2-line) density. Compact (1-line) + Detailed
  // (~5-line) remain available via the toggle (additive). Standard balances fleet density vs readability.
  const [density, setDensity] = useState<KanbanDensity>(KANBAN_DEFAULT_DENSITY);
  const [columnSorts, setColumnSorts] = useState<Record<string, KanbanColumnSort>>({});
  // SWIM-LANE ROW ALIGNMENT (owner 2026-09-11): the board-wide sort controls row ORDER across all
  // columns. The per-column sort toggle (KanbanColumnSortControls) updates this single sort — sort
  // changes row ORDER, not the one-row-per-unit rule (the row key is always unit-derived).
  const [boardSort, setBoardSort] = useState<KanbanColumnSort | undefined>(undefined);
  // DSP-12 (owner 2026-09-04): per-lane widths, persisted so the dispatcher's board layout survives a
  // reload. Clamped 180–560px so a lane can't be dragged to zero or off the board.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("ih35.kanban.columnWidths");
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const setColumnWidth = useCallback((columnKey: string, next: number) => {
    setColumnWidths((prev) => {
      const clamped = Math.max(180, Math.min(560, Math.round(next)));
      const merged = { ...prev, [columnKey]: clamped };
      try {
        localStorage.setItem("ih35.kanban.columnWidths", JSON.stringify(merged));
      } catch {
        /* localStorage unavailable (private mode) — width stays in-session only */
      }
      return merged;
    });
  }, []);
  const [pendingAssign, setPendingAssign] = useState<PendingKanbanAssign | null>(null);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: ({ loadId, unitId }: { loadId: string; unitId: string }) =>
      patchAssignUnit(loadId, { operating_company_id: operatingCompanyId ?? "", unit_uuid: unitId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      const loadNumber = pendingAssign?.loadNumber || variables.loadId;
      const unitNumber = pendingAssign?.unitNumber || variables.unitId;
      pushToast(`Assigned unit ${unitNumber} to load ${loadNumber}.`, "success");
      setPendingAssign(null);
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Could not assign unit to load"), "error");
      // Leave the modal open so the dispatcher can retry or cancel explicitly.
    },
  });

  const toggleKanbanColumnSort = (columnKey: string, sortKey: "unit" | "load") => {
    // SWIM-LANE: board columns share a single board-wide sort (row order). The OOS strip keeps its own.
    if (columnKey === "oos_strip") {
      setColumnSorts((current) => {
        const prior = current[columnKey] ?? { key: sortKey, direction: "asc" as const };
        return {
          ...current,
          [columnKey]: {
            key: sortKey,
            direction: prior.key === sortKey && prior.direction === "asc" ? "desc" : "asc",
          },
        };
      });
      return;
    }
    setBoardSort((prior) => ({
      key: sortKey,
      direction: prior?.key === sortKey && prior?.direction === "asc" ? "desc" : "asc",
    }));
  };

  useEffect(() => {
    setOptimisticLoads(loads);
  }, [loads]);

  useEffect(() => {
    setStampOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        const serverLoad = loads.find((row) => row.id === id);
        if (!serverLoad) {
          delete next[id];
          changed = true;
          continue;
        }
        const withOverride = { ...serverLoad, ...next[id] } as DispatchLoadRow;
        if (resolveKanbanColumnKey(serverLoad) === resolveKanbanColumnKey(withOverride)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loads]);

  const boardLoads = useMemo(
    () =>
      optimisticLoads.map((row) =>
        stampOverrides[row.id] ? ({ ...row, ...stampOverrides[row.id] } as DispatchLoadRow) : row,
      ),
    [optimisticLoads, stampOverrides],
  );

  const grouped = useMemo(() => groupLoadsByColumn(boardLoads), [boardLoads]);
  // KANBAN-DUP-UNIT-2 (owner correction 2026-09-11, verbatim: "the Awaiting-Assignment lane renders
  // a SEPARATE source ... Reconcile the two"). dedupeLoadsByUnit() only ever collapsed duplicates
  // WITHIN the `loads` array (PR #21729's own scope). It never reconciled against `awaitingTrucks` --
  // a SEPARATE backend query (listUnitsWithoutLoad) whose own "no active load" definition only
  // excludes assigned_not_dispatched/dispatched/in_transit. A unit whose only load is e.g.
  // delivered_pending_docs is correctly OUTSIDE that exclusion (truly not "on an active load" by
  // that query's own contract) AND still wins a real Kanban card via dedupeLoadsByUnit -- so it
  // rendered TWICE: once as its real card, once again as a synthetic Awaiting-Assignment card. One
  // unit, one card, regardless of which source found it first.
  const dedupedUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of grouped.values()) {
      for (const load of list) {
        if (load.assigned_unit_id) ids.add(load.assigned_unit_id);
      }
    }
    return ids;
  }, [grouped]);
  // Lane 1 cards = trucks-without-a-load (roster minus loaded), one compact card per truck --
  // minus any unit that already won a real card on the loads side (see dedupedUnitIds above).
  const awaitingTruckCards = useMemo(
    () => awaitingTrucks.filter((unit) => !dedupedUnitIds.has(unit.id)).map(truckToKanbanLoad),
    [awaitingTrucks, dedupedUnitIds]
  );
  // SWIM-LANE ROW ALIGNMENT (owner 2026-09-11): compute ALL units once across the whole board
  // (loads + awaiting trucks), then sort by the board-wide sort. Each column renders ALL rows;
  // a unit's card appears in its lane, every other lane has an empty placeholder at that row's height.
  const allUnits = useMemo(
    () => sortAllUnits(computeAllUnits(boardLoads, awaitingTruckCards), boardSort),
    [boardLoads, awaitingTruckCards, boardSort],
  );
  // Fleet out-of-service strip (Part D). No fleet-OOS feed reaches this board yet, so we
  // surface breakdown loads best-effort and flag that the full OOS feed is held — same gate
  // as HOS/geofence. Once Jorge wires the OOS source this strip lists every down unit.
  const outOfServiceLoads = useMemo(() => boardLoads.filter(isBreakdown), [boardLoads]);
  const sortedOutOfServiceLoads = useMemo(
    () => sortKanbanColumnLoads(outOfServiceLoads, columnSorts.oos_strip ?? { key: "unit", direction: "asc" }),
    [outOfServiceLoads, columnSorts.oos_strip],
  );

  // KANBAN-CLICK-DEAD (owner-live). Every card is a `useDraggable`, and dnd-kit's DEFAULT PointerSensor has
  // NO activation constraint: pointerdown starts a drag immediately and preventDefaults, so the browser never
  // dispatches the follow-up `click`. The cards' onClick therefore never fired and clicking a load did
  // nothing — while DRAGGING worked perfectly, which is exactly the asymmetry the owner reported.
  // A distance constraint makes a stationary press stay a click and anything past 8px become a drag.
  // KeyboardSensor is kept so the board stays operable without a pointer.
  // ROUND 20.3 DRAG ACTIVATION (owner-live 2026-09-12): distance:8 combined with the missing
  // touch-action fixed above still left a real mouse press racing the browser's native
  // selection/scroll gesture for slightly longer than it needed to — lowering the distance to 4 (and
  // adding tolerance so a slightly wobbly real-world press still counts) means a genuine drag crosses
  // the activation threshold before that native gesture has a chance to start. delay:0 keeps clicks
  // (which rely on distance, not time) working exactly as KANBAN-CLICK-DEAD fixed them.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4, tolerance: 5, delay: 0 } }),
    useSensor(KeyboardSensor)
  );

  // ROUND 20.3 DRAG ACTIVATION (owner-live 2026-09-12): once a real drag activates, the browser's
  // native text-selection can still highlight page text as the pointer moves (touch-action:none on
  // the card only stops the browser from starting its OWN gesture on that node — it does not stop an
  // in-progress OS selection drag from a press that started a hair before activation). Force
  // user-select:none on <body> for the duration of a drag; always clear it in BOTH the success path
  // (onDragEnd, via handleDragEnd's own return paths below) and the cancel path (onDragCancel) so a
  // drag that never resolves (Escape, drop outside the window) can never leave the page permanently
  // unselectable.
  const handleDragStart = () => {
    document.body.style.userSelect = "none";
  };
  const clearDragUserSelect = () => {
    document.body.style.userSelect = "";
  };
  // LV-KANBAN-DROP-OUTSIDE-DROPPABLE-IS-SILENT's sibling case: a CANCELLED drag (Escape key, or the
  // pointer leaving the window) fires neither onDragEnd's over-is-null branch nor any toast at all —
  // from the dispatcher's seat this is indistinguishable from "nothing happened," which is exactly
  // the missed-drop confusion that toast was built to close. Same neutral tone, same message.
  const handleDragCancel = (_event: DragCancelEvent) => {
    clearDragUserSelect();
    pushToast("Drop the card onto a lane to change its status.", "info");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    clearDragUserSelect();
    const activeId = event.active.id;
    const overId = event.over?.id;
    const activeData = (event.active.data.current ?? {}) as { type?: string; unitId?: string; unitNumber?: string | null };
    const overData = (event.over?.data.current ?? {}) as { type?: string; loadId?: string };

    // BRD-12: dragging a truck card (unit) onto a load card assigns the unit to that load.
    // This is intentionally surfaced as a confirmation modal — no silent reassignment on a stray drag.
    if (activeData.type === "unit") {
      if (overData.type === "load" && activeData.unitId && overData.loadId) {
        const load = optimisticLoads.find((item) => item.id === overData.loadId);
        if (load) {
          setPendingAssign({
            unitId: activeData.unitId,
            unitNumber: activeData.unitNumber,
            loadId: load.id,
            loadNumber: load.load_number,
          });
          return;
        }
      }
      pushToast("Drop the truck onto a load card to assign it.", "info");
      return;
    }

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
    // REG-018 (owner-live): dnd-kit's pointerWithin collision detection resolves the DEEPEST
    // droppable under the pointer. Every card registers itself as a droppable (droppable:load:<id>)
    // INSIDE the column droppable (column:<key>). When a card is dropped onto a lane that already
    // has cards, event.over resolves to the CARD, not the column. The old code only stripped
    // "column:" and then failed to find the target group — showing "Could not move that card"
    // and reverting. To the dispatcher the drag "did not work" on any non-empty lane, which is
    // exactly what the owner reported. Resolve the target column from the load the card was
    // dropped onto: that load IS in the target column.
    const overIdStr = String(overId);
    let targetColumnKey = overIdStr.replace("column:", "");
    if (overIdStr.startsWith("droppable:load:")) {
      const overLoadId = overData.loadId ?? overIdStr.replace("droppable:load:", "");
      const overLoad = optimisticLoads.find((item) => item.id === overLoadId);
      if (overLoad) {
        targetColumnKey = resolveKanbanColumnKey(overLoad);
      }
    }
    const targetGroup = KANBAN_STATUS_GROUPS.find((group) => group.key === targetColumnKey);
    const load = optimisticLoads.find((item) => item.id === loadId);
    if (!load && isSyntheticKanbanCardId(loadId)) {
      // Truck card: not a load, nothing to transition. Now handled by the BRD-12 unit-drop branch above.
      pushToast("That is a truck without a load — book it to a load first.", "info");
      return;
    }
    if (!targetGroup || !load) {
      // Not the synthetic case — an unknown column or a load id the board is rendering but does not hold.
      // That is a bug state, not a user action, so it must not vanish silently.
      pushToast("Could not move that card — the board could not identify it. Refresh and try again.", "error");
      return;
    }
    if (targetGroup.manualStamp) {
      // KANBAN-DRAG-UNBLOCK — these three lanes are STOP EVENTS, not status changes. Write the
      // real stamp on the real route (the one Truck Line already uses), recorded as Manual.
      const { stop: stopRole, event } = targetGroup.manualStamp;
      if (!operatingCompanyId) {
        pushToast("No operating company in scope — refresh the board and try again.", "error");
        return;
      }
      try {
        // The stop id is not on the board's own row model, so it is read from the load's own
        // stops record rather than guessed. Pickup = the FIRST pickup-type stop by sequence,
        // delivery = the LAST delivery-type stop by sequence, matching how the Stops record
        // itself orders them. A multi-stop load therefore stamps its real first/last stop, never
        // stop[0]/stop[n] by array position.
        const record = await getLoadStopsRecord(loadId, operatingCompanyId);
        const ordered = [...record.stops].sort((a, b) => a.sequence - b.sequence);
        const isPickup = (t: string) => /pick|origin|shipper/i.test(t);
        const isDelivery = (t: string) => /deliv|dest|consignee|receiver|drop/i.test(t);
        const candidates = ordered.filter((st) => (stopRole === "pickup" ? isPickup(st.stop_type) : isDelivery(st.stop_type)));
        const target = stopRole === "pickup" ? candidates[0] : candidates[candidates.length - 1];
        if (!target) {
          // EMPTY IS A QUESTION: say which stop is missing, never a generic failure.
          pushToast(
            `Load ${load.load_number} has no ${stopRole} stop on its stops record, so there is nothing to stamp. Add the stop in the Book Load wizard first.`,
            "error"
          );
          return;
        }
        // Never overwrite a stamp that already exists — a second stamp would silently move the
        // recorded time and, through it, dwell and detention. Say it is already stamped instead.
        const existing = event === "arrive" ? target.arrived_at : target.departed_at;
        if (existing) {
          pushToast(
            `Load ${load.load_number} already has a ${event === "arrive" ? "arrival" : "departure"} stamp on its ${stopRole} stop (source: ${target.source}). It was not overwritten.`,
            "info"
          );
          return;
        }
        if (event === "depart" && !target.arrived_at) {
          // Ordering is real: a truck cannot leave a stop it never reached.
          pushToast(
            `Load ${load.load_number} has no arrival on its ${stopRole} stop yet — drop it on "At pickup" first, then on "Loaded".`,
            "error"
          );
          return;
        }
        if (event === "arrive") await stampTruckLineArrival(loadId, target.stop_id, operatingCompanyId);
        else await stampTruckLineDeparture(loadId, target.stop_id, operatingCompanyId);
        // C-23 — stamp alone left the card in Dispatched; overlay geofence fields so the board
        // column key moves with the operator's drop (Manual provenance already recorded server-side).
        // stampOverrides survive loads refetch until the server row already resolves to the same lane.
        const optimisticPatch = optimisticGeofenceAfterManualStamp({ stop: stopRole, event });
        if (Object.keys(optimisticPatch).length > 0) {
          setStampOverrides((prev) => ({ ...prev, [loadId]: optimisticPatch }));
          setOptimisticLoads((current) =>
            current.map((item) => (item.id === loadId ? { ...item, ...optimisticPatch } : item)),
          );
        }
        pushToast(`Load ${load.load_number} moved to ${targetGroup.title} — stamped manually (recorded as Manual).`, "success");
        // Same key the assign mutation already invalidates — one refresh contract on this board.
        await queryClient.invalidateQueries({ queryKey: ["loads"] });
      } catch (error) {
        const reason = userFacingApiError(error, "the server rejected it and gave no reason").trim();
        pushToast(`Can't move ${load.load_number} to ${targetGroup.title} — ${reason}`, "error");
      }
      return;
    }
    if (targetGroup.derivedOnly) {
      // FAIL-K1 + KANBAN-CROSS-COLUMN-DRAG: refuse the write rather than perform a misleading one.
      // Loaded is set by pickup-departure telematics; At pickup / At delivery are set by geofence
      // dwell or driver PWA stop arrivals. All three map to the same dispatch state as their parent
      // (dispatched or in_transit), so a drop always produces a same-state transition the backend
      // rejects as invalid_transition. ROUND 24.3: Drafts is the same refuse-the-drop shape for a
      // different reason — a draft is only ever created by "Save draft" and only ever finished by
      // resuming it in the wizard; dragging a real load backward INTO Drafts would misrepresent an
      // already-booked load as unfinished, and dragging a draft OUT would skip its own completion
      // stamp (is_quicksave_draft/quicksave_completed_at, see update-load.service.ts). Refuse with a
      // clear explanation instead.
      pushToast(
        targetGroup.key === "drafts"
          ? "Drafts can't be moved by dragging — open the card to resume it in the Book Load wizard."
          : `${targetGroup.title} is set by telematics (geofence/driver PWA), not by dragging. Move the load to ${targetGroup.key === "at_pickup" ? "Dispatched or In transit" : targetGroup.key === "at_delivery" ? "In transit or Delivered" : "In transit"} instead.`,
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
      const mint = (dropResult as { driver_bill_mint?: { outcome?: string; missing?: string[]; unpriced?: boolean; reason?: string } } | null)?.driver_bill_mint;
      if (mint?.outcome === "skipped_no_pay_rate" || (mint?.outcome === "minted" && mint.unpriced)) {
        const missing =
          Array.isArray(mint.missing) && mint.missing.length > 0 ? mint.missing.join(", ") : "pay inputs";
        pushToast(
          `Tracking driver bill for ${load.load_number} is $0 — missing ${missing}. Seed miles/rate and remint (never invent from customer rate).`,
          "info"
        );
      } else if (mint?.outcome === "refused_no_shortest_miles") {
        // P1 (owner 2026-09-14) — "Refuse LOUDLY with the reason on screen." No bill at all here,
        // distinct from the info-level $0-tracking-bill toast above.
        pushToast(mint.reason ?? `No driver bill was created for ${load.load_number} — shortest miles are required.`, "error");
      }
    } catch (error) {
      setOptimisticLoads(previousLoads);
      // KANBAN-REVERSE-NOMOVE (owner-live): forward moves worked, backward ones "did not move". They were
      // being REJECTED by the server, but this catch discarded the error and printed a generic sentence, so
      // the dispatcher was told the move failed and never WHY — indistinguishable from a dead board.
      // DISPATCH-3 (owner order 2026-09-05): route through userFacingApiError so an illegal transition
      // (draft/unassigned → dispatched, load 13508) reads as the plain-English reason + corrective
      // action instead of the bare "invalid_transition" code the transition route returns.
      const reason = userFacingApiError(error, "the server rejected it and gave no reason").trim();
      pushToast(`Can't move ${load.load_number} to ${targetGroup.title} — ${reason} Reverted.`, "error");
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
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">Loading dispatch board...</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="relative" data-testid="dispatch-kanban-board">
        <ConfirmModal
          open={Boolean(pendingAssign)}
          title="Assign unit to load"
          message={
            pendingAssign
              ? `Assign unit ${pendingAssign.unitNumber || pendingAssign.unitId} to load ${pendingAssign.loadNumber || pendingAssign.loadId}?`
              : ""
          }
          confirmLabel="Assign"
          onClose={() => setPendingAssign(null)}
          onConfirm={async () => {
            if (!pendingAssign) return;
            await assignMutation.mutateAsync({ loadId: pendingAssign.loadId, unitId: pendingAssign.unitId });
          }}
        />
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

        <div className="flex gap-3 overflow-x-auto pb-2" data-testid="kanban-swim-lane-board">
          {KANBAN_STATUS_GROUPS.map((group) => {
            return (
              <KanbanSwimLaneColumn
                key={group.key}
                column={group}
                allUnits={allUnits}
                density={density}
                activeGeofenceBreachVehicleIds={activeGeofenceBreachVehicleIds}
                onLoadClick={
                  group.key === "awaiting_assignment" && onBookForUnit
                    ? (cardId) => onBookForUnit(cardId.replace(/^unit:/, ""))
                    : onLoadClick
                }
                onColumnHeaderClick={onColumnHeaderClick}
                boardSort={boardSort}
                onToggleColumnSort={toggleKanbanColumnSort}
                width={columnWidths[group.key]}
                onResize={setColumnWidth}
                onStatusDrop={onStatusDrop}
                operatingCompanyId={operatingCompanyId}
              />
            );
          })}
        </div>

        {/* Part D — Fleet out-of-service strip, pinned at the bottom of the board. */}
        <section
          className="sticky bottom-0 mt-2 rounded-sm border border-slate-200 bg-slate-100 p-2"
          data-testid="dispatch-kanban-oos-strip"
        >
          <header className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Fleet out of service</h3>
              <KanbanColumnSortControls
                columnKey="oos_strip"
                sort={columnSorts.oos_strip ?? { key: "unit", direction: "asc" }}
                onToggleSort={toggleKanbanColumnSort}
              />
            </div>
            <span className="rounded-sm bg-white px-2 py-0.5 text-xs font-bold text-slate-700">{outOfServiceLoads.length}</span>
          </header>
          {outOfServiceLoads.length === 0 ? (
            <p className="mt-1 text-[11px] italic text-slate-700">
              Full fleet out-of-service feed pending — no units flagged.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {sortedOutOfServiceLoads.map((load) => (
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
                      <span className="text-gray-400" aria-label="No unit or driver assigned">—</span>
                    ) : null}
                  </span>
                  <EntityLinkOrTombstone
                    kind="load"
                    id={load.id}
                    name={load.load_number}
                    noun="Load"
                    className="font-mono text-xs text-gray-500"
                    data-testid="kanban-oos-load-link"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="rounded-sm bg-red-100 px-1.5 text-xs font-semibold text-red-800">Breakdown</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DndContext>
  );
}
