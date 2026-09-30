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
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { transitionDispatchLoad } from "../../api/dispatch";
import type { DispatchStatus } from "../../api/dispatch";
import { formatMoneyCents } from "../../components/dispatch/constants";
import { LOCKED_BORDER, LOCKED_TEXT_SECONDARY } from "../../design/locked-baseline-tokens";
import { useLoadCostRollups } from "../../hooks/useLoadCostRollups";
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

// ROUND 255 — UNIT · PRE-SETTLEMENT / TOUR · LOAD · PU DATE · DELIVERY DATE · [TRANSIT LINE].
// Transit line is a full-width sub-row that BEGINS under the LOAD column (padding-left matches
// the first three tracks). Leg / Live-signal columns retired from the header (signal + CURRENT
// LOCATION render after the transit line).
const GRID_TEMPLATE_COLUMNS =
  // TRUCK-LINE-FILL (Lead, 09-30-2026, owner: "the page still does not autoadjust"). MEASURED LIVE:
  // all five tracks were capped (8+9+11+9+9 = 46vw MAX) with no flexible track, so the grid could
  // never exceed ~46% of the viewport. On the owner's 1850px screen the board stopped at ~1010px and
  // ~840px rendered as empty white. It was not failing to adjust — it was told not to. LOAD now
  // takes 1fr and absorbs the remainder; the other four keep their min/max discipline.
  "minmax(88px,8vw) minmax(100px,9vw) minmax(120px,1fr) minmax(100px,9vw) minmax(100px,9vw)";
const GRID_TEMPLATE_COLUMNS_NARROW =
  "minmax(72px,14vw) minmax(84px,16vw) minmax(88px,18vw) minmax(72px,14vw) minmax(72px,14vw)";
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

