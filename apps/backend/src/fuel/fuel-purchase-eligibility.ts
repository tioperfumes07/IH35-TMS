/**
 * ROUND 304 T-45 — the one shared answer to "is this fuel row a real fuel PURCHASE?"
 *
 * Measured live (USMCA, 2026-10-01): 177 live rows. 125 diesel rows carry real gallons but only a
 * DATE (transaction_at at 00:00:00 UTC — no pump time exists in their source). 52 rows carry
 * gallons=0 and a shared now()-stamp: every one is fuel_type='def' (Diesel Exhaust Fluid),
 * written by scripts/feed/close-faro-day.mjs from settlement lines whose source quantity is a
 * QuickBooks placeholder (quantity=1.0, rate=amount on 205/205 DEF lines) — the source never had
 * gallons. DEF is not motor fuel: it never enters MPG and is not an IFTA-taxable fuel.
 *
 * A row with no gallons is a CHARGE, not a purchase. Every consumer that needs litres/gallons or
 * a pump time (MPG, IFTA, the Samsara fuel-purchase push, fuel-stop matching) goes through this
 * file — never its own copy of these rules.
 */

export const MOTOR_FUEL_TYPES = ["diesel", "reefer_diesel", "gas"] as const;

/** A batch of this many rows sharing one exact transaction_at is an import stamp, not pump times. */
export const SHARED_STAMP_THRESHOLD = 3;

export type FuelPurchaseIneligibleReason =
  | "not_motor_fuel"
  | "no_gallons"
  | "shared_import_timestamp"
  | "date_only_precision"
  | "voided";

export type FuelRowForEligibility = {
  fuel_type: string | null;
  gallons: number | string | null;
  transaction_at: string | Date;
  voided_at: string | Date | null;
  /** How many live rows (including this one) share this exact transaction_at. */
  same_stamp_count: number;
};

/**
 * Returns null when the row is a real, time-precise motor-fuel purchase; otherwise the FIRST
 * reason it is not. `requirePumpTime` is true for consumers that need a real time of day
 * (Samsara verification, fuel-stop crossing match within minutes); MPG/IFTA by day can pass false.
 */
export function fuelPurchaseIneligibleReason(
  row: FuelRowForEligibility,
  opts: { requirePumpTime: boolean }
): FuelPurchaseIneligibleReason | null {
  if (row.voided_at) return "voided";
  if (!row.fuel_type || !(MOTOR_FUEL_TYPES as readonly string[]).includes(row.fuel_type)) return "not_motor_fuel";
  const gallons = row.gallons == null ? NaN : Number(row.gallons);
  if (!Number.isFinite(gallons) || gallons <= 0) return "no_gallons";
  if (row.same_stamp_count >= SHARED_STAMP_THRESHOLD && hasSubMinuteComponent(row.transaction_at)) {
    return "shared_import_timestamp";
  }
  if (opts.requirePumpTime && isDateOnlyStamp(row.transaction_at)) return "date_only_precision";
  return null;
}

/** Date-only sources are stamped at an exact 00:00:00 or 12:00:00 UTC -- no real time of day. */
function isDateOnlyStamp(ts: string | Date): boolean {
  const d = ts instanceof Date ? ts : new Date(ts);
  const exact = d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return exact && (d.getUTCHours() === 0 || d.getUTCHours() === 12);
}

/** now()-written import stamps carry seconds/sub-seconds; a real clean time rarely collides 3x. */
function hasSubMinuteComponent(ts: string | Date): boolean {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0;
}

/**
 * SQL projection that supplies same_stamp_count for fuelPurchaseIneligibleReason, scoped to the
 * caller's `$1` operating company. Use as a CTE source:  WITH f AS (${FUEL_ROWS_WITH_STAMP_COUNT_SQL})
 */
export const FUEL_ROWS_WITH_STAMP_COUNT_SQL = `
  SELECT ft.*,
         count(*) OVER (PARTITION BY ft.operating_company_id, ft.transaction_at)::int AS same_stamp_count
  FROM fuel.fuel_transactions ft
  WHERE ft.operating_company_id = $1::uuid
    AND ft.voided_at IS NULL
`;
