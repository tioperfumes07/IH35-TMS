/**
 * ACCT-F11123 — the ONE list of operating companies a background engine may run for.
 *
 * Owner law: IH 35 TRANSPORTATION and IH 35 TRUCKING are FROZEN — no engine reads, writes or reports on them.
 * USMCA Freight Solutions is the only live entity. Every scheduled engine that loops companies used its own
 * `SELECT id FROM org.companies WHERE is_active` — all three entities are active rows, so money engines
 * (depreciation auto-post, factoring default-interest accrual, collections sync, bank drift alerts, driver
 * settlement auto-pay, insurance late fees / payment reminders, cash-flow snapshots) ran for the frozen entities
 * too, and the customer relationship scorer scored every frozen customer and never finished a run
 * (_system.background_jobs last success 2026-10-25 15:12Z while USMCA rows were rescored 11-09 / 11-10).
 *
 * The engine company list is this filter. Same rule as #28648 (fuel sweep) and #28678 (auto-status).
 * scripts/verify-engines-run-live-companies-only.mjs keeps every engine loop on it (shrink-only).
 */
import { USMCA_OPERATING_COMPANY_ID } from "../integrations/relay-payments/relay-usmca-date-floor.js";

export const LIVE_ENGINE_COMPANY_IDS: readonly string[] = Object.freeze([USMCA_OPERATING_COMPANY_ID]);

export function isLiveEngineCompany(operatingCompanyId: string | null | undefined): boolean {
  return typeof operatingCompanyId === "string" && LIVE_ENGINE_COMPANY_IDS.includes(operatingCompanyId.toLowerCase());
}

/** Keep only the live entities, preserving order. */
export function filterLiveEngineCompanies(operatingCompanyIds: readonly string[]): string[] {
  return operatingCompanyIds.filter((id) => isLiveEngineCompany(id));
}