// ROUND 200 (owner: "timeline out of proportion — 13635 (6 days) renders like 13626 (1 day)") —
// THE LINE's 7 station nodes are honest discrete progress markers (station.ts's own reached/next
// model), never repositioned onto a fabricated calendar axis for stations with no real stamp. What
// WAS missing: every row's track rendered at the same 100% width regardless of how long the trip
// actually spans, so a week-long NB/SB leg and a same-day local leg looked identical. This scales
// the track's own WIDTH (not the node positions inside it) to the load's real scheduled
// pickup->delivery window — the same appointments.pickup.at/delivery.at this board already reads
// for the appointment columns, never a second date source. TIMELINE_SCALE_MAX_DAYS=7 matches the
// existing 7-day "long leg" convention (RoundTripsTimeline.tsx's own longFlag threshold) so a
// week-or-longer trip fills the row and everything shorter is visibly, proportionally narrower.
const TIMELINE_SCALE_MAX_DAYS = 7;
const TIMELINE_MIN_WIDTH_PCT = 24; // never so narrow the 7 nodes + truck graphic can't fit legibly
function timelineWidthPercent(row: TruckLineRow): number {
  const puAt = row.appointments?.pickup?.at;
  const delAt = row.appointments?.delivery?.at;
  if (!puAt || !delAt) return 100; // no real schedule window known — full width, never fabricated
  const start = Date.parse(puAt);
  const end = Date.parse(delAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 100;
  const days = (end - start) / 86_400_000;
  const clamped = Math.min(Math.max(days, 0), TIMELINE_SCALE_MAX_DAYS);
  return TIMELINE_MIN_WIDTH_PCT + (clamped / TIMELINE_SCALE_MAX_DAYS) * (100 - TIMELINE_MIN_WIDTH_PCT);
}



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
  return (
    <svg
      className={`truck-line-vehicle-svg${isRolling ? " truck-line-rolling" : ""}`}
      style={parked ? { filter: "grayscale(.15)" } : undefined}
      width="74"
      height="34"
      viewBox="0 0 74 34"
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
  const trackWidthPct = timelineWidthPercent(row);

  // TRUCK-LINE-CAPTION-CLIP (Lead, 09-30-2026, owner: "the load timeline is wrong, you removed the
  // live location"). The live location was never removed — it was being painted ON TOP OF.
  // MEASURED: station captions render at top:54 inside a box that was h-[52px], so every caption
  // began 2px BELOW its own container and ran ~14px further, straight through the CURRENT LOCATION
  // line that follows with mt-0.5. The live DOM showed them merged as
  // "Loaded CURRENT LOCATION · Live · In transit, Springville, AL On time". 54 > 52 was the whole
  // defect. 70px clears the caption baseline; the row's padding is trimmed below so the total row
  // height does NOT grow (owner: "the height of each unit is still too tall").
  return (
    <div className="relative h-[70px]" data-testid={`truck-line-track-${row.unit_id}`}>
    <div
      className="relative mx-auto h-full"
      style={{ width: `${trackWidthPct}%`, maxWidth: "100%" }}
      data-testid={`truck-line-track-scale-${row.unit_id}`}
      data-timeline-width-pct={trackWidthPct.toFixed(1)}
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
            <div key={i} className="absolute" style={{ left: `${left}%`, top: 0 }}>
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
          <div key={i} className="absolute" style={{ left: `${left}%`, top: 0 }}>
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
        style={{ left: `${pct(live.v7Index)}%`, top: 12, cursor: "grab", touchAction: "none" }}
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
        <TractorTrailerSvg hasIssue={has_open_exception} rolling={live.rolling} />
      </div>
    </div>
    <div
      className="truck-line-v4-cap mt-0.5 text-center text-[#6B7280]"
      data-testid={`truck-line-current-location-${row.unit_id}`}
    >
      CURRENT LOCATION ·{" "}
      {live.signalLabel === "Live" || live.signalLabel === "Stale" ? (
        <span style={{ color: live.signalLabel === "Stale" ? RED : GREEN }}>
          {live.signalLabel} · {formatLocationLabel(row.position)}
          {live.signalLabel === "Stale" && row.position?.stale_minutes != null
            ? ` · ${formatStaleAge(row.position.stale_minutes) ?? "—"}`
            : ""}
        </span>
      ) : (
        <span style={{ color: RED }}>— last position unavailable</span>
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
      const sectionGroups = searchedGroups.filter((g) => g.section === section).map(sortGroupLegs);
      if (!sort || sort.key !== "truck") return sectionGroups;
      return [...sectionGroups].sort((a, b) => {
        const cmp = naturalCompare(a.unit_number, b.unit_number);
        return sort.dir === "desc" ? -cmp : cmp;
      });
    });
    return bySection.flat();
  }, [searchedGroups, sort]);

  const rowCount = groups.reduce((n, g) => n + g.legs.length, 0);

  // Top-bar counts from full unfiltered groups (not search-narrowed).
  const topBarStats = useMemo(() => {
    let rolling = 0;
    let stopped = 0;
    let signalStale = 0;
    let appointmentPast = 0;
    let available = 0;
    for (const g of allGroups) {
      if (g.section === "available") {
        available++;
        continue;
      }
      for (const r of g.legs) {
        if (r.load && r.station) {
          const live = deriveLiveStation(r, mapReachedIndexToV7(r.station.reached_index));
          if (live.signalLabel === "Stale") signalStale++;
          else if (live.rolling) rolling++;
          else stopped++;
        }
        if (r.next_appointment?.late) appointmentPast++;
      }
    }
    return { allTrucks: allGroups.length, rolling, stopped, signalStale, appointmentPast, available };
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
        /* ROUND-20.4 -- row rules the owner can actually see: an every-other-row tint and a hover
           state so one unit's row is visibly distinct from its neighbors, plus a 3px left spine per
           row (inline style, colored by trip-type -- see rowSpineColor()) so a unit's row is
           identifiable at a glance without reading its text. */
        .truck-line-v4-row:nth-child(even) { background: #FAFCFE; }
        .truck-line-v4-row:hover { background: #F2F7FC; }
        /* ROUND 155.6 — PU / DEL / Leg / Tour # / Live signal centered like prior appt/signal. */
        .truck-line-v4-pu-header, .truck-line-v4-del-header, .truck-line-v4-leg-header,
        .truck-line-v4-tour-header, .truck-line-v4-signal-header,
        .truck-line-v4-pu-cell, .truck-line-v4-del-cell, .truck-line-v4-leg-cell,
        .truck-line-v4-tour-cell, .truck-line-v4-signal-cell { text-align: center; }
        .truck-line-v4-unit { font-size: clamp(12px, 0.85vw, 14px); }
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

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#1F2A44]" data-testid="truck-line-top-bar">
        <span>
          All trucks (<b>{topBarStats.allTrucks}</b>)
        </span>
        <span>
          Rolling (<b>{topBarStats.rolling}</b>)
        </span>
        <span>
          Stopped (<b>{topBarStats.stopped}</b>)
        </span>
        <span>
          Signal stale (<b style={{ color: RED }}>{topBarStats.signalStale}</b>)
        </span>
        <span>
          Appointment past (<b style={{ color: RED }}>{topBarStats.appointmentPast}</b>)
        </span>
        <span>
          Available (<b style={{ color: GREEN }}>{topBarStats.available}</b>)
        </span>
      </div>

      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
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
          <TruckLineSortHeader label="TOUR / PRE-SETTLEMENT" sortKey="tour" active={sort?.key === "tour" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-tour-header" />
          <TruckLineSortHeader label="LOAD" sortKey="load" active={sort?.key === "load" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-load-header" />
          <TruckLineSortHeader label="PU DATE" sortKey="pu" active={sort?.key === "pu" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-pu-header" />
          <TruckLineSortHeader label="DELIVERY DATE" sortKey="del" active={sort?.key === "del" ? sort.dir : null} onClick={cycleSort} className="truck-line-v4-del-header" />
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
                <div
                  className="truck-line-v4-unit border-b border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-0.5 font-semibold uppercase text-[#4B5563]"
                  style={{ fontSize: 11, letterSpacing: "0.02em" }}
                  data-testid={`truck-line-section-header-${section}`}
                >
                  {SECTION_LABEL[section]} ({sectionGroups.length})
                </div>
                {sectionGroups.map((g) =>
                  g.legs.map((r, legIndex) => {
                    const prevLeg = legIndex > 0 ? g.legs[legIndex - 1] : null;
                    const returnTrip = isReturnTripLeg(prevLeg, r);
                    const conflict = hasScheduleConflict(prevLeg, r);
                    const tourNum = g.tour_display_id ?? r.tour_display_id ?? null;
                    const tourSafe = tourNum && /^P-\d+$/i.test(tourNum) ? tourNum : tourNum && !/^[0-9a-f-]{36}$/i.test(tourNum) ? tourNum : null;
                    const rowKey = `${g.section}-${g.unit_id}-${r.load?.load_id ?? r.available?.driver_id ?? legIndex}`;
                    const statusOpen = r.load?.load_id != null && statusMenuLoadId === r.load.load_id;

                    if (r.kind === "available" && r.available) {
                      const a = r.available;
                      const hosAgeLabel = a.hos_polled_minutes_ago != null ? `HOS polled ${a.hos_polled_minutes_ago} min ago` : "HOS polled — min ago";
                      return (
                        <div
                          key={rowKey}
                          className="truck-line-v4-row"
                          style={{ background: AVAILABLE_ROW_TINT, borderLeft: `3px solid ${rowSpineColor(null)}` }}
                          data-testid={`truck-line-row-available-${a.driver_id}`}
                          data-unit-id={g.unit_id}
                        >
                          <div>
                            <div className="truck-line-v4-unit font-semibold text-[#0F1219]">{r.unit_number}</div>
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
                        </div>
                      );
                    }

                    return (
                      <Fragment key={rowKey}>
                      <div
                        className="truck-line-v4-row"
                        style={{
                          borderLeft: `3px solid ${conflict ? RED : returnTrip ? GREEN : rowSpineColor(r.load?.trip_type)}`,
                          borderBottom: r.load && r.station ? "none" : undefined,
                        }}
                        data-testid={`truck-line-row-${g.unit_id}${legIndex > 0 ? `-leg-${legIndex}` : ""}`}
                        data-unit-id={g.unit_id}
                        data-return-trip={returnTrip ? "true" : "false"}
                        data-schedule-conflict={conflict ? "true" : "false"}
                      >
                        <div>
                          <div className="truck-line-v4-unit font-semibold text-[#0F1219]">
                            {returnTrip ? <span className="mr-1 text-[#16A34A]" aria-hidden>↳</span> : null}
                            {g.unit_number}
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
                          <span className="truck-line-v4-sub font-semibold text-[#0F1219]">{tourSafe ?? "—"}</span>
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
                              <div className="truck-line-v4-sub text-[#6B7280]">{r.load.customer_name ?? "—"}</div>
                              <button
                                type="button"
                                className="truck-line-v4-cap mt-0.5 rounded-sm border border-[#E5E7EB] px-1.5 py-0.5 font-semibold uppercase text-[#4B5563]"
                                style={{ fontSize: 11 }}
                                data-testid={`truck-line-status-trigger-${r.load.load_id}`}
                                onClick={() => setStatusMenuLoadId(statusOpen ? null : r.load!.load_id)}
                              >
                                {(r.load.status ?? "—").replace(/_/g, " ")}
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
                          <div className="truck-line-v4-sub text-[#0F1219]">{fmtApptDate(r.appointments?.pickup?.at)}</div>
                          <div className="truck-line-v4-cap text-[#6B7280]">
                            {formatLocationLabel({ city: r.load?.pickup.city ?? null, state: r.load?.pickup.state ?? null })}
                          </div>
                        </div>
                        <div className="truck-line-v4-del-cell">
                          <div className="truck-line-v4-sub text-[#0F1219]">{fmtApptDate(r.appointments?.delivery?.at)}</div>
                          <div className="truck-line-v4-cap text-[#6B7280]">
                            {formatLocationLabel({ city: r.load?.delivery.city ?? null, state: r.load?.delivery.state ?? null })}
                          </div>
                        </div>
                      </div>
                      {r.load && r.station ? (
                        <div
                          className="border-b border-[#E5E7EB] pb-1 pt-0.5"
                          style={{ paddingLeft: "max(12rem, 17vw)", paddingRight: 10 }}
                          data-testid={`truck-line-track-${g.unit_id}-${r.load.load_id}`}
                        >
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
                        </div>
                      ) : null}
                      </Fragment>
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
