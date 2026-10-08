/**
 * TRUCK LINE — 5th Dispatch board view (owner ruling 2026-09-11, Lead assignment).
 *
 * V7/V8 (ROUND 18.5, 2026-09-11 ~20:55/21:05 CT — owner, looking at a render built from LIVE
 * USMCA prod): "yes this one is perfect" + "we are also missing the next appointment column" +
 * "in other we can select breakdown, late, etc. if there are no issues, we can change to on time,
 * etc." This is the current, locked shape of the board — it supersedes the earlier V4 4-column /
 * 9-station layout entirely.
 *
 * ROUND 255 COLUMNS (owner ordered): UNIT · PRE-SETTLEMENT / TOUR · LOAD · PU DATE ·
 * DELIVERY DATE · [TRANSIT LINE]. Transit begins under LOAD. Return trips render TWO rows.
 * Status dropdown in-place. Universal combo filter. Canonical active-load set only.
 *
 * THE LINE is 7 stations: Dispatched · At pickup · Loaded · In transit · [status] · At delivery ·
 * Delivered. station.ts (backend) still owns the ONLY pure derivation of progress — it was NOT
 * changed for this view, and it still exposes its own 9-index model (assigned/dispatched/
 * at_pickup/in_transit/other/at_delivery/delivered/docs_received/invoiced) because OTHER surfaces
 * (guard (b)/(h), its own unit tests) depend on that shape. V7_STATIONS below is a DOCUMENTED,
 * honest FRONTEND-ONLY regrouping of that same 9-index signal into the 7 labels the owner asked
 * for — never a second source of truth.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Combobox } from "../../components/Combobox";
import { transitionDispatchLoad } from "../../api/dispatch";
import type { DispatchStatus } from "../../api/dispatch";
import { formatMoneyCents } from "../../components/dispatch/constants";
import { EntityLink } from "../../components/shared/EntityLink";
import { LOCKED_BORDER, LOCKED_TEXT_SECONDARY } from "../../design/locked-baseline-tokens";
import { useLoadCostRollups } from "../../hooks/useLoadCostRollups";
import { SelectCombobox } from "../../components/Combobox";
import {
  getTruckLine,
  listLoadExceptionReasons,
  recordTruckLineException,
  resolveTruckLineException,
  stampTruckLineArrival,
  stampTruckLineDeparture,
  type TruckLineGroup,
  type TruckLineRow,
  type TruckLineSection,
} from "../../api/truckLine";

// THE LINE — 7 visual stations (V7). `backendIndex` is the station.ts index whose reached/next/
// stamp signal drives this node; "Loaded" and "In transit" share index 3 on purpose (see file
// header). Index 4 ("status") is handled entirely separately (V8 ruling 1) — it is never part of
// forward click-progression, exactly like the old "Other" overlay never was.
const V7_STATIONS = [
  { name: "Dispatched", backendIndex: 1 },
  { name: "At pickup", backendIndex: 2 },
  { name: "Loaded", backendIndex: 3 },
  { name: "In transit", backendIndex: 3 },
  { name: "status", backendIndex: 4 },
  { name: "At delivery", backendIndex: 5 },
  { name: "Delivered", backendIndex: 6 },
] as const;
const V7_COUNT = V7_STATIONS.length;
const STATUS_STATION_INDEX = 4;

// Below the fold breakpoint, the Line column is too narrow for the full station names to sit
// one-per-node without touching their neighbor (measured: "Dispatched"/"At pickup" and "At
// delivery"/"Delivered" collide at 860px even at the .cap clamp() floor) — a shorter caption at
// that width is a documented, honest adaptation (the same "different rendering below the
// breakpoint" pattern the Load/Live-signal columns already use), never a guess at meaning.
const NARROW_STATION_CAPTIONS: Record<string, string> = {
  Dispatched: "Disp.",
  "At pickup": "Pickup",
  Loaded: "Loaded",
  "In transit": "Transit",
  "At delivery": "Delivery",
  Delivered: "Del.",
};

const GREEN = "#16A34A";
const RED = "#DC2626";
const GREEN_DARK = "#15803D";
const RED_DARK = "#B91C1C";
const ON_TIME_GREEN = "#166534";
const ON_TIME_FILL = "#ECFDF3";
const EXCEPTION_RED = "#991B1B";

// TRUCK-LINE-TRANSIT-IS-A-COLUMN (Lead, 09-30-2026). Owner, measured live on app.ih35dispatch.com:
// "the location isnt supposed to be under, it is supposed to be next to delivered · pu date and
// delivery date are supposed to be before dispatched · the time lines is not uniform in an all ·
// the height is still too tall · the unit and tour columns are too wide."
//
// ROOT CAUSE — one defect, five symptoms. The transit line was NOT a column. It was a second,
// full-width sub-row rendered after the grid row, indented with paddingLeft:max(12rem,17vw) so it
// LOOKED like it started under LOAD. Consequences, all forced by that one choice:
//   * every unit cost TWO stacked lines (~132px measured) — "the height is still too tall";
//   * PU DATE / DELIVERY DATE sat in the grid row to the RIGHT of the whole transit line, so the
//     "Dispatched" station printed to their LEFT — "pu date and delivery date before dispatched";
//   * CURRENT LOCATION had nowhere to go but a THIRD line beneath the rail — "not under";
//   * the sub-row was free-floating, so its width was scaled per row by trip length and centered,
//     making no two rails start or end at the same x — "the time lines is not uniform in an all";
//   * the five real columns had to absorb the whole viewport width on their own, which is why UNIT
//     and TOUR were handed 8vw/9vw — "the unit and tour columns are too wide".
// FIX: TRANSIT is the sixth grid track. It takes 1fr, so every rail begins and ends on the same two
// x positions in every row, PU/DEL precede it, CURRENT LOCATION sits beside Delivered inside the
// same cell, the row is one line, and UNIT/TOUR shrink to what their values actually need.
// CUSTOMER-UNDER-THE-THREE (Lead, 09-30-2026). Owner, verbatim: "put the customer name under unit,
// tour and load. let it render in those 3 columns. this way the important view, the LINE, doesn't
// shrink so much as it is now. I told you the unit and tour columns were too wide. THE HEIGHT IS
// PERFECT. It must still be the same height as it is right now, but with the name under those 3
// columns."
//
// The customer name used to live INSIDE the LOAD cell, so LOAD had to be wide enough to hold a name
// like "C and A TRANSPORTATION & LOGISTICS INC" — 13vw of the row spent on text, taken straight out
// of the transit line, which is the column that actually matters on this board.
//
// The name now renders on its own second grid row spanning columns 1-3 (UNIT + TOUR + LOAD
// together), so no single column has to be wide enough for it. That frees UNIT 5vw->3.4, TOUR
// 6vw->4.4 and LOAD 13vw->6, and every point of it goes to TRANSIT.
//
// HEIGHT IS UNCHANGED, and that is the constraint, not a side effect: the row's height is set by the
// 70px transit rail, which now spans BOTH grid rows (grid-row: 1 / 3). The text column's two stacked
// lines are far shorter than 70px, so they sit inside the height the rail already dictated. The row
// is exactly as tall as it was.
/** TRUCKLINE-STATUS-COMBOBOX — one option table, so the control and the counts can never drift
 *  apart. Every value here is a bucket legBuckets() can actually return, plus "all". */
const TRUCK_LINE_STATUS_FILTERS: ReadonlyArray<{ value: TruckLineStatusFilter; label: string }> = [
  { value: "all", label: "All trucks" },
  { value: "rolling", label: "Rolling" },
  { value: "stopped", label: "Stopped" },
  { value: "signal_stale", label: "Signal stale" },
  { value: "appointment_past", label: "Appointment past" },
  { value: "available", label: "Available" },
];

const GRID_TEMPLATE_COLUMNS =
  // Owner, 09-30: "what part of I want the transit line to be more visible". PRE-SETTLEMENT is gone
  // from the TOUR header and DISPATCHED is gone from the LOAD cell, so neither column has to be
  // wide enough for a word it no longer prints. UNIT holds "T148", TOUR holds "P-0013", LOAD holds
  // "13635" — nothing longer. Every point freed goes to TRANSIT.
  "minmax(46px,2.6vw) minmax(56px,3.2vw) minmax(62px,3.6vw) minmax(84px,5.6vw) minmax(84px,5.6vw) minmax(480px,1fr)";
const GRID_TEMPLATE_COLUMNS_NARROW =
  "minmax(48px,8vw) minmax(60px,9vw) minmax(76px,11vw) minmax(62px,9.5vw) minmax(62px,9.5vw) minmax(200px,1fr)";
const FOLD_BREAKPOINT_PX = 860;
const CAPTION_FOLD_BREAKPOINT_PX = 1180;
const AVAILABLE_ROW_TINT = "color-mix(in srgb, #16A34A 4%, #fff)";

/** ROUND 255 — in-place status dropdown options (load status, not exception station). */
const LOAD_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "dispatched", label: "Dispatched" },
  { value: "at_pickup", label: "At pickup" },
  { value: "in_transit", label: "In transit" },
  { value: "at_delivery", label: "At delivery" },
  { value: "delivered", label: "Delivered" },
];

/** Drag targets along the transit line (owner: in transit → on time → at delivery → delivered). */
const DRAG_STATUS_BY_V7: Record<number, string> = {
  3: "in_transit",
  4: "in_transit", // "On time" station — keep in_transit, exception cleared separately
  5: "at_delivery",
  6: "delivered",
};

function fmtApptDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function apptDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** ROUND 255 Item 2 — return trip when this leg's PU date equals the prior leg's DEL date. */
function isReturnTripLeg(prev: TruckLineRow | null | undefined, curr: TruckLineRow): boolean {
  if (!prev?.appointments?.delivery?.at || !curr.appointments?.pickup?.at) return false;
  const a = apptDayKey(prev.appointments.delivery.at);
  const b = apptDayKey(curr.appointments.pickup.at);
  return a != null && b != null && a === b;
}

/** ROUND 262 — a real schedule conflict: this unit's next leg is scheduled to pick up BEFORE the
 *  prior leg's own delivery appointment, i.e. the same truck is double-booked in overlapping
 *  windows. Distinct from isReturnTripLeg (same-day PU/DEL is normal); this fires only when the
 *  order actually inverts. Never fires across two different units' legs — callers pass adjacent
 *  legs from the same group only. */
function hasScheduleConflict(prev: TruckLineRow | null | undefined, curr: TruckLineRow): boolean {
  if (!prev?.appointments?.delivery?.at || !curr.appointments?.pickup?.at) return false;
  const prevDel = new Date(prev.appointments.delivery.at).getTime();
  const currPu = new Date(curr.appointments.pickup.at).getTime();
  if (Number.isNaN(prevDel) || Number.isNaN(currPu)) return false;
  return currPu < prevDel;
}

