import { COMPANY_TIME_ZONE } from "../lib/company-business-date.js";

/**
 * ACCT-F11122 — a Relay fill's DAY is the company's business day (America/Chicago), the same day Relay's own export
 * prints ("processing time" in CDT/CST). integrations.relay_fuel_transactions.relay_created_at is a timestamptz; a bare
 * `relay_created_at::date` or a comparison with `$n::date` uses the session zone (UTC) midnight, so a fill pumped after
 * 19:00 CT lands on the next day. Measured on prod 11-09: 5 fills Relay processed on 2026-09-30 19:02–22:31 CT
 * ($3,086.96) were counted in October — Oct 117 fills $57,640.75 vs Relay's October CSV 112 fills $54,553.79.
 * Every Relay-fill day filter / bucket goes through these three helpers.
 */
export function relayFillDaySql(alias: string): string {
  return `(${alias}.relay_created_at AT TIME ZONE '${COMPANY_TIME_ZONE}')::date`;
}

/** relay_created_at on or after the start of business day `param` (index-friendly: compares the timestamptz). */
export function relayFillOnOrAfterDaySql(alias: string, param: string): string {
  return `${alias}.relay_created_at >= (${param}::date::timestamp AT TIME ZONE '${COMPANY_TIME_ZONE}')`;
}

/** relay_created_at on or before the end of business day `param`. */
export function relayFillOnOrBeforeDaySql(alias: string, param: string): string {
  return `${alias}.relay_created_at < ((${param}::date + 1)::timestamp AT TIME ZONE '${COMPANY_TIME_ZONE}')`;
}
