// Carrier-fixed date/time formatting for the driver PWA.
//
// WHY THIS EXISTS (G8-1 — dispute risk): a bare `.toLocaleString()` /
// `.toLocaleDateString()` renders a UTC timestamp in the DEVICE's timezone and
// locale. A driver whose phone is set to Mexico time (America/Monterrey) sees a
// different pickup/delivery clock than the office in Laredo (America/Chicago) —
// the same load, two different times, a real dispute for the Mexican-B1 driver
// base. Every timestamp shown to a driver MUST render in the carrier's single
// operating timezone regardless of the device.
//
// The operating timezone is hardcoded to America/Chicago to match the backend
// company-business-date convention (apps/frontend/src/lib/businessDate.ts and
// apps/backend lib/company-business-date.ts). Do NOT read the device timezone.
//
// The lint guard scripts/verify-no-bare-tolocale-in-pwa.mjs forbids bare
// `.toLocale*()` calls in the PWA and points here.

// The carrier's single operating timezone. Never the device timezone.
export const COMPANY_TIME_ZONE = "America/Chicago";

// Default display locale. Drivers switch EN/ES chrome via i18n; pass i18n.language
// through when the caller has it, otherwise fall back to a stable, explicit locale
// (never the implicit device locale, which is what a bare toLocale* would use).
export const DEFAULT_LOCALE = "en-US";

export interface FormatDateTimeOptions {
  /** Display locale (e.g. i18n.language). Defaults to a fixed, explicit locale. */
  locale?: string;
  /** Display timezone. Defaults to the carrier operating timezone (America/Chicago). */
  timeZone?: string;
  /** Extra Intl options (dateStyle/timeStyle/etc.) merged over the defaults. */
  intl?: Intl.DateTimeFormatOptions;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a timestamp as date + time in the carrier's fixed operating timezone.
 * Returns the original string form for an unparseable/empty value (never "Invalid Date").
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: FormatDateTimeOptions = {},
): string {
  const d = toDate(value);
  if (!d) return value == null ? "" : String(value);
  const { locale = DEFAULT_LOCALE, timeZone = COMPANY_TIME_ZONE, intl } = options;
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    ...intl,
  });
}

/**
 * Format a timestamp as a date only, in the carrier's fixed operating timezone.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  options: FormatDateTimeOptions = {},
): string {
  const d = toDate(value);
  if (!d) return value == null ? "" : String(value);
  const { locale = DEFAULT_LOCALE, timeZone = COMPANY_TIME_ZONE, intl } = options;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone,
    ...intl,
  });
}

/**
 * Format a timestamp as a time only, in the carrier's fixed operating timezone.
 */
export function formatTime(
  value: string | number | Date | null | undefined,
  options: FormatDateTimeOptions = {},
): string {
  const d = toDate(value);
  if (!d) return value == null ? "" : String(value);
  const { locale = DEFAULT_LOCALE, timeZone = COMPANY_TIME_ZONE, intl } = options;
  return d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    ...intl,
  });
}
