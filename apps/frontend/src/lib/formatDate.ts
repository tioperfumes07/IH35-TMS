// Shared US date DISPLAY formatter (WAVE 1A / SYS-DATE root fix).
//
// The application stores and transmits dates as ISO 8601 "YYYY-MM-DD" (the database/API format).
// That format must NEVER be shown to a user — every US-facing TMS/ERP/accounting system
// (QuickBooks, McLeod, Alvys, NetSuite) displays dates as MM/DD/YYYY. A wrong date format on a
// DOT accident report, a bank reconciliation, or a driver settlement is an audit/compliance failure.
//
// This module is the ONE place date DISPLAY is formatted. Inputs keep their "YYYY-MM-DD" value
// semantics (that is what <input type="date"> and the API require); only the rendered text changes.
//
// IMPORTANT: for a bare "YYYY-MM-DD" string we parse the calendar parts directly and never construct
// `new Date("YYYY-MM-DD")` — that constructor parses as UTC midnight and, west of GMT, renders the
// PREVIOUS day. Parsing the parts keeps the displayed day identical to the stored day (no TZ shift).

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format a date value as "MM/DD/YYYY" for display.
 *
 * Accepts:
 *  - a bare ISO date "YYYY-MM-DD"                → formatted with no timezone shift
 *  - a full ISO timestamp "YYYY-MM-DDTHH:mm..."  → the calendar date portion is formatted
 *  - a Date object                               → its local calendar date is formatted
 *
 * Returns "" for null / undefined / empty / unparseable input (so callers can render a blank cell
 * instead of "Invalid Date").
 */
export function formatDateUS(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  // Row fields are frequently typed `unknown`; only string/number/Date are formattable dates.
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return "";

  if (typeof value === "string") {
    // Bare or leading ISO date — format the calendar parts directly (no Date(), no TZ shift).
    const m = ISO_DATE_ONLY.exec(value.length > 10 ? value.slice(0, 10) : value);
    if (m) {
      const [, y, mo, d] = m;
      return `${mo}/${d}/${y}`;
    }
    // Fall through to Date parsing for other string shapes (e.g. RFC timestamps).
  }

  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return `${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())}/${dt.getFullYear()}`;
}

/**
 * Format an ISO timestamp as "MM/DD/YYYY, h:mm AM/PM" in America/Chicago (Central Time — CLAUDE.md
 * §8 "Central Time always"; Laredo TX is the company's wall-clock zone, not the viewer's browser zone).
 * Returns "" for empty/unparseable input.
 */
export function formatDateTimeUS(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// The placeholder every date input should show. Single source of truth so the CI guard can assert it.
export const DATE_PLACEHOLDER_US = "MM/DD/YYYY";
