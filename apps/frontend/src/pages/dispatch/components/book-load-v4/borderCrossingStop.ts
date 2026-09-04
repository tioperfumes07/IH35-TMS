// Border-crossing capture for Book Load.
//
// Defect (owner block 2026-09-04): Book Load let a Mexico-bound (northbound/southbound) load save
// with NO border crossing, so LoadDetailDrawer.loadHasCrossBorder() — which shows the Customs tab
// only when a stop is stop_type='border' or carries a non-US country — correctly hid the tab on
// load 13508. The fix is to CAPTURE the crossing in the wizard so a stop_type='border' row exists;
// never to weaken the predicate.
//
// NB (Northbound) and SB (Southbound) trips touch the border; TR (Triangulation) is US-interior →
// US-interior and does not cross. So the crossing is required for NB/SB only.

export const CROSS_BORDER_TRIP_TYPES = ["NB", "SB"] as const;

export function isCrossBorderTripType(tripType: string | null | undefined): boolean {
  const t = String(tripType ?? "").trim().toUpperCase();
  return t === "NB" || t === "SB";
}

export type BorderCrossingPort = {
  id: string;
  name: string;
  short_name?: string | null;
  country: string;
  cbp_port_code?: string | null;
};

/** Minimal shape the Book Load submit mapping reads off each stop. */
export type BorderCrossingStopSeed = {
  stop_type: "border";
  city: string;
  state: string;
  country: string;
  stop_notes: string;
};

/**
 * Build the crossing stop from a selected port of entry. City carries the port name so the stop is
 * readable on the load; country carries the port's side (US/MX) — either way stop_type='border' is
 * what makes loadHasCrossBorder() true.
 */
export function buildBorderCrossingStop(port: BorderCrossingPort): BorderCrossingStopSeed {
  const label = (port.short_name && port.short_name.trim()) || port.name;
  return {
    stop_type: "border",
    city: label,
    state: "",
    country: port.country,
    stop_notes: `Border crossing — ${port.name}${port.cbp_port_code ? ` (CBP ${port.cbp_port_code})` : ""}`,
  };
}

/**
 * Insert the border crossing stop into a stop list immediately BEFORE the first delivery (the
 * freight crosses the border before it is delivered). If there is no delivery it is appended.
 * Pure — returns a new array; caller renumbers sequence_number when mapping to the payload.
 */
export function withBorderCrossingStop<T extends { stop_type: string }>(stops: T[], borderStop: T): T[] {
  const firstDeliveryIndex = stops.findIndex((s) => s.stop_type === "delivery");
  if (firstDeliveryIndex < 0) return [...stops, borderStop];
  return [...stops.slice(0, firstDeliveryIndex), borderStop, ...stops.slice(firstDeliveryIndex)];
}
