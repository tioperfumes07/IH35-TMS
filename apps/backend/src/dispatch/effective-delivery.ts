// ETA-MODEL BLOCK 1 — single source of truth for the load's delivery dates.
//
// scheduled_delivery_date = the contractual appointment, derived from the last delivery stop
//   (mdata.load_stops.scheduled_arrival_at). Never moved by signals.
// predicted_delivery_date = the live ETA on mdata.loads (nullable; manual/dispatcher-confirmed).
// effective_delivery_date = COALESCE(predicted, scheduled) — what every consumer (board, KPIs,
//   cash forecast) MUST read so a confirmed slip flows through consistently.
//
// Every forecast/board consumer reads through this helper rather than hardcoding a single delivery
// date — enforced by scripts/verify-load-delivery-dates-separated.mjs. This is scheduling/forecast
// data ONLY; it never moves a posted invoice / AR / QBO entry.

/**
 * SQL SELECT fragment exposing the two-date model + the late-vs-appointment flag.
 * @param loadAlias       table alias for mdata.loads (carries predicted_delivery_date)
 * @param deliveryAlias   alias for the last delivery stop subquery (carries scheduled_arrival_at)
 * Returns a comma-terminated list of projected columns:
 *   scheduled_delivery_date, predicted_delivery_date, effective_delivery_date, delivery_late_vs_appt
 */
export function effectiveDeliverySelectSql(loadAlias = "l", deliveryAlias = "sd"): string {
  return `
    ${deliveryAlias}.scheduled_arrival_at AS scheduled_delivery_date,
    ${loadAlias}.predicted_delivery_date AS predicted_delivery_date,
    COALESCE(${loadAlias}.predicted_delivery_date, ${deliveryAlias}.scheduled_arrival_at) AS effective_delivery_date,
    (
      ${loadAlias}.predicted_delivery_date IS NOT NULL
      AND ${deliveryAlias}.scheduled_arrival_at IS NOT NULL
      AND ${loadAlias}.predicted_delivery_date > ${deliveryAlias}.scheduled_arrival_at
    ) AS delivery_late_vs_appt
  `.trim();
}

/** TypeScript-side equivalent, for any consumer that has the two raw dates in hand. */
export function effectiveDeliveryDate(
  predicted_delivery_date: string | null | undefined,
  scheduled_delivery_date: string | null | undefined
): string | null {
  return predicted_delivery_date ?? scheduled_delivery_date ?? null;
}