// ROUND-20.4 -- 3px left spine per row, colored by the unit's current trip leg, so a unit's row is
// identifiable at a glance without reading its text. No load (including the available-truck rows,
// which never carry r.load) gets the neutral border color, never a semantic one.
const ROW_SPINE_NO_LOAD = "#E5E7EB";
const ROW_SPINE_BY_TRIP_TYPE: Record<string, string> = { NB: "#1f2a44", TR: "#b45309", SB: "#475569" };
function rowSpineColor(tripType: string | null | undefined): string {
  return (tripType && ROW_SPINE_BY_TRIP_TYPE[tripType]) || ROW_SPINE_NO_LOAD;
}

function pct(index: number) {
  return (index / (V7_COUNT - 1)) * 100;
}

// TRUCK-LINE-STATUS-FILTER (Lead, 09-30-2026, owner: "the status, i had requested a filter drop
// down combo box, it is stuck").
// ROOT CAUSE: it was stuck because it was never a control. The top bar rendered six plain <span>
// elements — "All trucks (14) Rolling (8) Stopped (3) …" — with no onClick, no state and nothing
// downstream reading them. They were a read-out that LOOKED like a filter bar.
// FIX: one real <SelectCombobox>, and ONE classifier that both the counts and the filter read, so an
// option can never show a count the filtered board disagrees with. There is no second place to
// change when a bucket's definition moves.
export type TruckLineStatusFilter =
  | "all"
  | "rolling"
  | "stopped"
  | "signal_stale"
  | "appointment_past"
  | "available";

/** The single definition of which bucket a leg belongs to. Counts and filtering both read this. */
function legBuckets(group: TruckLineGroup, r: TruckLineRow): TruckLineStatusFilter[] {
  const out: TruckLineStatusFilter[] = ["all"];
  if (group.section === "available") {
    out.push("available");
    return out;
  }
  if (r.load && r.station) {
    const live = deriveLiveStation(r, mapReachedIndexToV7(r.station.reached_index));
    if (live.signalLabel === "Stale") out.push("signal_stale");
    else if (live.rolling) out.push("rolling");
    else out.push("stopped");
  }
  if (r.next_appointment?.late) out.push("appointment_past");
  return out;
}

// THE LINE's 7 station nodes are honest discrete progress markers (station.ts's own reached/next
// model), never repositioned onto a fabricated calendar axis for stations with no real stamp.
//
// TRUCK-LINE-UNIFORM-RAIL (Lead, 09-30-2026) — OWNER REVERSAL, recorded so nobody re-adds it.
// ROUND 200 scaled each row's rail WIDTH to that leg's pickup->delivery span (24%..100%) and
// centered it. Owner, measured live 09-30: "the time lines is not uniform in an all." Every rail
// now spans the full TRANSIT column, so all 7 stations sit on the same x in every row and a column
// of rows reads as one chart. The trip's real length is not lost — it is in the PU DATE and
// DELIVERY DATE columns, which now render immediately to the rail's LEFT. timelineWidthPercent()
// and its two constants are deleted rather than left unused; there is no scaled path to resurrect.



function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalHours = Math.floor(abs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

// ROUND 23.1 D3 (owner, 2026-09-13: "i see the city or county of the live signal, but i also need
// it with the state") — ONE helper, every call site that prints a position (Live signal, Stale
// signal, THE AVAILABLE TRUCK's parked-at line, a load stop's pickup/delivery city). Prefers
// formatted_location (the richest string Samsara gives — 37 of 41 USMCA rows carry it) over a
// hand-built "city, state" concatenation; degrades honestly (city alone, then state alone, then
// "—") rather than ever printing a dangling ", " when one half is null.
function formatLocationLabel(loc: { city: string | null; state: string | null; formatted_location?: string | null } | null | undefined): string {
  if (!loc) return "—";
  if (loc.formatted_location) return loc.formatted_location;
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
  if (loc.city) return loc.city;
  if (loc.state) return loc.state;
  return "—";
}

// ROUND 23.1 D2a (owner: "there is a gps with stale minutes, fix that") — never print raw minutes
// past 60; reuse the SAME fmtDuration every other duration on this board already uses.
function formatStaleAge(staleMinutes: number | null): string | null {
  if (staleMinutes == null) return null;
  if (staleMinutes <= 60) return `${staleMinutes} min ago`;
  return `${fmtDuration(staleMinutes * 60_000)} ago`;
}



/** Backend reachedIndex (0-8, station.ts's own model) -> the furthest V7 visual index reached
 * (-1..6). See the file header for why "Loaded"(2)/"In transit"(3) share one signal and why
 * indices 7 (docs_received) / 8 (invoiced) clamp to "Delivered"(6) — this view never shows a
 * post-delivery paperwork stage. */
function mapReachedIndexToV7(backendReached: number): number {
  if (backendReached <= 0) return -1;
  if (backendReached === 1) return 0;
  if (backendReached === 2) return 1;
  if (backendReached === 3) return 3;
  if (backendReached === 5) return 5;
  return 6; // 6, 7, 8
}

/** Backend nextIndex -> the one V7 station that is clickable-to-advance, or null once terminal /
 * once beyond this board's 7-station scope (docs_received/invoiced have no V7 node to advance
 * into). "In transit"(3) is never independently clickable — it is always reached together with
 * "Loaded" by the SAME click (both share backendIndex 3). */
function mapNextIndexToV7(backendNext: number | null): number | null {
  if (backendNext == null) return null;
  if (backendNext === 1) return 0;
  if (backendNext === 2) return 1;
  if (backendNext === 3) return 2;
  if (backendNext === 5) return 5;
  if (backendNext === 6) return 6;
  return null; // 7, 8 — beyond this view
}

type LiveStation = {
  v7Index: number; // where the truck GRAPHIC sits (may be ahead of the dashed/stamped rail)
  rolling: boolean;
  signalLabel: "Live" | "Stale" | "No ping";
};

/** LIVE POSITION RULE (V7, own section) — see the file header. Never fabricates a position: a
 * stale or absent ping always falls back to the last STAMPED node. */
function deriveLiveStation(row: TruckLineRow, v7ReachedIndex: number): LiveStation {
  const parkedFallback = Math.max(v7ReachedIndex, 0);
  const pos = row.position;
  if (!pos) return { v7Index: parkedFallback, rolling: false, signalLabel: "No ping" };
  if (pos.stale) {
    return { v7Index: parkedFallback, rolling: false, signalLabel: "Stale" };
  }
  // TRUCKLINE-ANIM (Lead, 09-30-2026) — engine_state is a VETO, never a REQUIREMENT.
  // Measured live on prod telematics.vehicle_locations: of the fresh pings, 231 carry
  // engine_state='unknown' with 171 of those MOVING (up to 76.1 mph), against only 166
  // reporting 'on'. Requiring a positive 'on' therefore rendered more than half the moving
  // fleet as parked. Every 'idle'/'off' ping measured had speed_mph = 0.0, so those two
  // values are safe to trust as a denial. Speed is the ground truth for motion; engine_state
  // only overrides it when it explicitly contradicts motion.
  // The column itself is fixed at ingest under 283.6 (CC-3) — this gate must stay correct
  // regardless of what ingest stores, so it does not assume any particular vocabulary.
  const engineDenies = typeof pos.engine_state === "string" && /^(idle|off)$/i.test(pos.engine_state.trim());
  const speed = pos.speed_mph ?? 0;
  if (speed > 0 && !engineDenies) {
    return { v7Index: 3, rolling: true, signalLabel: "Live" };
  }
  const pickupCity = row.load?.pickup.city;
  const deliveryCity = row.load?.delivery.city;
  if (pos.city && pickupCity && pos.city === pickupCity) {
    return { v7Index: 1, rolling: false, signalLabel: "Live" };
  }
  if (pos.city && deliveryCity && pos.city === deliveryCity) {
    return { v7Index: 5, rolling: false, signalLabel: "Live" };
  }
  return { v7Index: 3, rolling: false, signalLabel: "Live" };
}

/** TRACTOR-TRAILER (74x34) — verbatim from the Lead's locked V7 render, CAB/CABDARK substituted.
 * V10's `parked` variant (THE AVAILABLE TRUCK) mutes the cab to #2F5069/#22394C and desaturates the
 * whole graphic (grayscale(.15)) — never rolling, never puffing, regardless of the `rolling` prop. */
function TractorTrailerSvg({ hasIssue, rolling, parked }: { hasIssue: boolean; rolling: boolean; parked?: boolean }) {
  // ROUND 255 Item 4 — the truck is GREEN (owner: restore), not navy, when rolling / on the line.
  const cab = parked ? "#2F5069" : hasIssue ? RED : GREEN;
  const cabDark = parked ? "#22394C" : hasIssue ? RED_DARK : GREEN_DARK;
  const gid = parked ? "cgParked" : hasIssue ? "cgIssue" : "cgOk";
  const isRolling = rolling && !parked;
  // SMOKE CLIPPING — OWNER, LIVE 2026-09-30: "the truck is not showing the smoke completely as if
  // part of it is cut." He is right, and the cause is this SVG's own viewBox, not the page.
  //
  // The exhaust keyframe ends at translate(-7px, -7px) scale(1.9) on a puff drawn at cy=7 r=3.2, so
  // the puff's top edge finishes at y = 7 - 7 - (3.2 * 1.9) ~= -6.1. The old viewBox started at
  // y = 0, and an SVG clips at its own viewBox no matter how much room the page gives it. Measured
  // in Chrome: the vehicle, the rail cell, the 70px flex row and the 74px board row are ALL
  // overflow:visible, so nothing outside this element was ever cutting it.
  //
  // The box therefore grows UPWARD by 12 (viewBox "0 -12 74 46", height 46) and the container's top
  // moves 4 -> -8 to match, so the truck body and wheels land on exactly the same pixels as before:
  // the bottom edge was 4 + 34 = 38 and is now -8 + 46 = 38. Only the smoke gains room.
  return (
    <svg
      className={`truck-line-vehicle-svg${isRolling ? " truck-line-rolling" : ""}`}
      style={parked ? { filter: "grayscale(.15)" } : undefined}
      width="74"
      height="46"
      viewBox="0 -12 74 46"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" stopColor="#EEF2F6" />
          <stop offset="1" stopColor="#D7DEE6" />
        </linearGradient>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cab} />
          <stop offset="1" stopColor={cabDark} />
        </linearGradient>
      </defs>
      <ellipse cx="37" cy="30.4" rx="30" ry="2.1" fill="#0F172A" opacity=".13" />
      <circle className="puff" cx="60.5" cy="7" r="3.2" fill="#9CA3AF" />
      <circle className="puff" cx="62.5" cy="9" r="2.2" fill="#9CA3AF" style={{ animationDelay: ".35s" }} />
      <rect x="3" y="6" width="42" height="15" rx="1.6" fill="url(#tg)" stroke="#93A3B4" strokeWidth=".8" />
      <path d="M9 6v15M16 6v15M23 6v15M30 6v15M37 6v15" stroke="#C3CCD6" strokeWidth=".7" />
      <rect x="3.6" y="6.6" width="4" height="13.8" rx="1" fill="#DCE3EA" stroke="#9FAEBC" strokeWidth=".6" />
      <rect x="4.6" y="12" width="2" height="2.4" rx=".4" fill="#8FA0B0" />
      <rect x="3" y="20.4" width="42" height="1.8" fill="#94A3B8" />
      <rect x="9" y="22" width="27" height="1.5" rx=".7" fill="#64748B" />
      <path d="M46 21.5V9.2c0-1 .8-1.8 1.8-1.8h6.6l5.4 6.1v8H46z" fill={`url(#${gid})`} />
      <path d="M48.6 9.4h5.2l4 4.6h-9.2z" fill="#BBD3EA" />
      <rect x="45.4" y="15.6" width="14.6" height="2" rx="1" fill="#0B1B2B" opacity=".35" />
      <rect x="58.6" y="17.4" width="2.4" height="4" rx=".6" fill="#334155" />
      <rect x="60.2" y="4.4" width="2" height="12" rx="1" fill="#94A3B8" />
      <rect x="60.2" y="3.4" width="2" height="1.6" rx=".8" fill="#64748B" />
      <rect x="49" y="18.6" width="6" height="3.2" rx="1" fill="#CBD5E1" stroke="#94A3B8" strokeWidth=".5" />
      <rect x="45" y="21.4" width="16" height="1.6" fill="#475569" />
      <circle cx="59.6" cy="14.6" r=".9" fill="#FDE68A" />
      <circle className="wheel" cx="12.5" cy="24.6" r="4.5" fill="#111827" />
      <circle cx="12.5" cy="24.6" r="1.7" fill="#9CA3AF" />
      <circle cx="12.5" cy="24.6" r=".6" fill="#4B5563" />
      <circle className="wheel" cx="21.5" cy="24.6" r="4.5" fill="#111827" />
      <circle cx="21.5" cy="24.6" r="1.7" fill="#9CA3AF" />
      <circle cx="21.5" cy="24.6" r=".6" fill="#4B5563" />
      <circle className="wheel" cx="47.5" cy="24.6" r="4.5" fill="#111827" />
      <circle cx="47.5" cy="24.6" r="1.7" fill="#9CA3AF" />
      <circle cx="47.5" cy="24.6" r=".6" fill="#4B5563" />
      <circle className="wheel" cx="57.5" cy="24.6" r="4.2" fill="#111827" />
      <circle cx="57.5" cy="24.6" r="1.6" fill="#9CA3AF" />
      <circle cx="57.5" cy="24.6" r=".6" fill="#4B5563" />
    </svg>
  );
}

