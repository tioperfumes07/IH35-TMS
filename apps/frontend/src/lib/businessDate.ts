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

// First and last calendar day of the month that contains the given 'YYYY-MM-DD'.
export function monthBoundsIso(iso: string): { start: string; end: string } {
  const [y, m] = iso.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}
