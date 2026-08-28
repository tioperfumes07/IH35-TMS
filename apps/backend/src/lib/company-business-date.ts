// Canonical "business date" in the operating company's timezone.
//
// WHY: computing "today" with `new Date().toISOString().slice(0,10)` yields the UTC calendar
// date, which after ~19:00 Central has already rolled to the next day. That off-by-one corrupted
// the persisted Load Number (a load booked 7:20 PM Central on 2026-06-29 was numbered
// L-20260630-0001) and defaulted several pickers to "tomorrow". Day boundaries here drive a
// business identifier, so the date MUST be computed in the company's wall-clock zone.
//
// TRANSP is the only active operating entity and the company timezone is not yet a per-company
// column, so America/Chicago is hardcoded to match the existing convention
// (reports/queries/shared.ts `isoDateInChicago`, the cron schedules). When a per-company
// timezone column lands, swap COMPANY_TIME_ZONE for a lookup keyed on operating_company_id.
export const COMPANY_TIME_ZONE = "America/Chicago";

// 'YYYY-MM-DD' in the company timezone.
export function companyBusinessDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// 'YYYYMMDD' in the company timezone (compact form for identifier prefixes).
export function companyBusinessDateCompact(date: Date = new Date()): string {
  return companyBusinessDate(date).replace(/-/g, "");
}

// Add whole calendar days to a business date without crossing through a timezone-bearing instant.
// UTC is used only as arithmetic over YYYY-MM-DD parts, so DST cannot shorten/extend the range.
export function addBusinessDateDays(iso: string, days: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, date) + days * 86_400_000);
  return result.toISOString().slice(0, 10);
}

export function businessDateDaysBetween(fromIso: string, toIso: string): number {
  const [fromYear, fromMonth, fromDate] = fromIso.split("-").map(Number);
  const [toYear, toMonth, toDate] = toIso.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDate) - Date.UTC(fromYear, fromMonth - 1, fromDate)) / 86_400_000
  );
}