/** WAREHOUSE DOCK (30x24) — verbatim from the Lead's locked V7 render, ROOF substituted. */
function WarehouseDockSvg({ roof }: { roof: string }) {
  return (
    <svg width="30" height="24" viewBox="0 0 30 24" aria-hidden="true">
      <ellipse cx="15" cy="22.4" rx="12" ry="1.4" fill="#0F172A" opacity=".12" />
      <path d="M2 9 15 2.4 28 9v1.6H2z" fill={roof} />
      <rect x="3.4" y="10.4" width="23.2" height="11.2" rx="1" fill="#F3F6F9" stroke="#A9B6C4" strokeWidth=".8" />
      <rect x="5.6" y="13" width="5.4" height="8.6" rx=".6" fill="#DCE3EA" stroke="#9FAEBC" strokeWidth=".6" />
      <path d="M5.6 15h5.4M5.6 17h5.4M5.6 19h5.4" stroke="#B9C4CF" strokeWidth=".6" />
      <rect x="12.3" y="13" width="5.4" height="8.6" rx=".6" fill="#DCE3EA" stroke="#9FAEBC" strokeWidth=".6" />
      <path d="M12.3 15h5.4M12.3 17h5.4M12.3 19h5.4" stroke="#B9C4CF" strokeWidth=".6" />
      <rect x="19" y="13" width="5.4" height="8.6" rx=".6" fill="#DCE3EA" stroke="#9FAEBC" strokeWidth=".6" />
      <path d="M19 15h5.4M19 17h5.4M19 19h5.4" stroke="#B9C4CF" strokeWidth=".6" />
      <rect x="3.4" y="21" width="23.2" height="1.2" fill="#8C98A6" />
    </svg>
  );
}


// ROUND 23.1 D5 (owner, twice: "there is no ascending and descending order on the columns...i am
// clicking and it is not moving") — the identical sortable-header CONTRACT ParityTable already
// uses elsewhere (sortable: true / sortValue(row), see EntityActivityFeed.tsx) implemented
// directly on this grid, since this one view is deliberately never a ParityTable (V4/V7 owner
// ruling, guard item (j)). Sort is a VIEW PREFERENCE only — never persisted, never re-fetched, the
// row COUNT never changes. Three-state per column: ascending -> descending -> back to the board's
// own default order (the array the backend/search already produced).
type TruckLineSortKey = "truck" | "load" | "pu" | "del" | "tour";
type TruckLineSortDir = "asc" | "desc";
type TruckLineSortState = { key: TruckLineSortKey; dir: TruckLineSortDir } | null;

const SECTION_ORDER: TruckLineSection[] = ["tour", "in_transit", "available"];
const SECTION_LABEL: Record<TruckLineSection, string> = {
  tour: "TOUR",
  in_transit: "IN TRANSIT",
  available: "AVAILABLE",
};

/** T9 sorts before T10 — split into digit/non-digit runs and compare each run numerically when
 * both sides are numeric, lexically otherwise. */
function naturalCompare(a: string, b: string): number {
  const runRe = /(\d+|\D+)/g;
  const pa = a.match(runRe) ?? [a];
  const pb = b.match(runRe) ?? [b];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "") return nx - ny;
    return x < y ? -1 : 1;
  }
  return 0;
}


function compareTruckLineRows(a: TruckLineRow, b: TruckLineRow, key: TruckLineSortKey): number {
  switch (key) {
    case "truck":
      return naturalCompare(a.unit_number ?? "", b.unit_number ?? "");
    case "load": {
      const numOf = (n: string | null | undefined) => (n ? parseInt(n.replace(/\D/g, ""), 10) : NaN);
      const la = a.load?.load_number != null && !Number.isNaN(numOf(a.load.load_number)) ? numOf(a.load.load_number) : Infinity;
      const lb = b.load?.load_number != null && !Number.isNaN(numOf(b.load.load_number)) ? numOf(b.load.load_number) : Infinity;
      return la - lb;
    }
    case "pu":
      return (a.appointments?.pickup?.at ?? "").localeCompare(b.appointments?.pickup?.at ?? "");
    case "del":
      return (a.appointments?.delivery?.at ?? "").localeCompare(b.appointments?.delivery?.at ?? "");
    case "tour":
      return (a.tour_display_id ?? "").localeCompare(b.tour_display_id ?? "");
    default:
      return 0;
  }
}

/** ROUND 23.1 D5 — a real button per header, aria-sort set for screen readers AND for the guard
 * to assert against. Three-state: ascending -> descending -> back to default (this board's own
 * order, never persisted). The button-chrome reset (background/border/padding/font) is the
 * MINIMUM needed to make a native <button> read as plain header text — not a restyle of the
 * board's actual content. */
