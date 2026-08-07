// Canonical "today" in the operating company's timezone (America/Chicago).
//
// WHY: `new Date().toISOString().slice(0,10)` returns the UTC calendar date, which after ~19:00
// Central has already rolled to tomorrow. That made several date pickers default to the next day
// (Home day-summary, Create-Task scheduled date, Driver Scheduler range) and showed "no data".
// Day-of defaults must be computed in the company's wall-clock zone.
//
// America/Chicago is hardcoded to match the backend convention (lib/company-business-date.ts).
// TRANSP is the only active operating entity; when a per-company timezone is introduced, source it
// here instead of the constant.
const COMPANY_TIME_ZONE = "America/Chicago";

// Exported so call sites needing the raw IANA zone id (e.g. a one-off Intl.DateTimeFormat call this
// module doesn't cover) never hardcode a second copy of the string. Prefer `formatInCompanyTimeZone`
// below for actual display formatting.
export const CENTRAL_TIME_ZONE = COMPANY_TIME_ZONE;

// 'YYYY-MM-DD' for "today" in the company timezone.
export function companyToday(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Current "now" in the company timezone, formatted 'YYYY-MM-DDTHH:mm' for `<input type="datetime-local">`.
//
// WHY: the same UTC bug as `companyToday`, but for datetime fields. `new Date().toISOString()` returns
// the UTC instant, so after ~19:00 Central a datetime-local default shows tomorrow's date and the wrong
// hour (e.g. an HOS "occurred" field pre-filling 06/30 01:24 AM while the company clock reads 06/29
// 8:24 PM). We assemble the parts in America/Chicago wall-clock time — never via `.toISOString()`.
export function companyNow(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Intl can emit "24" for midnight in some engines; normalize to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

// Add (or subtract) whole days to a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD'. Uses UTC math on
// the calendar parts only (no timezone shift), so it is DST-safe for date-only arithmetic.
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// HOS/ELD/Samsara/telematics-timestamp DISPLAY audit (2026-07) — CLAUDE.md §8 "Central Time always":
// every timestamp shown to a user must render in America/Chicago (handles CST/CDT automatically),
// never raw UTC and never accidental browser-local time. Storage stays UTC/timestamptz; this is the
// ONE choke point for that display rule, mirroring how formatDate.ts is the one choke point for
// MM/DD/YYYY date display. Every HOS clock, ELD edit-history row, geofence/border-crossing event,
// engine-fault timestamp, and live-ETA chip must go through this (or formatDate.ts's CT exports),
// never a bare `.toLocaleString()` / `.toLocaleTimeString()` with no `timeZone`.
//
// Returns "" for null/undefined/empty/unparseable input so callers can render a blank cell instead of
// "Invalid Date" (matches formatDate.ts's convention).
export function formatInCompanyTimeZone(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (value === null || value === undefined || value === "") return "";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", { ...options, timeZone: COMPANY_TIME_ZONE });
}

// Convenience: "3:45 PM" (12-hour clock, no date) in Central time — the common HOS/dispatch-board case.
export function formatClockTimeCT(value: Date | string | number | null | undefined): string {
  return formatInCompanyTimeZone(value, { hour: "numeric", minute: "2-digit" });
}

// First and last calendar day of the month that contains the given 'YYYY-MM-DD'.
export function monthBoundsIso(iso: string): { start: string; end: string } {
  const [y, m] = iso.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Parse a business date (`YYYY-MM-DD`) as a LOCAL calendar date.
 *
 * A business date has no timezone — it is the company's calendar day. Parsing it as
 * `new Date(iso + "T00:00:00Z")` pins it to UTC midnight, and rendering that with
 * `toLocaleDateString` shifts it back a day for every viewer west of UTC. IH35 operates in Central
 * Time, so that shift is permanent rather than an edge case: the /cash-flow 7-day outlook labelled
 * every cell one day early while its click handler used the true date, so clicking "Fri 8/7"
 * selected Sat 8/8 and the operator read the wrong day's cash. Guarded by
 * scripts/verify-business-date-parsed-local.mjs.
 */
export function localDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
}
