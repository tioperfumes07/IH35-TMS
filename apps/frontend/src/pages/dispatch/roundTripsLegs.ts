import type { DispatchLoadRow } from "../../api/loads";

export type TripKind = "NB" | "TR" | "SB";

export const RT_KANBAN_CARD_CLASS =
  "relative cursor-pointer rounded border border-gray-200 bg-white p-3 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-sm";

export const RT_KANBAN_COL_MIN = {
  compact: "min-w-[200px]",
  standard: "min-w-[230px]",
  comfortable: "min-w-[290px]",
} as const;

/** Pairing order only — not city geography. Untyped: first=NB, last=SB, middle=TR. */
export function resolvedTripType(load: DispatchLoadRow, index: number, unitLoadsChrono: DispatchLoadRow[]): TripKind {
  if (load.trip_type === "NB" || load.trip_type === "TR" || load.trip_type === "SB") return load.trip_type;
  if (unitLoadsChrono.length === 1) return "NB";
  if (index === 0) return "NB";
  if (index === unitLoadsChrono.length - 1) return "SB";
  return "TR";
}

export function orderedLegsForUnit(unitLoads: DispatchLoadRow[]): DispatchLoadRow[] {
  const chrono = [...unitLoads].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const tagged = chrono.map((load, i) => ({ load, kind: resolvedTripType(load, i, chrono) }));
  const nb = tagged.filter((x) => x.kind === "NB").map((x) => x.load);
  const tr = tagged.filter((x) => x.kind === "TR").map((x) => x.load);
  const sb = tagged.filter((x) => x.kind === "SB").map((x) => x.load);
  return [...nb, ...tr, ...sb];
}

/** Must match trip-pairing-board.service.ts ACTIVE_LOAD_STATUSES — one pairing engine. */
export const RT_PAIRING_ACTIVE_STATUSES = [
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const;

/**
 * RT-TIMELINE-LIFECYCLE (owner ruling 2026-09-09, "all units with loads Aug-25→present must appear
 * on the timeline"): the Round Trips TIMELINE is a read-only picture of every unit that did real
 * work in the visible window — NOT the live pairing engine. RT_PAIRING_ACTIVE_STATUSES stays locked
 * to trip-pairing-board.service.ts's 6-status set (one pairing engine, never widened here); the
 * timeline is DELIBERATELY broader — it also paints a unit whose leg has already delivered or is in
 * the factoring/billing tail (delivered … paid), the exact statuses the LOADBOARD-LIFECYCLE ruling
 * keeps on the live board. Without these a truck whose only visible load already delivered silently
 * dropped off the timeline (the "missing units" the owner measured). Closed/cancelled/abandoned/
 * driver-walkoff/no-show and draft are still excluded — a dead row is never painted as an active unit.
 */
export const RT_TIMELINE_STATUSES = [
  "booked",
  "planned",
  "unassigned",
  ...RT_PAIRING_ACTIVE_STATUSES,
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
] as const;

export function pairOutboundReturn(unitLoads: DispatchLoadRow[]): {
  outbound: DispatchLoadRow | null;
  returnLoad: DispatchLoadRow | null;
} {
  const chrono = [...unitLoads].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const legs = orderedLegsForUnit(unitLoads);
  const kindOf = (load: DispatchLoadRow) => resolvedTripType(load, chrono.indexOf(load), chrono);
  const outbound = legs.find((load) => kindOf(load) === "NB") ?? null;
  const returnLoad =
    [...legs].reverse().find((load) => kindOf(load) === "SB" && load.id !== outbound?.id) ?? null;
  return { outbound, returnLoad };
}

/**
 * Moved out of RoundTrips.tsx (owner order 2026-09-08, Load Costs board "Return Booked" column)
 * so a second surface computing the same "does this unit still need a return trip" question reads
 * the ONE definition instead of a local copy that could silently drift out of sync with this one.
 * An outbound leg still counts as "needs return" only while it's in an active dispatch status --
 * a delivered-with-no-return-booked outbound is surfaced separately (see
 * apps/frontend/src/api/dispatch.ts's listUnitsWithoutLoad / hours_since_last_delivery), not by this set.
 */
export const NEEDS_RETURN_STATUSES = new Set(["dispatched", "at_pickup", "in_transit", "at_delivery"]);

/**
 * RT-FIX (owner 2026-09-05 02:15Z): a Round Trips bar spans the actual work window —
 * first pickup appointment → last delivery appointment. `created_at` (when the row was keyed)
 * NEVER positions a bar; that is what stacked every bar on "today", one day wide. A load with no
 * pickup date returns null (the timeline draws an honest "no dates" marker, not a bar on today).
 *
 * On the list row, `pickup_appointment_start_at` is the seq-1 stop's appointment_start_at /
 * scheduled_arrival_at surfaced by the API; `pickup_scheduled_at` is the fallback pickup date.
 */
export function loadSpanStartMs(load: DispatchLoadRow): number | null {
  const raw = load.pickup_appointment_start_at || load.pickup_scheduled_at || null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

export function loadSpanEndMs(load: DispatchLoadRow): number | null {
  const raw =
    load.delivery_appointment_start_at ||
    load.effective_delivery_date ||
    load.scheduled_delivery_date ||
    load.delivery_scheduled_at ||
    null;
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  const start = loadSpanStartMs(load);
  // A delivery that parses before the pickup is bad data, not a reason to fall back to the row's key
  // date — clamp the end to the pickup so the bar is a minimum-width mark on the pickup day.
  if (start != null && t < start) return start;
  return t;
}

/** A load can be positioned on the timeline only when it has both a pickup and a delivery date. */
export function hasSpanDates(load: DispatchLoadRow): boolean {
  return loadSpanStartMs(load) != null && loadSpanEndMs(load) != null;
}
