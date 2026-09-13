/**
 * TRUCK LINE — 5th Dispatch board view (owner ruling 2026-09-11, Lead assignment).
 *
 * V7/V8 (ROUND 18.5, 2026-09-11 ~20:55/21:05 CT — owner, looking at a render built from LIVE
 * USMCA prod): "yes this one is perfect" + "we are also missing the next appointment column" +
 * "in other we can select breakdown, late, etc. if there are no issues, we can change to on time,
 * etc." This is the current, locked shape of the board — it supersedes the earlier V4 4-column /
 * 9-station layout entirely.
 *
 * FIVE COLUMNS: Truck (unit + driver) | Load (number + pill + lane) | Line (1fr, auto-fit) |
 * Next appointment | Live signal. Below 860px, Load and Live signal are hidden entirely (grid
 * drops to 3 tracks) — nothing folds into another cell, matching the Lead's literal spec.
 *
 * THE LINE is 7 stations: Dispatched · At pickup · Loaded · In transit · [status] · At delivery ·
 * Delivered. station.ts (backend) still owns the ONLY pure derivation of progress — it was NOT
 * changed for this view, and it still exposes its own 9-index model (assigned/dispatched/
 * at_pickup/in_transit/other/at_delivery/delivered/docs_received/invoiced) because OTHER surfaces
 * (guard (b)/(h), its own unit tests) depend on that shape. V7_STATIONS below is a DOCUMENTED,
 * honest FRONTEND-ONLY regrouping of that same 9-index signal into the 7 labels the owner asked
 * for — never a second source of truth: "Loaded" and "In transit" share the identical backend
 * signal (pickup departure), because there is no distinct real stamp for "just loaded, still
 * parked" vs. "now rolling" in the schema today; "Assigned" (never reached before this board shows
 * a row) and "Docs received"/"Invoiced" (post-delivery paperwork, out of this in-route view's
 * scope per the owner's own "current loads only" data law) are simply not drawn.
 *
 * THE MIDDLE STATION IS A STATUS STATION, NOT A LABEL (V8, RULING 1): it shows "On time" (green,
 * solid border — a real state, not a missing stamp) when the load has no open
 * dispatch.intransit_issues row, or the exception's own reason name (red) when one is open.
 * Clicking it opens a reason list ANCHORED ABOVE the node, fetched live from GET /api/v1/
 * catalogs/load-exception-reasons (never hardcoded — a reason the owner adds in Lists › Catalogs
 * appears with no deploy), with a final green "✓ No exception — on time" row that RESOLVES the
 * open issue (void-not-delete: the resolved row is retained, never deleted).
 *
 * PROPORTIONAL TYPE (V8, RULING 2): four CSS custom classes (.truck-line-v4-unit/-sub/-cap/-appt)
 * carry clamp()-based font sizes so captions never collide and never grow out of proportion at any
 * window width — this is IN ADDITION TO the 1fr auto-fit Line column, not a replacement for it.
 *
 * LIVE POSITION RULE (own section below, `deriveLiveStation`): the moving truck's on-screen
 * station is derived from telematics.vehicle_latest_position (speed_mph, engine_state, city) —
 * NEVER fabricated. With a fresh (<=60min) ping: speed>0 + engine on -> "In transit", rolling;
 * speed 0 + city matches the pickup -> "At pickup", parked; city matches the delivery -> "At
 * delivery", parked; otherwise -> "In transit", parked. With a stale or missing ping, the truck
 * sits on the last STAMPED node (the honest fallback) and the Live signal column says so in red.
 * THREE DATA GAPS presently make the rail mostly dashed even while the truck glides ahead of it on
 * live telemetry — that mismatch is the current honest state, not a bug: 0 of 14 USMCA stops are
 * geocoded, 0 arrival/departure stamps exist on any of them, and geofence "approaching/idle" rows
 * are being detected (geo.geofence_vehicle_state) but never linked to a stamp. Closing those is
 * this seat's next PR after this view ships.
 *
 * DATA RULE (owner, repeated 2026-09-11): any view reachable from Dispatch shows CURRENT loads and
 * pre-settlement data only. This view's read model never reads presettlement_link_id at all (grep-
 * verified) — the 2026-09-12 01:21:49Z presettlement_link_id unlink some other surface hit does not
 * reach this board.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { transitionDispatchLoad } from "../../api/dispatch";
import {
  getTruckLine,
  listLoadExceptionReasons,
  recordTruckLineException,
  resolveTruckLineException,
  stampTruckLineArrival,
  stampTruckLineDeparture,
  type TruckLineRow,
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
const NAVY = "#14314F";
const NAVY_DARK = "#0E2439";
const RED_DARK = "#B91C1C";
const ON_TIME_GREEN = "#166534";
const ON_TIME_FILL = "#ECFDF3";
const EXCEPTION_RED = "#991B1B";

// V7/V8 AUTO-FIT GRID (ROUND 18.5, owner ruling) — Truck | Load | Line (1fr) | Next appointment |
// Live signal. Never a ParityTable, never resizable/reorderable, no stored column state. Below
// 860px, columns 2 (Load) and 5 (Live signal) are hidden outright (not folded elsewhere). Columns
// 1-2 widened in V10 (ROUND 18.6, owner ruling 21:30 CT) so unit/driver/load-number/lane never
// truncate; columns 4-5 are center-aligned, header and cells both (same ruling).
const GRID_TEMPLATE_COLUMNS = "minmax(140px,10vw) minmax(160px,12vw) 1fr minmax(158px,12vw) minmax(156px,12vw)";
const GRID_TEMPLATE_COLUMNS_NARROW = "minmax(108px,26vw) 1fr minmax(132px,27vw)";
const FOLD_BREAKPOINT_PX = 860;
// TRUCK-LINE-04 (found live at 1024px, one of the 5 required breakpoints, during this seat's own
// V10 verification pass): V10's ROUND 18.6 widening of columns 1-2 (Truck/Load) shrank the Line
// column's own share of the grid, so the FULL 7-station captions (still at the .cap clamp() floor
// of 9px) started colliding again well above the whole-grid FOLD_BREAKPOINT_PX -- measured live via
// getBoundingClientRect on every `.truck-line-v4-cap`, first real overlap at 1080px, clean at 1090+.
// A SEPARATE, wider breakpoint swaps to the SAME narrow captions (Disp./Pickup/Transit/etc.) that
// already exist for the 860px whole-grid fold, WITHOUT collapsing the Load/Live-signal columns --
// this is a caption-only response, not a column-count change, so it stays inside the owner's
// "auto-adjust to screen size" ruling rather than hiding columns earlier than necessary.
const CAPTION_FOLD_BREAKPOINT_PX = 1180;
const AVAILABLE_ROW_TINT = "color-mix(in srgb, #16A34A 4%, #fff)";

// ROUND-20.4 -- 3px left spine per row, colored by the unit's current trip leg, so a unit's row is
// identifiable at a glance without reading its text. No load (including the available-truck rows,
// which never carry r.load) gets the neutral border color, never a semantic one.
const ROW_SPINE_NO_LOAD = "#C7D2DC";
const ROW_SPINE_BY_TRIP_TYPE: Record<string, string> = { NB: "#1f2a44", TR: "#b45309", SB: "#475569" };
function rowSpineColor(tripType: string | null | undefined): string {
  return (tripType && ROW_SPINE_BY_TRIP_TYPE[tripType]) || ROW_SPINE_NO_LOAD;
}

function pct(index: number) {
  return (index / (V7_COUNT - 1)) * 100;
}

function money(cents: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtStamp(at: string | null | undefined) {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago" });
}

function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalHours = Math.floor(abs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

// V10 (ROUND 18.6) — samsara.hos_snapshots' driving_hours_remaining/cycle_hours_remaining columns
// are misleadingly named: verified live (schema + real values, e.g. 660.00 for an 11-hour driver,
// 2560.00 for 42h40m) that they store MINUTES. The backend exposes the raw minutes as-is; this is
// the ONE place that converts to "11h 00m", so server and client formatting can never drift apart.
function fmtHoursMinutes(totalMinutes: number | null): string | null {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) return null;
  const whole = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(whole / 60);
  const minutes = whole % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
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
  signalDetail: string | null;
};

/** LIVE POSITION RULE (V7, own section) — see the file header. Never fabricates a position: a
 * stale or absent ping always falls back to the last STAMPED node. */