function TruckLineSortHeader({
  label,
  sortKey,
  active,
  onClick,
  className,
}: {
  label: string;
  sortKey: TruckLineSortKey;
  active: TruckLineSortDir | null;
  onClick: (key: TruckLineSortKey) => void;
  className?: string;
}) {
  const ariaSort = active === "asc" ? "ascending" : active === "desc" ? "descending" : "none";
  return (
    <button
      type="button"
      className={`font-semibold ${className ?? ""}`}
      style={{ display: "block", width: "100%", background: "transparent", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
      aria-sort={ariaSort}
      data-testid={`truck-line-sort-${sortKey}`}
      onClick={() => onClick(sortKey)}
    >
      {label}
      {active ? <span aria-hidden="true"> {active === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

type StampPromptState = { row: TruckLineRow; label: string; kind: "arrival" | "departure" | "transition" } | null;
type OtherPromptState = { row: TruckLineRow } | null;

/** The 7-station line + the moving truck + dock icons + the status-station popover for one row —
 * a pure render of `row.station` (plus the LIVE POSITION RULE for the truck graphic), never its
 * own state machine. */
function TruckLineTrack({
  row,
  reasons,
  otherPrompt,
  otherReasonId,
  otherNote,
  otherBusy,
  otherError,
  onAdvance,
  onOpenOther,
  onCloseOther,
  onPickReason,
  onNoteChange,
  onConfirmException,
  onClearException,
  onDragStatus,
}: {
  row: TruckLineRow;
  reasons: { id: string; code: string; name: string }[];
  otherPrompt: OtherPromptState;
  otherReasonId: string | null;
  otherNote: string;
  otherBusy: boolean;
  otherError: string | null;
  onAdvance: (row: TruckLineRow, label: string, backendIndex: number) => void;
  onOpenOther: (row: TruckLineRow) => void;
  onCloseOther: () => void;
  onPickReason: (id: string) => void;
  onNoteChange: (note: string) => void;
  onConfirmException: () => void;
  onClearException: () => void;
  /** ROUND 255 — drag truck along the line to change status (in transit → at delivery → delivered). */
  onDragStatus: (row: TruckLineRow, newStatus: string) => void;
}) {
  if (!row.load || !row.station) {
    // V10 (ROUND 18.6): this board no longer draws a bare unit row at all when there is neither an
    // active load nor a qualifying available driver (see the file header) — a "loaded" kind row is
    // only ever produced with both load and station present. This branch is therefore defensive,
    // unreachable dead code kept only so TruckLineTrack degrades honestly instead of crashing if
    // that invariant were ever violated — it must NEVER render the retired "no load on this truck"
    // string (the guard checks the whole file for it).
    return (
      <div className="relative h-[62px]" data-testid={`truck-line-track-empty-${row.unit_id}`}>
        <div className="absolute left-0 right-0 top-[41px] h-[3px] rounded bg-[#E5E7EB]" />
        <span className="truck-line-v4-sub absolute left-2 top-6 text-[#6B7280]">— unexpected: this row has no load data</span>
      </div>
    );
  }
  const { reached_index, next_index, has_open_exception, exception_reason_label } = row.station;
  const v7Reached = mapReachedIndexToV7(reached_index);
  const v7Next = mapNextIndexToV7(next_index);
  const live = deriveLiveStation(row, v7Reached);
  const isOtherOpen = otherPrompt?.row.unit_id === row.unit_id;

  // V8 RULING 1: "rail red from that point on" — the normal reached rail stays green from 0 to
  // the last reached node; when an exception is open, an ADDITIONAL red segment extends from
  // there up to the status station's own position, surfacing the problem without recoloring
  // progress that already happened honestly.
  const reachedPct = pct(Math.max(v7Reached, 0));
  const exceptionPct = pct(STATUS_STATION_INDEX);
  // TRUCK-LINE-CAPTION-CLIP (Lead, 09-30-2026, owner: "the load timeline is wrong, you removed the
  // live location"). Station captions render at top:54, so the rail box is 70px tall — a shorter
  // box printed every caption below its own bounds, straight through whatever followed.
  //
  // TRANSIT CELL LAYOUT: [ rail — flex-1, always full width ][ CURRENT LOCATION — fixed, right ].
  // The rail's last station is "Delivered" at left:100%, so the location block that follows sits
  // literally next to it (owner: "it is supposed to be next to delivered"), on the same line, never
  // on a line of its own underneath. pr-7 on the rail keeps the Delivered caption, which is centered
  // on the 100% node and so overhangs by half its width, clear of the location text.
  return (
    <div className="flex h-[70px] min-w-0 items-center gap-1" data-testid={`truck-line-track-${row.unit_id}`}>
    <div
      className="relative h-full min-w-0 flex-1"
      style={{ marginRight: 28 }}
      data-testid={`truck-line-track-scale-${row.unit_id}`}
      data-timeline-width-pct="100.0"
    >
      <WarehouseDockSvg roof="#1f2a44" />
      <div className="absolute" style={{ left: `${pct(1)}%`, top: 2, transform: "translateX(-50%)" }}>
        <WarehouseDockSvg roof="#1f2a44" />
      </div>
      <div className="absolute" style={{ left: `${pct(5)}%`, top: 2, transform: "translateX(-50%)" }}>
        <WarehouseDockSvg roof="#475569" />
      </div>

      <div className="absolute left-0 right-0 top-[41px] h-[3px] rounded bg-[#E5E7EB]" />
      {v7Reached >= 0 ? (
        <div className="absolute top-[41px] h-[3px] rounded" style={{ left: 0, width: `${reachedPct}%`, background: GREEN }} />
      ) : null}
      {has_open_exception && exceptionPct > reachedPct ? (
        <div className="absolute top-[41px] h-[3px] rounded" style={{ left: `${reachedPct}%`, width: `${exceptionPct - reachedPct}%`, background: RED }} />
      ) : null}

      {V7_STATIONS.map((st, i) => {
        const left = pct(i);
        if (i === STATUS_STATION_INDEX) {
          const exceptionOpen = has_open_exception;
          return (
            // Same z-order rule as the progress nodes below: the station layer outranks the
            // truck graphic so the On time / Exception dot is never painted over.
            <div key={i} className="absolute" style={{ left: `${left}%`, top: 0, zIndex: 6 }}>
              <button
                type="button"
                data-testid={`truck-line-status-node-${row.unit_id}`}
                title={exceptionOpen ? `Exception · ${exception_reason_label ?? "reason"}` : "On time — click to record an exception"}
                onClick={() => onOpenOther(row)}
                className="absolute rounded-full border-2"
                style={{
                  top: 34,
                  width: 17,
                  height: 17,
                  transform: "translateX(-50%)",
                  background: exceptionOpen ? RED : ON_TIME_FILL,
                  borderColor: exceptionOpen ? RED : ON_TIME_GREEN,
                  cursor: "pointer",
                }}
              />
              <span
                className="truck-line-v4-cap absolute whitespace-nowrap font-semibold"
                style={{ top: 54, left: "50%", transform: "translateX(-50%)", color: exceptionOpen ? EXCEPTION_RED : ON_TIME_GREEN }}
              >
                {exceptionOpen ? exception_reason_label ?? "Exception" : "On time"}
              </span>

              {isOtherOpen ? (
                <div
                  className="absolute z-50 rounded-md border border-[#E5E7EB] bg-white text-xs shadow-lg"
                  style={{ bottom: 78, left: "50%", transform: "translateX(-50%)", width: "min(260px,64vw)" }}
                  data-testid={`truck-line-status-popover-${row.unit_id}`}
                >
                  <div className="flex h-[26px] items-center justify-between bg-[rgb(228,234,241)] px-2 font-semibold text-[#1F2A44]">
                    <span className="truck-line-v4-cap">{row.unit_number} · {row.load?.load_number} · Exception</span>
                    <button type="button" onClick={onCloseOther}>✕</button>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto p-1.5" data-testid="truck-line-reason-list">
                    {reasons.length === 0 ? (
                      <div className="px-2 py-1.5 text-[#6B7280]">No reasons published yet.</div>
                    ) : (
                      reasons.map((r) => (
                        <div
                          key={r.id}
                          onClick={() => onPickReason(r.id)}
                          data-testid={`truck-line-reason-${r.code}`}
                          className={`cursor-pointer rounded px-2 py-1.5 ${otherReasonId === r.id ? "bg-[#FEF2F2] font-semibold" : ""}`}
                        >
                          {r.name}
                        </div>
                      ))
                    )}
                    <div
                      onClick={onClearException}
                      data-testid="truck-line-reason-clear"
                      className="mt-1 cursor-pointer border-t border-[#E5E7EB] px-2 py-1.5 font-semibold"
                      style={{ color: ON_TIME_GREEN }}
                    >
                      ✓ No exception — on time
                    </div>
                  </div>
                  {otherReasonId ? (
                    <div className="flex items-center justify-between border-t border-[#E5E7EB] p-1.5">
                      <input
                        className="h-6 flex-1 rounded border border-[#E5E7EB] px-1.5"
                        placeholder="Note…"
                        value={otherNote}
                        onChange={(e) => onNoteChange(e.target.value)}
                        data-testid="truck-line-other-note"
                      />
                      <button
                        type="button"
                        disabled={otherBusy}
                        className="ml-1.5 h-6 rounded bg-[#14314F] px-2 text-white disabled:opacity-60"
                        data-testid="truck-line-other-confirm"
                        onClick={onConfirmException}
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                  {otherError ? (
                    <div className="mx-1.5 mb-1.5 border border-[#DC2626] bg-[#FEF2F2] px-2 py-1 text-[#DC2626]" data-testid="truck-line-other-error">
                      {otherError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        }

        const isDone = v7Reached >= 0 && i <= v7Reached;
        const isCurrent = i === v7Reached;
        // "In transit"(3) is never independently clickable — it advances together with "Loaded"(2).
        const isNext = i === v7Next && i !== 3;
        const nodeColor = has_open_exception && isDone ? RED : GREEN;
        return (
          // OWNER-LIVE 2026-09-30 ("the green circle is not on ... the truck appears in
          // dispatched"): the node was NOT off. `.truck-line-vehicle` carries z-index 5 and the
          // 74x34 truck graphic, centred on its station, painted straight over the 17px node —
          // measured on T170, where a 15h44m-stale ping correctly parks the truck at Dispatched
          // and it then blanketed the Dispatched dot. The station layer now outranks the truck,
          // so the progress node is visible at every station the truck can sit on.
          <div key={i} className="absolute" style={{ left: `${left}%`, top: 0, zIndex: 6 }}>
            <button
              type="button"
              disabled={!isNext}
              data-testid={`truck-line-node-${st.name.toLowerCase().replace(/\s+/g, "-")}-${row.unit_id}`}
              title={`${st.name}${isNext ? " — click to advance" : ""}`}
              onClick={() => isNext && onAdvance(row, st.name, st.backendIndex)}
              className="absolute rounded-full"
              style={{
                top: 34,
                width: 17,
                height: 17,
                transform: "translateX(-50%)",
                background: isDone ? nodeColor : "#fff",
                border: isCurrent ? `3px solid ${nodeColor}` : isNext ? `2px dashed ${GREEN}` : isDone ? `2px solid ${nodeColor}` : "2px dashed #D3DAE6",
                cursor: isNext ? "pointer" : "default",
              }}
            />
            <span className="truck-line-v4-cap absolute whitespace-nowrap text-[#1F2A44]" style={{ top: 54, left: "50%", transform: "translateX(-50%)" }}>
              <span className="truck-line-v4-cap-full">{st.name}</span>
              <span className="truck-line-v4-cap-narrow">{NARROW_STATION_CAPTIONS[st.name] ?? st.name}</span>
            </span>
          </div>
        );
      })}

      <div
        className="truck-line-vehicle"
        style={{ left: `${pct(live.v7Index)}%`, top: -8, cursor: "grab", touchAction: "none" }}
        data-testid={`truck-line-vehicle-${row.unit_id}`}
        data-rolling={live.rolling ? "true" : "false"}
        title="Drag to change status: in transit → on time → at delivery → delivered"
        onPointerDown={(e) => {
          e.preventDefault();
          const el = e.currentTarget.parentElement;
          if (!el || !row.load) return;
          const startX = e.clientX;
          const rect = el.getBoundingClientRect();
          const onMove = (ev: PointerEvent) => {
            const rel = Math.min(1, Math.max(0, (ev.clientX - rect.left) / Math.max(rect.width, 1)));
            const idx = Math.round(rel * (V7_COUNT - 1));
            e.currentTarget.style.left = `${pct(idx)}%`;
            (e.currentTarget as HTMLElement).dataset.dragIndex = String(idx);
          };
          const onUp = (ev: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            const idx = Number((e.currentTarget as HTMLElement).dataset.dragIndex ?? live.v7Index);
            const nextStatus = DRAG_STATUS_BY_V7[idx];
            if (nextStatus && nextStatus !== row.load?.status) {
              onDragStatus(row, nextStatus);
            } else {
              e.currentTarget.style.left = `${pct(live.v7Index)}%`;
            }
            void ev;
            void startX;
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      >
        {/* A Stale / No ping truck is the LAST KNOWN position, never a live one. It renders
            muted so the owner can tell the two apart at a glance without reading the caption. */}
        <TractorTrailerSvg
          hasIssue={has_open_exception}
          rolling={live.rolling}
          parked={live.signalLabel !== "Live"}
        />
      </div>
    </div>
    <div
      className="truck-line-v4-cap w-[168px] shrink-0 leading-tight text-[#6B7280]"
      data-testid={`truck-line-current-location-${row.unit_id}`}
    >
      {live.signalLabel === "Live" || live.signalLabel === "Stale" ? (
        <div style={{ color: live.signalLabel === "Stale" ? RED : GREEN }}>
          {live.signalLabel} · {formatLocationLabel(row.position)}
          {live.signalLabel === "Stale" && row.position?.stale_minutes != null
            ? ` · ${formatStaleAge(row.position.stale_minutes) ?? "—"}`
            : ""}
        </div>
      ) : (
        <div style={{ color: RED }}>— last position unavailable</div>
      )}
    </div>
    </div>
  );
}


export function TruckLineBoard({
  operatingCompanyId,
  onLoadClick,
  onAssignDriver,
}: {
  operatingCompanyId: string;
  onLoadClick: (loadId: string) => void;
  // V10 (ROUND 18.6) — THE AVAILABLE TRUCK's "Assign a load →" pill opens the REAL assignment flow
  // (the same BookLoadModal every other Dispatch surface uses, prefilled by driver AND unit — a
  // dead button fails this box, per the Lead's own spec).
  onAssignDriver: (driverId: string, unitId: string | null) => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["truck-line", operatingCompanyId],
    queryFn: () => getTruckLine(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
  });
  const reasonsQuery = useQuery({
    queryKey: ["load-exception-reasons", operatingCompanyId],
    queryFn: () => listLoadExceptionReasons(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TruckLineStatusFilter>("all");
  // ROUND 23.1 D5 — a view preference only, never persisted (no storageKey — this board has none
  // by design and that stays true) and never re-fetched (sorting is client-side over rows already
  // in hand).
  const [sort, setSort] = useState<TruckLineSortState>(null);
  const cycleSort = (key: TruckLineSortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const [statusMenuLoadId, setStatusMenuLoadId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [stampPrompt, setStampPrompt] = useState<StampPromptState>(null);
  const [otherPrompt, setOtherPrompt] = useState<OtherPromptState>(null);
  const [otherReasonId, setOtherReasonId] = useState<string | null>(null);
  const [otherNote, setOtherNote] = useState("");
  const [stampBusy, setStampBusy] = useState(false);
  const [otherBusy, setOtherBusy] = useState(false);

  const applyLoadStatus = async (row: TruckLineRow, newStatus: string) => {
    if (!row.load?.load_id) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      await transitionDispatchLoad(row.load.load_id, operatingCompanyId, {
        new_status: newStatus as DispatchStatus,
      });
      setStatusMenuLoadId(null);
      await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
    } catch (err) {
      setStatusError(userFacingApiError(err, "Could not change status"));
    } finally {
      setStatusBusy(false);
    }
  };
  // Design contract rule 1 / guard (d): a refused transition must show the SERVER's own reason,
  // never fail silently — these surface whatever userFacingApiError derives from the rejection.
  const [stampError, setStampError] = useState<string | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);

  const allGroups: TruckLineGroup[] = query.data?.groups ?? [];
  const catalogReady = query.data?.catalog_ready ?? false;
  const reasons = reasonsQuery.data?.reasons ?? [];

  // LAW-5 (R-173): this board still wires useLoadCostRollups so every money figure it
  // touches comes from load-cost-rollup.sql.ts. ROUND 255 / 155.6: Net is NOT a column and
  // is not painted in the row — it only feeds the universal filter + load title tooltip.
  const truckLineLoadIds = useMemo(
    () => allGroups.flatMap((g) => g.legs.map((r) => r.load?.load_id).filter((id): id is string => !!id)),
    [allGroups],
  );
  const costRollups = useLoadCostRollups(operatingCompanyId, truckLineLoadIds);

  const searchedGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups
      .map((g) => {
        const legs = g.legs.filter((r) => {
          const rollup = r.load?.load_id ? costRollups.get(r.load.load_id) : undefined;
          const haystack = [
            g.unit_number,
            g.tour_display_id,
            r.unit_number,
            r.load?.load_number,
            r.load?.status,
            r.load?.customer_name,
            r.load?.pickup.city,
            r.load?.delivery.city,
            r.load?.trip_type,
            r.tour_display_id,
            ...r.drivers.map((d) => d.name),
            fmtApptDate(r.appointments?.pickup?.at),
            fmtApptDate(r.appointments?.delivery?.at),
            r.appointments?.pickup?.at,
            r.appointments?.delivery?.at,
            rollup ? formatMoneyCents(rollup.net_cents) : null,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
        if (legs.length === 0) return null;
        return { ...g, legs };
      })
      .filter((g): g is TruckLineGroup => g != null);
  }, [allGroups, search, costRollups]);

  // TRUCK-LINE-STATUS-FILTER — applied AFTER the text search and BEFORE the sort, so the two
  // narrow together and the sort always orders what is actually on screen. A group whose legs are
  // all filtered out drops out entirely rather than rendering an empty unit header.
  const statusFilteredGroups = useMemo(() => {
    if (statusFilter === "all") return searchedGroups;
    return searchedGroups
      .map((g) => {
        const legs = g.legs.filter((r) => legBuckets(g, r).includes(statusFilter));
        if (legs.length === 0) return null;
        return { ...g, legs };
      })
      .filter((g): g is TruckLineGroup => g != null);
  }, [searchedGroups, statusFilter]);

  // Sort within each section; never merge sections or duplicate unit_ids across top-level groups.
  const groups = useMemo(() => {
    const sortGroupLegs = (g: TruckLineGroup): TruckLineGroup => {
      if (!sort) return g;
      const withIndex = g.legs.map((r, i) => ({ r, i }));
      withIndex.sort((a, b) => {
        const cmp = compareTruckLineRows(a.r, b.r, sort.key) || a.i - b.i;
        return sort.dir === "desc" ? -cmp : cmp;
      });
      return { ...g, legs: withIndex.map((x) => x.r) };
    };
    const bySection = SECTION_ORDER.map((section) => {
      const sectionGroups = statusFilteredGroups.filter((g) => g.section === section).map(sortGroupLegs);
      if (!sort || sort.key !== "truck") return sectionGroups;
      return [...sectionGroups].sort((a, b) => {
        const cmp = naturalCompare(a.unit_number, b.unit_number);
        return sort.dir === "desc" ? -cmp : cmp;
      });
    });
    return bySection.flat();
  }, [statusFilteredGroups, sort]);

  const rowCount = groups.reduce((n, g) => n + g.legs.length, 0);

  // Top-bar counts from full unfiltered groups (not search-narrowed). Each count is the number of
  // LEGS the corresponding filter option would leave on the board, derived from legBuckets() — the
  // same function the filter itself calls — so "Rolling (8)" is a promise the board keeps when the
  // option is chosen. "All trucks" counts UNITS (groups), which is what the label says.
  const topBarStats = useMemo(() => {
    const n: Record<TruckLineStatusFilter, number> = {
      all: allGroups.length,
      rolling: 0,
      stopped: 0,
      signal_stale: 0,
      appointment_past: 0,
      available: 0,
    };
    for (const g of allGroups) {
      for (const r of g.legs) {
        for (const b of legBuckets(g, r)) {
          if (b !== "all") n[b] += 1;
        }
      }
    }
    return n;
  }, [allGroups]);

  // ROUND 155.6 — empty board renders empty state, never a stuck "Loading…".
  // isPending&&!isFetched is the only spinner window; once fetched (even with 0 groups), show empty.
  const showLoading = query.isPending && !query.isFetched;
  const showEmpty = !showLoading && !query.isError && groups.length === 0;

  const openStamp = (row: TruckLineRow, label: string, backendIndex: number) => {
    if (!row.load) return;
    // backendIndex 1 (Dispatched) is a pure LOAD STATUS transition (the same PATCH .../transition
    // route Kanban's own drag uses) — it has no stop of its own, unlike 2/3/5/6, which stamp a
    // real pickup/delivery arrival or departure.
    if (backendIndex === 1) {
      setStampPrompt({ row, label, kind: "transition" });
      return;
    }
    setStampPrompt({ row, label, kind: backendIndex === 3 || backendIndex === 6 ? "departure" : "arrival" });
  };
  const openOther = (row: TruckLineRow) => {
    if (!row.load) return;
    setOtherReasonId(null);
    setOtherNote("");
    setOtherPrompt({ row });
  };
  const closeOther = () => {
    setOtherPrompt(null);
    setOtherError(null);
    setOtherReasonId(null);
    setOtherNote("");
  };

  const confirmExceptionWith = async (reasonId: string, note: string) => {
    if (!otherPrompt?.row.load) return;
    const selected = reasons.find((r) => r.id === reasonId);
    if (selected?.code === "other" && note.trim().length === 0) {
      setOtherError('A note is required for "Other (note required)".');
      return;
    }
    setOtherBusy(true);
    setOtherError(null);
    try {
      await recordTruckLineException({
        operating_company_id: operatingCompanyId,
        load_id: otherPrompt.row.load.load_id,
        reason_id: reasonId,
        issue_category: selected?.code ?? "other",
        issue_description: note.trim() || (selected?.name ?? "Exception"),
        severity: "warning",
      });
      await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
      closeOther();
    } catch (err) {
      // Honest failure — leave the popover open so the dispatcher can retry, with the server's
      // own reason shown (guard item d's same rule applies here).
      setOtherError(userFacingApiError(err, "Could not record this exception"));
      setOtherReasonId(reasonId);
    } finally {
      setOtherBusy(false);
    }
  };
  const confirmException = () => confirmExceptionWith(otherReasonId ?? "", otherNote);

  // ROUND 200 (owner: "the status dropdown that will not close") — picking a reason used to only
  // ever set otherReasonId, which revealed a note field + a separate Save button every dispatcher
  // then had to click again, so the popover looked stuck open after the reason click that should
  // have been the whole action. "Other (note required)" still needs a note, so it still stops here
  // and waits for Save; every other reason now confirms and closes on the SAME click.
  const selectReason = (reasonId: string) => {
    const selected = reasons.find((r) => r.id === reasonId);
    if (selected?.code === "other") {
      setOtherReasonId(reasonId);
      return;
    }
    void confirmExceptionWith(reasonId, "");
  };

  const clearException = async () => {
    const row = otherPrompt?.row;
    const exceptionId = row?.station?.open_exception_id;
    if (!row || !exceptionId) {
      closeOther();
      return;
    }
    setOtherBusy(true);
    setOtherError(null);
    try {
      await resolveTruckLineException(exceptionId, operatingCompanyId);
      await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
      closeOther();
    } catch (err) {
      setOtherError(userFacingApiError(err, "Could not clear this exception"));
    } finally {
      setOtherBusy(false);
    }
  };

  return (
    <div data-testid="truck-line-board">
      {/* V7/V8 AUTO-FIT GRID (ROUND 18.5) — a plain CSS grid, never a ParityTable, for this one
          view: no resize handle, no reorder handle, no storageKey column state. The Line column is
          1fr so every station re-spaces itself as a percentage of whatever width is left, at every
          screen size — no board min-width, no horizontal scroll. Below 860px, Load and Live signal
          are hidden outright (3-column grid). Type is proportional via clamp() classes (V8 ruling
          2) so captions never collide at any width. */}
      <style>{`
        .truck-line-v4-header, .truck-line-v4-row {
          display: grid;
          grid-template-columns: ${GRID_TEMPLATE_COLUMNS};
          column-gap: 10px;
          align-items: center;
        }
        .truck-line-v4-header {
          height: 26px;
          padding: 0 10px;
          background: rgb(228,234,241);
          border-bottom: 1px solid ${LOCKED_BORDER};
          font-weight: 600;
          color: ${LOCKED_TEXT_SECONDARY};
        }
        /* TRUCK-LINE-ROW-HEIGHT (Lead, 09-30-2026, owner: "the height of each unit is still too
           tall"). Measured live: ~132px per unit. The track grew 52px -> 70px to stop the caption
           clipping above, so the row's own chrome is trimmed to absorb it — vertical padding
           3px -> 1px and min-height 56px -> 40px. Net effect is a SHORTER row than before, with
           captions and CURRENT LOCATION no longer overlapping. min-height only floors a row with
           no track (available trucks); loaded rows are sized by the track itself. */
        .truck-line-v4-row {
          padding: 1px 10px 1px 13px;
          border-bottom: 1px solid ${LOCKED_BORDER};
          min-height: 40px;
        }
        /* TRUCK-LINE-TRANSIT-IS-A-COLUMN — the sixth track. align-items:center on the grid keeps
           the 70px rail and the short text cells on one baseline, so the row is exactly as tall as
           the rail and never taller. */
        .truck-line-v4-transit-header { text-align: center; }
        /* The rail cell carries pr-7 so the Delivered caption is not clipped; the header mirrors it
           so TRANSIT and CURRENT LOCATION land on the same x as the body beneath them. */
        .truck-line-v4-transit-header > span:first-child { padding-right: 1.75rem; }
        /* CUSTOMER-UNDER-THE-THREE — the ROW (not the header) is a 2-row grid. Row 1 holds the five
           value cells; row 2 holds the customer name spanning UNIT+TOUR+LOAD. TRANSIT spans BOTH
           rows, so the 70px rail still sets the row height exactly as before and the two stacked
           text lines sit inside it. Placement is explicit so a 7th child can never auto-flow into
           the wrong track. */
        .truck-line-v4-row { grid-template-rows: auto auto; row-gap: 0; }
        /* SECTION-BAND — a full-width rule across the whole board, never a value in the UNIT
           column. Distinct from every cell's type so it cannot be misread as data. */
        .truck-line-v4-section-band {
          display: block;
          width: 100%;
          background: #E4EAF1;
          border-top: 1px solid #C9D4E0;
          border-bottom: 1px solid #C9D4E0;
          padding: 2px 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #4B5563;
        }
        .truck-line-v4-unit-cell { grid-column: 1; grid-row: 1; }
        .truck-line-v4-tour-cell { grid-column: 2; grid-row: 1; }
        .truck-line-v4-load-cell { grid-column: 3; grid-row: 1; }
        .truck-line-v4-pu-cell   { grid-column: 4; grid-row: 1; }
        .truck-line-v4-del-cell  { grid-column: 5; grid-row: 1; }
        .truck-line-v4-customer-row {
          grid-column: 1 / 4;
          grid-row: 2;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.1;
        }
        .truck-line-v4-transit-cell { grid-column: 6; grid-row: 1 / 3; align-self: center; }
        /* The LOAD column is now 13vw instead of 1fr (TRANSIT took the remainder), so a long
           customer name must truncate inside its own cell rather than widen the grid. The full name
           stays available on hover via title=. */
        .truck-line-v4-load-cell { min-width: 0; }
        /* ROUND-20.4 -- row rules the owner can actually see: an every-other-row tint and a hover
           state so one unit's row is visibly distinct from its neighbors, plus a 3px left spine per
           row (inline style, colored by trip-type -- see rowSpineColor()) so a unit's row is
           identifiable at a glance without reading its text. */
        /* TRUCK-LINE-UNIT-SEPARATION (Lead, 09-30-2026, owner: "no distinction between units, the
           lines for the rows"). nth-child(even) striped by ROW, but a unit running a round trip
           renders TWO rows — so the stripe cut a single unit in half and visually merged it with
           its neighbour. Striping is therefore keyed off the UNIT (data-unit-stripe, set once per
           unit group in the renderer), and the boundary between units gets a real 2px rule while
           legs of the SAME unit are separated only by a hairline. A unit is now one visual block
           whether it has one leg or three. */
        .truck-line-v4-row[data-unit-stripe="1"] { background: #F7FAFD; }
        .truck-line-v4-row[data-unit-first="true"] { border-top: 2px solid #9FB3C8; }
        .truck-line-v4-row[data-unit-first="false"] { border-top: 1px dotted #DBE3EC; }
        .truck-line-v4-row:hover { background: #F2F7FC; }
        /* ROUND 155.6 — PU / DEL / Leg / Tour # / Live signal centered like prior appt/signal. */
        .truck-line-v4-pu-header, .truck-line-v4-del-header, .truck-line-v4-leg-header,
        .truck-line-v4-tour-header, .truck-line-v4-signal-header,
        .truck-line-v4-pu-cell, .truck-line-v4-del-cell, .truck-line-v4-leg-cell,
        .truck-line-v4-tour-cell, .truck-line-v4-signal-cell { text-align: center; }
        /* TRUCK-LINE-TYPE-SCALE (Lead, 09-30-2026, owner: "the text size for the unit, tour, load,
           pu date delivery date, etc must be the same"). They were not: UNIT and LOAD used
           .truck-line-v4-unit at clamp(12,0.85vw,14) while TOUR, PU DATE and DELIVERY DATE used
           .truck-line-v4-sub at clamp(10,0.72vw,12) — three of the five header values a full step
           smaller than the other two. Rather than hand-matching the numbers (which is how they
           drifted apart in the first place), all five now read ONE custom property. Change the
           token, every primary cell value moves together; there is no second place to forget. */
        .truck-line-v4-header, .truck-line-v4-row { --tl-primary: clamp(12px, 0.85vw, 14px); }
        .truck-line-v4-unit, .truck-line-v4-primary { font-size: var(--tl-primary); }
        /* OWNER DECISION 2026-09-30: "you might actually need to reduce the text size of the pu and
           delivery date, it is larger than that of the text in tour, unit, load."
           MEASURED FIRST, in his own Chrome: the dates and UNIT/TOUR/LOAD were all rendering at
           exactly 14px -- identical, not larger. They READ larger because a ten-character date at
           14px dominates a four-character unit number in a 134px column, while UNIT sits in 62px.
           So this is a real readability problem with a wrong stated cause, and the fix he asked for
           is the right one: step the DATE VALUE down one notch and leave every other primary alone.
           Recorded honestly rather than silently, because the next person will measure it too. */
        .truck-line-v4-date { font-size: clamp(11px, 0.78vw, 12.5px); }
        .truck-line-v4-sub { font-size: clamp(10px, 0.72vw, 12px); }
        .truck-line-v4-cap { font-size: clamp(9px, 0.72vw, 11px); }
        .truck-line-v4-appt { font-size: clamp(11px, 0.8vw, 13px); }
        .truck-line-v4-cap-narrow { display: none; }
        /* THE AVAILABLE TRUCK (V10) — ghost route: dashed rail, hollow nodes, muted captions. */
        .truck-line-ghost-rail {
          background-image: repeating-linear-gradient(to right, #D8DFE6 0 6px, transparent 6px 11px);
        }
        .truck-line-ghost-node { background: #fff; border: 2px dashed #D8DFE6; }
        .truck-line-speech-bubble {
          font-size: clamp(9px, 0.72vw, 11px);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
        }
        .truck-line-speech-bubble::after {
          content: "";
          position: absolute;
          bottom: -6px;
          left: 14px;
          width: 10px;
          height: 10px;
          background: #fff;
          border-right: 1.5px solid #16A34A;
          border-bottom: 1.5px solid #16A34A;
          transform: rotate(45deg);
        }
        .truck-line-speech-bubble { animation: truck-line-bubble-nudge 2.6s ease-in-out infinite; }
        /* This media block must stay AFTER the base rules above — equal-specificity CSS resolves
           by SOURCE ORDER, not by whether a media query matches, so a later base rule would win
           over an earlier media-scoped override even while the query is active. (Found live: both
           spans rendered display:none at 856px until this block was moved below its base rules.) */
        /* TRUCK-LINE-04 -- caption-only fold, wider than the whole-grid fold below: same narrow
           captions, columns stay at full width/count. Placed BEFORE the whole-grid fold block so
           the narrower block's agreeing display rules for cap-full/cap-narrow win by source order
           in the overlapping range (both blocks want the same outcome there, so this is not the
           TRUCK-LINE-03 ordering hazard -- no property disagreement between the two). */
        @media (max-width: ${CAPTION_FOLD_BREAKPOINT_PX}px) {
          .truck-line-v4-cap-full { display: none; }
          .truck-line-v4-cap-narrow { display: inline; }
        }
        @media (max-width: ${FOLD_BREAKPOINT_PX}px) {
          .truck-line-v4-header, .truck-line-v4-row {
            grid-template-columns: ${GRID_TEMPLATE_COLUMNS_NARROW};
          }
          /* ROUND 200 — Load stays visible: Truck / Load / Tour # must read as three separate
             columns at every width. Only Live signal folds away here. */
          .truck-line-v4-signal-cell, .truck-line-v4-signal-header { display: none; }
          .truck-line-v4-cap-full { display: none; }
          .truck-line-v4-cap-narrow { display: inline; }
        }
        .truck-line-vehicle {
          position: absolute;
          transform: translateX(-50%);
          transition: left 1s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: auto;
          z-index: 5;
        }
        .truck-line-vehicle-svg .wheel, .truck-line-vehicle-svg .puff { transform-box: fill-box; transform-origin: center; }
        .truck-line-rolling .wheel { animation: truck-line-spin 0.55s linear infinite; }
        .truck-line-rolling { animation: truck-line-bob 1.1s ease-in-out infinite; }
        .truck-line-rolling .puff { animation: truck-line-exhaust 1.6s ease-out infinite; }
        @keyframes truck-line-spin { to { transform: rotate(360deg); } }
        @keyframes truck-line-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.2px); } }
        @keyframes truck-line-exhaust {
          0% { opacity: 0.55; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(-7px, -7px) scale(1.9); }
        }
        @keyframes truck-line-bubble-nudge {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .truck-line-vehicle { transition: none; }
          .truck-line-rolling, .truck-line-rolling .wheel, .truck-line-rolling .puff { animation: none; }
          .truck-line-speech-bubble { animation: none; }
        }
      `}</style>

      {!catalogReady ? (
        <div className="mb-2 rounded border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1.5 text-xs text-[#6B7280]" data-testid="truck-line-catalog-pending">
          Reason catalog not yet available — "Other" will list reasons as soon as it's published.
        </div>
      ) : null}
      {query.isError ? (
        <div className="mb-2">
          <ListErrorBanner message={userFacingApiError(query.error, "Could not load Truck Line")} onRetry={() => void query.refetch()} />
        </div>
      ) : null}

      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-[#1F2A44]" data-testid="truck-line-top-bar">
          <span className="font-semibold uppercase tracking-[0.3px] text-[#4B5563] text-section-header">Status</span>
          {/* TRUCKLINE-STATUS-COMBOBOX (Lead, 2026-09-30) — the owner asked for the house combo
              drop-down here twice; it was still a bare <SelectCombobox>, which is why it looked and
              behaved unlike every other filter in the app. This is components/Combobox, size
              "sm" so it keeps the h-7 rhythm of the row it sits in, with the SAME data-testid
              the previous control carried so every existing test and e2e selector still
              resolves. Counts stay in the labels — they are what make this filter worth
              opening. `null` (cleared) maps back to "all", the only honest neutral here: an
              empty status filter and "all trucks" are the same view. */}
          <div className="min-w-[200px]">
            <Combobox
              options={TRUCK_LINE_STATUS_FILTERS.map((f) => ({
                value: f.value,
                label: `${f.label} (${topBarStats[f.value]})`,
              }))}
              value={statusFilter}
              onChange={(v) => setStatusFilter((v as TruckLineStatusFilter | null) ?? "all")}
              size="sm"
              placeholder="All trucks"
              ariaLabel="Status"
              dataTestId="truck-line-status-filter"
            />
          </div>
        </label>
        {statusFilter !== "all" ? (
          <button
            type="button"
            className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs text-[#4B5563]"
            data-testid="truck-line-status-filter-clear"
            onClick={() => setStatusFilter("all")}
          >
            Clear
          </button>
        ) : null}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Unit, driver, customer, status, tour #, date…"
          className="h-7 min-w-0 flex-1 rounded-sm border border-[#E5E7EB] px-2 text-xs"
          style={{ maxWidth: 420 }}
          data-testid="truck-line-universal-filter"
        />
        <span className="text-xs text-[#6B7280]" data-testid="truck-line-row-count">{rowCount} rows</span>
        {statusError ? (
          <span className="text-xs text-[#DC2626]" data-testid="truck-line-status-error">{statusError}</span>
        ) : null}
      </div>

      <div className="min-w-0 overflow-x-auto rounded-sm border border-[#E5E7EB] bg-white" data-testid="truck-line-board-v4">
        <div className="truck-line-v4-header" data-testid="truck-line-column-order">
          <TruckLineSortHeader label="UNIT" sortKey="truck" active={sort?.key === "truck" ? sort.dir : null} onClick={cycleSort} />
          <TruckLineSortHeader label="TOUR" sortKey="tour" active={sort?.key === "tour" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-tour-header" />
          <TruckLineSortHeader label="LOAD" sortKey="load" active={sort?.key === "load" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-load-header" />
          <TruckLineSortHeader label="PU DATE" sortKey="pu" active={sort?.key === "pu" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-pu-header" />
          <TruckLineSortHeader label="DELIVERY DATE" sortKey="del" active={sort?.key === "del" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-del-header" />
          {/* TRANSIT is not sortable — it renders station progress, not a value to order by. It
              still needs a real header cell so the sixth track is labelled and the grid's header
              and body have the same number of children.

              OWNER-LIVE 2026-09-30 ("change the location header to the correct column, it was next
              to transit"): this was ONE centred cell reading "TRANSIT · CURRENT LOCATION" spanning
              the whole sixth track. But the BODY of that track is two things —
              [ rail, flex-1 ][ CURRENT LOCATION, fixed 168px, right ] — so the words CURRENT
              LOCATION sat centred over the RAIL while the locations themselves rendered 168px to
              the right, under nothing. The header now mirrors the body exactly: TRANSIT over the
              rail, CURRENT LOCATION over the column that actually holds it. The w-[168px]
              shrink-0 matches the body cell verbatim so the two can never drift apart. */}
          <div className="truck-line-v4-transit-header flex items-center">
            <span className="min-w-0 flex-1 text-center">TRANSIT</span>
            <span className="w-[168px] shrink-0 text-left">CURRENT LOCATION</span>
          </div>
        </div>

        {showLoading ? (
          <div className="p-4 text-xs text-[#6B7280]" data-testid="truck-line-loading">Loading…</div>
        ) : showEmpty ? (
          <div className="p-4 text-xs text-[#6B7280]" data-testid="truck-line-empty">
            No current trucks to show. Available and in-transit trucks appear here when they qualify.
          </div>
        ) : (
          SECTION_ORDER.map((section) => {
            const sectionGroups = groups.filter((g) => g.section === section);
            if (sectionGroups.length === 0) return null;
            return (
              <div key={section} data-testid={`truck-line-section-${section}`}>
                {/* SECTION-BAND (Lead, 09-30-2026, owner: "you have UNIT showing TOUR under and 11,
                    that does not belong there"). The band used .truck-line-v4-unit, so it inherited
                    the UNIT column's own type and read as a value sitting inside that column. It is
                    a full-width band across the board, not a cell — it says so now. */}
                <div
                  className="truck-line-v4-section-band"
                  data-testid={`truck-line-section-header-${section}`}
                >
                  {/* SECTION-BAND-COUNT (Lead, 09-30-2026, owner: "you have your 11, and there
                      are 15 active loads"). The band counted GROUPS — units/tours — while the band
                      RENDERS one row per LEG. Eleven units carrying fifteen legs printed "· 11"
                      above fifteen rows, so the header contradicted the thing it sat on top of and
                      the owner had to count rows by hand to find out which number was real. A band
                      counts WHAT IT SHOWS. Measured live 2026-09-30: TOUR said 11 over 15 rows. */}
                  {SECTION_LABEL[section]} · {sectionGroups.reduce((n, g) => n + g.legs.length, 0)}
                </div>
                {sectionGroups.map((g, groupIndex) =>
                  g.legs.map((r, legIndex) => {
                    // TRUCK-LINE-UNIT-SEPARATION: stripe by UNIT GROUP, not by row. A unit with a
                    // round trip renders several legs; striping per row split one unit across two
                    // tints and ran it into its neighbour. groupIndex is the unit's ordinal within
                    // its section, so every leg of a unit shares one tint, and only the FIRST leg
                    // carries the heavy 2px rule that marks where a new unit begins.
                    const unitStripe = groupIndex % 2 === 1 ? "1" : "0";
                    const unitFirst = legIndex === 0;
                    const prevLeg = legIndex > 0 ? g.legs[legIndex - 1] : null;
                    const returnTrip = isReturnTripLeg(prevLeg, r);
                    const conflict = hasScheduleConflict(prevLeg, r);
                    const tourNum = g.tour_display_id ?? r.tour_display_id ?? null;
                    // TRUCK-LINE-TOUR-GIBBERISH (Lead, 09-30-2026, owner: "the tour shows gibberish").
                    // This was a DENY-list: it printed whatever it was handed unless the string
                    // happened to match a 36-char UUID. Every other machine value passed straight to
                    // the screen — a dashless 32-char uuid, an internal settlement ref, a truncated
                    // id. A deny-list cannot be right here because we cannot enumerate every wrong
                    // shape; we CAN enumerate the two right ones. This column is
                    // "TOUR / PRE-SETTLEMENT" and the closed reconciliation fixes both forms:
                    // the open pre-settlement is P-#### and the settlement is the AlwaysTrack
                    // 4-digit document ("SETTLEMENT-NUMBER-IS-ALWAYSTRACK-DOC ... never S-YYYY-NNNN").
                    // Anything else is a machine id leaking into a human column and renders as "—".
                    const tourSafe = tourNum && (/^P-\d+$/i.test(tourNum) || /^\d{4}$/.test(tourNum)) ? tourNum : null;
                    const rowKey = `${g.section}-${g.unit_id}-${r.load?.load_id ?? r.available?.driver_id ?? legIndex}`;
                    const statusOpen = r.load?.load_id != null && statusMenuLoadId === r.load.load_id;

                    if (r.kind === "available" && r.available) {
                      const a = r.available;
                      const hosAgeLabel = a.hos_polled_minutes_ago != null ? `HOS polled ${a.hos_polled_minutes_ago} min ago` : "HOS polled — min ago";
                      return (
                        <div
                          key={rowKey}
                          className="truck-line-v4-row"
                          data-unit-stripe={unitStripe}
                          data-unit-first={unitFirst ? "true" : "false"}
                          style={{ background: AVAILABLE_ROW_TINT, borderLeft: `3px solid ${rowSpineColor(null)}` }}
                          data-testid={`truck-line-row-available-${a.driver_id}`}
                          data-unit-id={g.unit_id}
                        >
                          <div className="truck-line-v4-unit-cell">
                            <div className="truck-line-v4-unit font-semibold text-[#0F1219]">
                              <EntityLink kind="unit" id={r.unit_id} label={r.unit_number} className="font-semibold text-[#0F1219] underline" />
                            </div>
                            <div className="truck-line-v4-sub text-[#6B7280]">available truck</div>
                          </div>
                          <div className="truck-line-v4-tour-cell"><span className="truck-line-v4-sub text-[#6B7280]">—</span></div>
                          <div className="truck-line-v4-load-cell">
                            <button
                              type="button"
                              className="truck-line-v4-sub font-semibold text-[#166534] underline"
                              data-testid={`truck-line-assign-${a.driver_id}`}
                              onClick={() => onAssignDriver(a.driver_id, r.unit_id)}
                            >
                              Assign a load →
                            </button>
                            <div className="truck-line-v4-cap text-[#6B7280]">
                              {a.last_closed_load_number ? `Last load ${a.last_closed_load_number}` : "no load yet"}
                            </div>
                            <div className="truck-line-v4-cap text-[#6B7280]">{hosAgeLabel}</div>
                          </div>
                          <div className="truck-line-v4-pu-cell"><span className="truck-line-v4-sub text-[#6B7280]">—</span></div>
                          <div className="truck-line-v4-del-cell"><span className="truck-line-v4-sub text-[#6B7280]">—</span></div>
                          <div className="truck-line-v4-customer-row truck-line-v4-sub text-[#6B7280]" data-testid={`truck-line-customer-available-${a.driver_id}`}>—</div>
                          <div className="truck-line-v4-transit-cell min-w-0" data-testid={`truck-line-track-available-${a.driver_id}`}>
                            <span className="truck-line-v4-sub text-[#6B7280]">no trip in progress</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={rowKey}
                        className="truck-line-v4-row"
                          data-unit-stripe={unitStripe}
                          data-unit-first={unitFirst ? "true" : "false"}
                        style={{
                          borderLeft: `3px solid ${conflict ? RED : returnTrip ? GREEN : rowSpineColor(r.load?.trip_type)}`,
                        }}
                        data-testid={`truck-line-row-${g.unit_id}${legIndex > 0 ? `-leg-${legIndex}` : ""}`}
                        data-unit-id={g.unit_id}
                        data-return-trip={returnTrip ? "true" : "false"}
                        data-schedule-conflict={conflict ? "true" : "false"}
                      >
                        <div className="truck-line-v4-unit-cell">
                          <div className="truck-line-v4-unit font-semibold text-[#0F1219]">
                            {returnTrip ? <span className="mr-1 text-[#16A34A]" aria-hidden>↳</span> : null}
                            <EntityLink kind="unit" id={g.unit_id} label={g.unit_number} className="font-semibold text-[#0F1219] underline" />
                          </div>
                          {conflict ? (
                            <div className="truck-line-v4-cap font-semibold text-[#DC2626]" data-testid={`truck-line-schedule-conflict-${g.unit_id}`}>
                              CONFLICT
                            </div>
                          ) : returnTrip ? (
                            <div className="truck-line-v4-cap text-[#16A34A]" data-testid={`truck-line-return-trip-${g.unit_id}`}>
                              return trip
                            </div>
                          ) : null}
                        </div>
                        <div className="truck-line-v4-tour-cell" data-testid={`truck-line-tour-${g.unit_id}`}>
                          <span className="truck-line-v4-primary font-semibold text-[#0F1219]">{tourSafe ?? "—"}</span>
                        </div>
                        <div
                          className="truck-line-v4-load-cell relative"
                          data-testid={`truck-line-card-${g.unit_id}-${r.load?.load_id ?? legIndex}`}
                        >
                          {r.load ? (
                            <>
                              <button
                                type="button"
                                className="truck-line-v4-unit font-semibold text-[#0F1219] underline-offset-2 hover:underline"
                                data-testid={`truck-line-load-${r.load.load_id}`}
                                onDoubleClick={() => onLoadClick(r.load!.load_id)}
                                title={
                                  (() => {
                                    const rollup = costRollups.get(r.load.load_id);
                                    const net = rollup ? formatMoneyCents(rollup.net_cents) : "—";
                                    return `double-click opens load ${r.load.load_number ?? ""}; net ${net} (Load Costs)`;
                                  })()
                                }
                              >
                                {r.load.load_number}
                              </button>
                              {/* LOAD-SAYS-DISPATCHED (Lead, 09-30-2026, owner: "load should not say
                                  dispatch, I know it is dispatched"). Every row in the dispatched
                                  section is dispatched, so printing it on each row is noise that
                                  cost the LOAD column width. The status PICKER stays — it is how a
                                  dispatcher advances a load — but it is now a small caret on the
                                  load number instead of a word repeated down the board. */}
                              <button
                                type="button"
                                className="truck-line-v4-cap ml-1 rounded-sm px-1 text-[#6B7280] hover:bg-[#EEF2F6]"
                                title={`Status: ${(r.load.status ?? "—").replace(/_/g, " ")} — click to change`}
                                data-testid={`truck-line-status-trigger-${r.load.load_id}`}
                                onClick={() => setStatusMenuLoadId(statusOpen ? null : r.load!.load_id)}
                              >
                                ▾
                              </button>
                              {statusOpen ? (
                                <div
                                  className="absolute left-0 top-full z-40 mt-0.5 min-w-[140px] rounded-sm border border-[#E5E7EB] bg-white shadow-md"
                                  data-testid={`truck-line-status-dropdown-${r.load.load_id}`}
                                >
                                  {LOAD_STATUS_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={statusBusy}
                                      className="block w-full px-2 py-1 text-left text-xs hover:bg-[#F7F8FA] disabled:opacity-60"
                                      data-testid={`truck-line-status-option-${opt.value}`}
                                      onClick={() => void applyLoadStatus(r, opt.value)}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span className="truck-line-v4-sub text-[#6B7280]">—</span>
                          )}
                        </div>
                        <div className="truck-line-v4-pu-cell">
                          <div className="truck-line-v4-primary truck-line-v4-date text-[#0F1219]">{fmtApptDate(r.appointments?.pickup?.at)}</div>
                          <div className="truck-line-v4-cap text-[#6B7280]">
                            {formatLocationLabel({ city: r.load?.pickup.city ?? null, state: r.load?.pickup.state ?? null })}
                          </div>
                        </div>
                        <div className="truck-line-v4-del-cell">
                          <div className="truck-line-v4-primary truck-line-v4-date text-[#0F1219]">{fmtApptDate(r.appointments?.delivery?.at)}</div>
                          <div className="truck-line-v4-cap text-[#6B7280]">
                            {formatLocationLabel({ city: r.load?.delivery.city ?? null, state: r.load?.delivery.state ?? null })}
                          </div>
                        </div>
                        {/* CUSTOMER-UNDER-THE-THREE: its own grid row, spanning UNIT+TOUR+LOAD, so no
                            single column has to be wide enough to hold a full customer name and the
                            width goes to the transit line instead. */}
                        <div
                          className="truck-line-v4-customer-row truck-line-v4-sub text-[#6B7280]"
                          title={r.load?.customer_name ?? undefined}
                          data-testid={`truck-line-customer-${g.unit_id}`}
                        >
                          {r.load?.customer_name ?? "—"}
                        </div>
                        <div
                          className="truck-line-v4-transit-cell min-w-0"
                          data-testid={
                            r.load && r.station ? `truck-line-track-${g.unit_id}-${r.load.load_id}` : `truck-line-track-empty-${g.unit_id}`
                          }
                        >
                          {r.load && r.station ? (
                          <TruckLineTrack
                            row={r}
                            reasons={reasons}

                            otherPrompt={otherPrompt}
                            otherReasonId={otherReasonId}
                            otherNote={otherNote}
                            otherBusy={otherBusy}
                            otherError={otherError}
                            onAdvance={openStamp}
                            onOpenOther={openOther}
                            onCloseOther={closeOther}
                            onPickReason={selectReason}
                            onNoteChange={setOtherNote}
                            onConfirmException={confirmException}
                            onClearException={clearException}
                            onDragStatus={(row, newStatus) => void applyLoadStatus(row, newStatus)}
                          />
                          ) : (
                            <span className="truck-line-v4-sub text-[#6B7280]">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )}
      </div>

      {stampPrompt ? (
        <div className="fixed right-6 top-[118px] z-50 w-[350px] rounded-md border border-[#E5E7EB] bg-white text-xs shadow-lg" data-testid="truck-line-stamp-popover">
          <div className="flex h-[30px] items-center justify-between bg-[rgb(228,234,241)] px-2.5 font-semibold text-[#1F2A44]">
            <span>
              {stampPrompt.row.unit_number} · {stampPrompt.row.load?.load_number} · {stampPrompt.label}
            </span>
            <button type="button" onClick={() => { setStampPrompt(null); setStampError(null); }}>✕</button>
          </div>
          <div className="p-2.5">
            <div className="mb-1 flex items-center justify-between border-b border-[#E5E7EB] py-1">
              <span>Recorded by</span>
              <b>dispatcher (manual)</b>
            </div>
            <div className="flex items-center justify-between py-1">
              <span>Time</span>
              <b>now</b>
            </div>
            {stampError ? (
              <div className="mt-1 border border-[#DC2626] bg-[#FEF2F2] px-2 py-1 text-[#DC2626]" data-testid="truck-line-stamp-error">
                {stampError}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-1.5 border-t border-[#E5E7EB] p-2">
            <button type="button" className="h-7 rounded border border-[#E5E7EB] px-2.5" onClick={() => { setStampPrompt(null); setStampError(null); }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={stampBusy}
              className="h-7 rounded bg-[#14314F] px-2.5 text-white disabled:opacity-60"
              data-testid="truck-line-stamp-confirm"
              onClick={async () => {
                const { row, kind } = stampPrompt;
                if (!row.load) return;
                setStampBusy(true);
                setStampError(null);
                try {
                  if (kind === "transition") {
                    await transitionDispatchLoad(row.load.load_id, operatingCompanyId, { new_status: "dispatched" });
                  } else {
                    // Pickup/delivery stop_id isn't in the read-model row today — resolved via the
                    // load's own stop list at click time would need another fetch; kept minimal:
                    // the backend index maps 1:1 to pickup vs delivery, so the backend endpoints
                    // take loadId + stopId — the board fetches the load's stop ids lazily here to
                    // avoid bloating every row of the list response.
                    const isPickup = stampPrompt.label === "At pickup" || stampPrompt.label === "Loaded" || stampPrompt.label === "In transit";
                    const stopId = await resolveStopIdForStation(row, isPickup, operatingCompanyId);
                    if (!stopId) throw new Error("stop_not_resolved");
                    if (kind === "arrival") await stampTruckLineArrival(row.load.load_id, stopId, operatingCompanyId);
                    else await stampTruckLineDeparture(row.load.load_id, stopId, operatingCompanyId);
                  }
                  await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
                  setStampPrompt(null);
                } catch (err) {
                  // Design contract rule 1 / guard (d): show the server's own refusal reason —
                  // never fail silently.
                  setStampError(userFacingApiError(err, "Could not record this stamp"));
                } finally {
                  setStampBusy(false);
                }
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Lazily resolves the pickup/delivery stop_id for a station click — the truck-line read model
 * intentionally omits stop ids from every row (kept the response small); this reuses the SAME
 * stops-record read model the Load detail page's Stops tab already fetches, on demand, only when
 * a dispatcher actually clicks a node. */
async function resolveStopIdForStation(row: TruckLineRow, isPickup: boolean, operatingCompanyId: string): Promise<string | null> {
  if (!row.load) return null;
  const { getLoadStopsRecord } = await import("../../api/dispatch");
  const record = await getLoadStopsRecord(row.load.load_id, operatingCompanyId);
  const stop = isPickup
    ? record.stops.find((s) => s.stop_type === "pickup")
    : [...record.stops].reverse().find((s) => s.stop_type === "delivery");
  return stop?.stop_id ?? null;
}
