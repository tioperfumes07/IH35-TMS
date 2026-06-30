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