function deriveLiveStation(row: TruckLineRow, v7ReachedIndex: number): LiveStation {
  const parkedFallback = Math.max(v7ReachedIndex, 0);
  const pos = row.position;
  if (!pos) return { v7Index: parkedFallback, rolling: false, signalLabel: "No ping", signalDetail: null };
  if (pos.stale) {
    return { v7Index: parkedFallback, rolling: false, signalLabel: "Stale", signalDetail: pos.stale_minutes != null ? `${pos.stale_minutes} min ago` : null };
  }
  const engineOn = typeof pos.engine_state === "string" && /on|running/i.test(pos.engine_state);
  const speed = pos.speed_mph ?? 0;
  if (speed > 0 && engineOn) {
    return { v7Index: 3, rolling: true, signalLabel: "Live", signalDetail: null };
  }
  const pickupCity = row.load?.pickup.city;
  const deliveryCity = row.load?.delivery.city;
  if (pos.city && pickupCity && pos.city === pickupCity) {
    return { v7Index: 1, rolling: false, signalLabel: "Live", signalDetail: null };
  }
  if (pos.city && deliveryCity && pos.city === deliveryCity) {
    return { v7Index: 5, rolling: false, signalLabel: "Live", signalDetail: null };
  }
  return { v7Index: 3, rolling: false, signalLabel: "Live", signalDetail: null };
}

