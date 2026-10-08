/**
 * RELAY DATE LAW (ROUND 441.21-B / 441.24) — USMCA Relay data starts 2026-08-03.
 *
 * Every fill dated before this floor on the shared Transportation key belongs to
 * TRANSPORTATION and is EXCLUDED from USMCA. Hard-coded in ingest, backfill, and the
 * matching engine. Never ingest, display, post, or match a pre-floor fill into USMCA.
 * This closes the 1,764-row question as a date filter, not an entity audit.
 */
export const RELAY_USMCA_DATA_FLOOR = "2026-08-03" as const;

/** USMCA Freight Solutions Inc — the only live Relay consumer until launch. */
export const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function isUsmcaOperatingCompany(operatingCompanyId: string): boolean {
  return operatingCompanyId === USMCA_OPERATING_COMPANY_ID;
}

/**
 * Clamp a pull/backfill start so USMCA never asks Relay for (or keeps) a day before the floor.
 * Non-USMCA companies are unchanged (TRANSPORTATION / TRUCKING remain frozen elsewhere).
 */
export function clampRelayRangeStartForCompany(
  operatingCompanyId: string,
  startIso: string
): string {
  if (!isUsmcaOperatingCompany(operatingCompanyId)) return startIso;
  return startIso < RELAY_USMCA_DATA_FLOOR ? RELAY_USMCA_DATA_FLOOR : startIso;
}

/** True when a calendar day (YYYY-MM-DD) is before the USMCA Relay floor. */
export function isBeforeRelayUsmcaFloor(dayIso: string | null | undefined): boolean {
  if (!dayIso || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return false;
  return dayIso < RELAY_USMCA_DATA_FLOOR;
}
