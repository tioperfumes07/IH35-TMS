/**
 * TRUCK LINE — pure station-derivation function (owner ruling 2026-09-11, Lead assignment).
 *
 * DESIGN CONTRACT (docs/design/DESIGN-CONTRACT-DISPATCH-LINE-BOARD-2026-09-11.md +
 * docs/design/reference/DISPATCH-LINE-BOARD-REFERENCE-2026-09-11.html) — 9 stations, left to right:
 *   0 Assigned · 1 Dispatched · 2 At pickup · 3 In transit · 4 Other (overlay, not a progression
 *   station) · 5 At delivery · 6 Delivered · 7 Docs received · 8 Invoiced.
 *
 * Station reached is derived ONLY from mdata.loads.status + mdata.load_stops arrival/departure
 * stamps + dispatch.pod_documents existence + an accounting.invoices existence flag — NEVER a
 * separately stored "station" column (there isn't one, and the guard `verify-dispatch-truck-
 * line.mjs` asserts this file never writes to mdata.loads.status). This is the ONLY function that
 * decides node color/position; the frontend and the backend read model both call it, so they can
 * never disagree.
 */

export const STATION_COUNT = 9;
export const STATION_KEYS = [
  "assigned",
  "dispatched",
  "at_pickup",
  "in_transit",
  "other",
  "at_delivery",
  "delivered",
  "docs_received",
  "invoiced",
] as const;
export type StationKey = (typeof STATION_KEYS)[number];

export const STATION_LABELS: Record<StationKey, string> = {
  assigned: "Assigned",
  dispatched: "Dispatched",
  at_pickup: "At pickup",
  in_transit: "In transit",
  other: "Other",
  at_delivery: "At delivery",
  delivered: "Delivered",
  docs_received: "Docs received",
  invoiced: "Invoiced",
};

/** Raw mdata.load_status_enum members meaning the load has not yet been dispatched (station 1 not reached). */
const NOT_YET_DISPATCHED_STATUSES = new Set(["draft", "booked", "planned", "unassigned", "assigned", "assigned_not_dispatched"]);
/** Raw statuses meaning the load's lifecycle is fully closed and its row should return to "Awaiting" on the board. */
export const TERMINAL_STATUSES = new Set(["invoiced", "paid", "closed", "cancelled", "abandoned", "driver_walkoff", "driver_no_show"]);

export type StampSource = "dispatcher_truck_line" | "driver_app" | "eld_geofence" | "manual" | null;
export type Stamp = { at: string; source: StampSource } | null;

export type StationInput = {
  /** raw mdata.loads.status (any of the 20 live enum members), not the translated DispatchStatus. */
  rawStatus: string;
  dispatchedAt: string | null;
  pickupArrivalAt: string | null;
  pickupArrivalSource: StampSource;
  pickupDepartureAt: string | null;
  pickupDepartureSource: StampSource;
  deliveryArrivalAt: string | null;
  deliveryArrivalSource: StampSource;
  deliveryDepartureAt: string | null;
  deliveryDepartureSource: StampSource;
  /** true when dispatch.pod_documents has a non-archived row for the delivery stop. */
  hasDeliveryPod: boolean;
  /** true when accounting.invoices has a non-voided row for this load. */
  hasInvoice: boolean;
  invoiceDisplayId: string | null;
  /** open (status IN ('open','acknowledged')) dispatch.intransit_issues row, if any. */
  openException: { reasonLabel: string; startedAt: string } | null;
  /** extra stop nodes beyond the first pickup/last delivery — multi-stop loads (design contract rule 5). */
  extraStops?: { label: string; arrivedAt: string | null }[];
};

export type StationResult = {
  /** index of the furthest-reached station, 0-8 (Other excluded from progression — see hasOpenException). */
  reachedIndex: number;
  /** the only clickable-to-advance station, or null once Invoiced (terminal, read-only). */
  nextIndex: number | null;
  stamps: (Stamp | null)[]; // length STATION_COUNT, index-aligned with STATION_KEYS
  hasOpenException: boolean;
  exceptionReasonLabel: string | null;
  extraStopNodes: { label: string; reached: boolean; at: string | null }[];
};

function stamp(at: string | null, source: StampSource): Stamp {
  return at ? { at, source } : null;
}

/**
 * Pure. No I/O. Deterministic given the same input — this is what the guard's --selftest exercises
 * across all 9 live states plus multi-stop, and what the frontend's own unit test (if any) can call
 * identically to the backend, so the two can never render a different station than the API reports.
 */
export function deriveTruckLineStation(input: StationInput): StationResult {
  const dispatchedOrLater = !NOT_YET_DISPATCHED_STATUSES.has(input.rawStatus);
  const atPickupReached = input.pickupArrivalAt != null;
  const inTransitReached = input.pickupDepartureAt != null || ["in_transit", "at_delivery", "delivered", "delivered_pending_docs", "invoiced", "paid", "closed", "completed_docs_received"].includes(input.rawStatus);
  const atDeliveryReached = input.deliveryArrivalAt != null;
  const deliveredReached = input.deliveryDepartureAt != null || ["delivered", "delivered_pending_docs", "invoiced", "paid", "closed", "completed_docs_received"].includes(input.rawStatus);
  const docsReceivedReached = input.hasDeliveryPod || ["completed_docs_received", "invoiced", "paid", "closed"].includes(input.rawStatus);
  const invoicedReached = input.hasInvoice || ["invoiced", "paid", "closed"].includes(input.rawStatus);

  const reachedFlags = [
    true, // Assigned — this function is only ever called for a load that already has a unit/driver assignment
    dispatchedOrLater,
    atPickupReached,
    inTransitReached,
    false, // Other is never part of forward progression
    atDeliveryReached,
    deliveredReached,
    docsReceivedReached,
    invoicedReached,
  ];

  // Furthest CONTIGUOUS reached index from 0 — a later flag can't be true while an earlier one is
  // false in honest data, but derive defensively (min of the reached run) rather than trust ordering.
  let reachedIndex = 0;
  for (let i = 0; i < STATION_COUNT; i++) {
    if (i === 4) continue; // Other — skip, not a progression index
    if (reachedFlags[i]) reachedIndex = i;
    else break;
  }

  const nextIndex = reachedIndex >= 8 ? null : reachedIndex + 1 === 4 ? 5 : reachedIndex + 1;

  const stamps: (Stamp | null)[] = new Array(STATION_COUNT).fill(null);
  stamps[1] = stamp(input.dispatchedAt, "manual");
  stamps[2] = stamp(input.pickupArrivalAt, input.pickupArrivalSource);
  stamps[3] = stamp(input.pickupDepartureAt, input.pickupDepartureSource);
  stamps[5] = stamp(input.deliveryArrivalAt, input.deliveryArrivalSource);
  stamps[6] = stamp(input.deliveryDepartureAt, input.deliveryDepartureSource);
  stamps[8] = input.hasInvoice && input.invoiceDisplayId ? { at: input.invoiceDisplayId, source: null } : null;

  const extraStopNodes = (input.extraStops ?? []).map((s) => ({
    label: s.label,
    reached: s.arrivedAt != null,
    at: s.arrivedAt,
  }));

  return {
    reachedIndex,
    nextIndex,
    stamps,
    hasOpenException: input.openException != null,
    exceptionReasonLabel: input.openException?.reasonLabel ?? null,
    extraStopNodes,
  };
}