/** TRACTOR-TRAILER (74x34) — verbatim from the Lead's locked V7 render, CAB/CABDARK substituted.
 * V10's `parked` variant (THE AVAILABLE TRUCK) mutes the cab to #2F5069/#22394C and desaturates the
 * whole graphic (grayscale(.15)) — never rolling, never puffing, regardless of the `rolling` prop. */
function TractorTrailerSvg({ hasIssue, rolling, parked }: { hasIssue: boolean; rolling: boolean; parked?: boolean }) {
  const cab = parked ? "#2F5069" : hasIssue ? RED : NAVY;
  const cabDark = parked ? "#22394C" : hasIssue ? RED_DARK : NAVY_DARK;
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

/** YARD DOCK (34x26) — THE AVAILABLE TRUCK's own dock icon (V10, ROUND 18.6). No verbatim
 * reference file for this one exists on this machine (checked: only a same-day .md relay of the
 * Lead's written instructions, no HTML render) — built directly from the spec's own description
 * (green, 34x26, at left:0% of the track), sharing WarehouseDockSvg's structure/proportions so the
 * two dock icons read as one family, with a green roof honestly marking "yard", not a shipper. */
function YardDockSvg() {
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
      <ellipse cx="17" cy="24.2" rx="13.6" ry="1.5" fill="#0F172A" opacity=".12" />
      <path d="M2.3 10 17 2.6 31.7 10v1.7H2.3z" fill="#16A34A" />
      <rect x="3.9" y="11.6" width="26.2" height="12.2" rx="1" fill="#F0FBF4" stroke="#86D2A3" strokeWidth=".8" />
      <rect x="6.4" y="14.4" width="6" height="9.4" rx=".6" fill="#DCF3E4" stroke="#8FCDA8" strokeWidth=".6" />
      <path d="M6.4 16.6h6M6.4 18.8h6M6.4 21h6" stroke="#A9DDBB" strokeWidth=".6" />
      <rect x="14" y="14.4" width="6" height="9.4" rx=".6" fill="#DCF3E4" stroke="#8FCDA8" strokeWidth=".6" />
      <path d="M14 16.6h6M14 18.8h6M14 21h6" stroke="#A9DDBB" strokeWidth=".6" />
      <rect x="21.6" y="14.4" width="6" height="9.4" rx=".6" fill="#DCF3E4" stroke="#8FCDA8" strokeWidth=".6" />
      <path d="M21.6 16.6h6M21.6 18.8h6M21.6 21h6" stroke="#A9DDBB" strokeWidth=".6" />
      <rect x="3.9" y="23" width="26.2" height="1.3" fill="#6FAE84" />
    </svg>
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
        <div className="absolute left-0 right-0 top-[41px] h-[3px] rounded bg-[#C7D2DC]" />
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

  return (
    <div className="relative h-[62px]" data-testid={`truck-line-track-${row.unit_id}`}>
      <WarehouseDockSvg roof="#1f2a44" />
      <div className="absolute" style={{ left: `${pct(1)}%`, top: 2, transform: "translateX(-50%)" }}>
        <WarehouseDockSvg roof="#1f2a44" />
      </div>
      <div className="absolute" style={{ left: `${pct(5)}%`, top: 2, transform: "translateX(-50%)" }}>
        <WarehouseDockSvg roof="#475569" />
      </div>

      <div className="absolute left-0 right-0 top-[41px] h-[3px] rounded bg-[#C7D2DC]" />
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
                  className="absolute z-50 rounded-md border border-[#C7D2DC] bg-white text-xs shadow-lg"
                  style={{ bottom: 78, left: "50%", transform: "translateX(-50%)", width: "min(260px,64vw)" }}
                  data-testid={`truck-line-status-popover-${row.unit_id}`}
                >
                  <div className="flex h-[26px] items-center justify-between bg-[rgb(228,234,241)] px-2 font-semibold text-[#374151]">
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
                        className="h-6 flex-1 rounded border border-[#C7D2DC] px-1.5"
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
            <span className="truck-line-v4-cap absolute whitespace-nowrap text-[#374151]" style={{ top: 54, left: "50%", transform: "translateX(-50%)" }}>
              <span className="truck-line-v4-cap-full">{st.name}</span>
              <span className="truck-line-v4-cap-narrow">{NARROW_STATION_CAPTIONS[st.name] ?? st.name}</span>
            </span>
          </div>
        );
      })}

      <div
        className="truck-line-vehicle"
        style={{ left: `${pct(live.v7Index)}%`, top: 15 }}
        data-testid={`truck-line-vehicle-${row.unit_id}`}
        data-rolling={live.rolling ? "true" : "false"}
      >
        <TractorTrailerSvg hasIssue={has_open_exception} rolling={live.rolling} />
      </div>
    </div>
  );
}

/** THE AVAILABLE TRUCK (V10, ROUND 18.6) — the owner's favourite: a truck with no load NEVER
 * prints "no load on this truck" (that literal string must never render on this board — asserted
 * statically by the guard). Same 62px track, a different honest story: a parked truck, muted and
 * still, with the route ahead drawn as a GHOST (dashed rail, hollow nodes) because nothing has
 * been booked yet, a speech bubble naming the driver's real remaining drive time, and a real
 * "Assign a load →" action wired to the SAME BookLoadModal flow the rest of Dispatch uses (never a
 * dead button). */
function AvailableTruckTrack({ row, onAssign }: { row: TruckLineRow; onAssign: (driverId: string, unitId: string | null) => void }) {
  const a = row.available;
  if (!a) return null;
  const driveLabel = fmtHoursMinutes(a.driving_minutes_remaining);
  return (
    <div className="relative h-[80px]" data-testid={`truck-line-available-track-${a.driver_id}`}>
      <div className="absolute" style={{ left: "0%", top: 2 }}>
        <YardDockSvg />
      </div>

      <div className="truck-line-ghost-rail absolute left-0 right-0 top-[41px] h-[3px]" />
      {V7_STATIONS.map((st, i) => (
        <div key={i} className="absolute" style={{ left: `${pct(i)}%`, top: 0 }}>
          <div className="truck-line-ghost-node absolute rounded-full" style={{ top: 34, width: 17, height: 17, transform: "translateX(-50%)" }} />
          <span className="truck-line-v4-cap absolute whitespace-nowrap" style={{ top: 54, left: "50%", transform: "translateX(-50%)", color: "#AEB8C2" }}>
            <span className="truck-line-v4-cap-full">{st.name === "status" ? "Status" : st.name}</span>
            <span className="truck-line-v4-cap-narrow">{st.name === "status" ? "Status" : NARROW_STATION_CAPTIONS[st.name] ?? st.name}</span>
          </span>
        </div>
      ))}

      <div className="truck-line-vehicle" style={{ left: "7%", top: 15 }} data-testid={`truck-line-vehicle-available-${a.driver_id}`} data-rolling="false">
        <TractorTrailerSvg hasIssue={false} rolling={false} parked />
        {driveLabel ? (
          <div className="truck-line-speech-bubble absolute whitespace-nowrap rounded-[13px] border-[1.5px] border-[#16A34A] bg-white px-2 py-1 font-semibold text-[#166534]" style={{ bottom: 38, left: 0 }}>
            Load me — {driveLabel} drive left
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="absolute rounded-[13px] bg-[#16A34A] px-3 font-semibold text-white"
        style={{ right: 4, top: 18, height: 26 }}
        onClick={() => onAssign(a.driver_id, row.unit_id)}
        data-testid={`truck-line-assign-${a.driver_id}`}
      >
        Assign a load →
      </button>

      <span className="truck-line-v4-sub absolute whitespace-nowrap text-[#6B7280]" style={{ top: 64, left: 0 }}>
        parked at {a.parked_city ?? "—"}
        {a.parked_state ? `, ${a.parked_state}` : ""} · waiting on dispatch
      </span>
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
  const [stampPrompt, setStampPrompt] = useState<StampPromptState>(null);
  const [otherPrompt, setOtherPrompt] = useState<OtherPromptState>(null);
  const [otherReasonId, setOtherReasonId] = useState<string | null>(null);
  const [otherNote, setOtherNote] = useState("");
  const [stampBusy, setStampBusy] = useState(false);
  const [otherBusy, setOtherBusy] = useState(false);
  // Design contract rule 1 / guard (d): a refused transition must show the SERVER's own reason,
  // never fail silently — these surface whatever userFacingApiError derives from the rejection.
  const [stampError, setStampError] = useState<string | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);

  const allRows = query.data?.rows ?? [];
  const catalogReady = query.data?.catalog_ready ?? false;
  const reasons = reasonsQuery.data?.reasons ?? [];

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => {
      const haystack = [
        r.unit_number,
        r.load?.load_number,
        r.load?.customer_name,
        r.load?.pickup.city,
        r.load?.delivery.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRows, search]);

  // V10 (ROUND 18.6) — top-bar counts, ALL computed from the live rows just fetched, none
  // hardcoded. Counted against the full unfiltered set (allRows), not the search-narrowed one, so
  // the summary always describes the whole board.
  const topBarStats = useMemo(() => {
    let rolling = 0;
    let stopped = 0;
    let signalStale = 0;
    let appointmentPast = 0;
    let available = 0;
    for (const r of allRows) {
      if (r.kind === "available") {
        available++;
        continue;
      }
      if (r.load && r.station) {
        const live = deriveLiveStation(r, mapReachedIndexToV7(r.station.reached_index));
        if (live.signalLabel === "Stale") signalStale++;
        else if (live.rolling) rolling++;
        else stopped++;
      }
      if (r.next_appointment?.late) appointmentPast++;
    }
    return { allTrucks: allRows.length, rolling, stopped, signalStale, appointmentPast, available };
  }, [allRows]);

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

  const confirmException = async () => {
    if (!otherPrompt?.row.load || !otherReasonId) return;
    const selected = reasons.find((r) => r.id === otherReasonId);
    if (selected?.code === "other" && otherNote.trim().length === 0) {
      setOtherError('A note is required for "Other (note required)".');
      return;
    }
    setOtherBusy(true);
    setOtherError(null);
    try {
      await recordTruckLineException({
        operating_company_id: operatingCompanyId,
        load_id: otherPrompt.row.load.load_id,
        reason_id: otherReasonId,
        issue_category: selected?.code ?? "other",
        issue_description: otherNote.trim() || (selected?.name ?? "Exception"),
        severity: "warning",
      });
      await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
      closeOther();
    } catch (err) {
      // Honest failure — leave the popover open so the dispatcher can retry, with the server's
      // own reason shown (guard item d's same rule applies here).
      setOtherError(userFacingApiError(err, "Could not record this exception"));
    } finally {
      setOtherBusy(false);
    }
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
          border-bottom: 1px solid #C7D2DC;
          font-weight: 600;
          color: #374151;
        }
        .truck-line-v4-row {
          padding: 6px 10px 6px 13px;
          border-bottom: 1px solid #C7D2DC;
          min-height: 88px;
        }
        /* ROUND-20.4 -- row rules the owner can actually see: an every-other-row tint and a hover
           state so one unit's row is visibly distinct from its neighbors, plus a 3px left spine per
           row (inline style, colored by trip-type -- see rowSpineColor()) so a unit's row is
           identifiable at a glance without reading its text. */
        .truck-line-v4-row:nth-child(even) { background: #FAFCFE; }
        .truck-line-v4-row:hover { background: #F2F7FC; }
        /* V10 (ROUND 18.6, owner ruling 21:30 CT) — Next appointment and Live signal are centered,
           header and cells both. */
        .truck-line-v4-appt-header, .truck-line-v4-signal-header,
        .truck-line-v4-appt-cell, .truck-line-v4-signal-cell { text-align: center; }
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
          .truck-line-v4-load-cell, .truck-line-v4-load-header,
          .truck-line-v4-signal-cell, .truck-line-v4-signal-header { display: none; }
          .truck-line-v4-cap-full { display: none; }
          .truck-line-v4-cap-narrow { display: inline; }
        }
        .truck-line-vehicle {
          position: absolute;
          transform: translateX(-50%);
          transition: left 1s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
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
        <div className="mb-2 rounded border border-[#C7D2DC] bg-[#F4F7FA] px-3 py-1.5 text-xs text-[#6B7280]" data-testid="truck-line-catalog-pending">
          Reason catalog not yet available — "Other" will list reasons as soon as it's published.
        </div>
      ) : null}
      {query.isError ? (
        <div className="mb-2">
          <ListErrorBanner message={userFacingApiError(query.error, "Could not load Truck Line")} onRetry={() => void query.refetch()} />
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#374151]" data-testid="truck-line-top-bar">
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

      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Truck, load #, customer, stop city…"
          className="h-7 w-64 rounded border border-[#C7D2DC] px-2 text-xs"
          data-testid="truck-line-search"
        />
        <span className="ml-2 text-xs text-[#6B7280]">{rows.length} rows</span>
      </div>

      <div className="rounded border border-[#C7D2DC] bg-white" data-testid="truck-line-board-v4">
        <div className="truck-line-v4-header">
          <span>Truck</span>
          <span className="truck-line-v4-load-header">Load</span>
          <span>Line</span>
          <span className="truck-line-v4-appt-header">Next appointment</span>
          <span className="truck-line-v4-signal-header">Live signal</span>
        </div>

        {query.isLoading ? (
          <div className="p-4 text-xs text-[#6B7280]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-xs text-[#6B7280]">No in-service trucks found for this company.</div>
        ) : (
          rows.map((r) => {
            const live = r.load && r.station ? deriveLiveStation(r, mapReachedIndexToV7(r.station.reached_index)) : null;
            const chip = r.next_appointment?.at
              ? (() => {
                  const ms = new Date(r.next_appointment!.at as string).getTime() - Date.now();
                  if (Number.isNaN(ms)) return null;
                  return r.next_appointment!.late || ms < 0
                    ? { text: `past due ${fmtDuration(ms)}`, color: RED }
                    : { text: `in ${fmtDuration(ms)}`, color: GREEN };
                })()
              : null;
            const rowKey = `${r.kind}-${r.unit_id ?? r.available?.driver_id ?? "row"}`;
            if (r.kind === "available" && r.available) {
              const a = r.available;
              const hosAgeLabel = a.hos_polled_minutes_ago != null ? `HOS polled ${a.hos_polled_minutes_ago} min ago` : "HOS polled — min ago";
              return (
                <div
                  key={rowKey}
                  className="truck-line-v4-row"
                  style={{ background: AVAILABLE_ROW_TINT, borderLeft: `3px solid ${rowSpineColor(null)}` }}
                  data-testid={`truck-line-row-available-${a.driver_id}`}
                >
                  <div>
                    <div className="truck-line-v4-unit font-semibold text-[#1F2937]">{r.unit_number ?? "—"}</div>
                    <div className="truck-line-v4-sub text-[#6B7280]">{r.unit_number == null ? "no unit assigned" : "available truck"}</div>
                  </div>

                  <div className="truck-line-v4-load-cell">
                    <span className="truck-line-v4-sub text-[#6B7280]">
                      {a.last_closed_load_number ? `Last load ${a.last_closed_load_number}` : "no load yet"}
                    </span>
                  </div>

                  <div>
                    <AvailableTruckTrack row={r} onAssign={onAssignDriver} />
                  </div>

                  <div className="truck-line-v4-appt-cell">
                    <div className="truck-line-v4-appt font-semibold">—</div>
                    <div className="truck-line-v4-cap text-[#6B7280]">nothing booked</div>
                  </div>

                  <div className="truck-line-v4-signal-cell">
                    <span className="truck-line-v4-sub">
                      <b style={{ color: GREEN }}>available now</b>
                    </span>
                    <div className="truck-line-v4-cap text-[#6B7280]">{hosAgeLabel}</div>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={rowKey}
                className="truck-line-v4-row"
                style={{ borderLeft: `3px solid ${rowSpineColor(r.load?.trip_type)}` }}
                data-testid={`truck-line-row-${r.unit_id}`}
              >
                <div>
                  <div className="truck-line-v4-unit font-semibold text-[#1F2937]">
                    {r.unit_number}
                    {r.load?.trip_type ? (
                      <span
                        className="truck-line-v4-cap ml-1.5 inline-block rounded-sm px-1.5 py-0.5 font-semibold text-white"
                        style={{ background: r.load.trip_type === "NB" ? "#1f2a44" : r.load.trip_type === "SB" ? "#475569" : "#b45309" }}
                      >
                        {r.load.trip_type}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  className="truck-line-v4-load-cell cursor-pointer"
                  data-testid={`truck-line-card-${r.unit_id}`}
                  onDoubleClick={() => r.load && onLoadClick(r.load.load_id)}
                  title={r.load ? `double-click opens load ${r.load.load_number ?? ""}` : undefined}
                >
                  {r.load ? (
                    <>
                      <div className="truck-line-v4-unit font-semibold text-[#1F2937]">{r.load.load_number}</div>
                      <div className="truck-line-v4-sub text-[#6B7280]">{r.load.customer_name ?? "—"}</div>
                      <div className="truck-line-v4-sub text-[#6B7280]">
                        {r.load.pickup.city ?? "—"}, {r.load.pickup.state ?? "—"} → {r.load.delivery.city ?? "—"}, {r.load.delivery.state ?? "—"} · {money(r.load.rate_total_cents)}
                      </div>
                    </>
                  ) : (
                    <span className="truck-line-v4-sub text-[#6B7280]">—</span>
                  )}
                </div>

                <div>
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
                    onPickReason={setOtherReasonId}
                    onNoteChange={setOtherNote}
                    onConfirmException={confirmException}
                    onClearException={clearException}
                  />
                </div>

                <div className="truck-line-v4-appt-cell">
                  {r.next_appointment ? (
                    <div>
                      <div className="truck-line-v4-appt font-semibold" title={r.next_appointment.at_source ?? undefined}>
                        {fmtStamp(r.next_appointment.at) ?? "—"}
                      </div>
                      <div className="truck-line-v4-cap text-[#6B7280]">
                        {r.next_appointment.type === "pickup" ? "Pickup" : "Delivery"} · {r.next_appointment.type === "pickup" ? r.load?.pickup.city : r.load?.delivery.city}
                        {" "}
                        {r.next_appointment.type === "pickup" ? r.load?.pickup.state : r.load?.delivery.state}
                      </div>
                      {chip ? (
                        <div className="truck-line-v4-cap font-semibold" style={{ color: chip.color }}>
                          {chip.text}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="truck-line-v4-cap text-[#6B7280]">—</span>
                  )}
                </div>

                <div className="truck-line-v4-signal-cell">
                  {live ? (
                    live.signalLabel === "Live" ? (
                      <span className="truck-line-v4-sub">
                        <b>Live</b> {r.position?.city ?? "—"}
                      </span>
                    ) : live.signalLabel === "Stale" ? (
                      <span className="truck-line-v4-sub">
                        <b style={{ color: RED }}>Stale</b> {live.signalDetail ?? ""}
                      </span>
                    ) : (
                      <span className="truck-line-v4-sub">
                        <b>No ping</b> <span style={{ color: RED }}>— last position unavailable</span>
                      </span>
                    )
                  ) : (
                    <span className="truck-line-v4-sub text-[#6B7280]">—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {stampPrompt ? (
        <div className="fixed right-6 top-[118px] z-50 w-[350px] rounded-md border border-[#C7D2DC] bg-white text-xs shadow-lg" data-testid="truck-line-stamp-popover">
          <div className="flex h-[30px] items-center justify-between bg-[rgb(228,234,241)] px-2.5 font-semibold text-[#374151]">
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
            <button type="button" className="h-7 rounded border border-[#C7D2DC] px-2.5" onClick={() => { setStampPrompt(null); setStampError(null); }}>
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
