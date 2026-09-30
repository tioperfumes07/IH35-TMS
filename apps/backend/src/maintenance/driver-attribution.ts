/**
 * B-27 — THE ATTRIBUTION FUNCTION, ONE, SHARED (Lead order, ROUND 297.3).
 *
 * Owner, verbatim: "since the drivers dont always have the same truck it is hard to determine
 * sometimes the damage they cause on vehicles, tires, etc." A unit-scoped event (a fuel fill, a
 * work order, a tire change, an accident) must resolve to whichever driver actually held the unit
 * AT THE EVENT'S OWN TIMESTAMP — never `mdata.units.assigned_driver_id` (who holds it TODAY) and
 * never a manually-typed `driver_id` column on the event row itself, which is exactly the kind of
 * field that goes stale the moment a truck changes hands.
 *
 * Before this file, the SAME point-in-time predicate against
 * `telematics.vehicle_driver_assignments` was independently pasted inline in at least 8 places
 * (driver-day-summary.routes.ts, arrival-detection.service.ts, vehicle-driver-pairing.routes.ts,
 * safety/driver-scoring/scoring.service.ts, integrations/fuel/fraud-detector/rules.service.ts ×2,
 * integrations/samsara/vehicle-driver-pairing/pairing.service.ts,
 * integrations/samsara/active-driver-set/recompute.service.ts) — a boundary-condition bug in any
 * one of them is a boundary-condition bug in up to 8 places independently. This file is the single
 * source; every new integrity metric imports it instead of inlining its own copy.
 *
 * `driverAtTimeSql` returns a LATERAL JOIN fragment, not a scalar subquery, because every consumer
 * here aggregates many rows at once (GROUP BY driver over a fuel/work-order/tire-event population)
 * — an async per-row lookup would be an N+1 query against a 617-row (and growing) assignment table.
 */

/**
 * Build a `LEFT JOIN LATERAL` fragment resolving the driver holding `unitAlias` at `tsExpr`.
 *
 * `unitAlias` and `tsExpr` are raw SQL fragments (a column reference like `ft.unit_id`, or an
 * expression), interpolated directly — callers must never pass untrusted/user-controlled text
 * here; both parameters are meant to be literal column references from the caller's own query,
 * the same way the 8 prior inline sites embedded them.
 *
 * Boundary condition matches every existing site exactly: `started_at <= ts AND (ended_at IS NULL
 * OR ended_at > ts)`, tie-broken by `started_at DESC, created_at DESC` (most recent assignment
 * wins on an overlap, which should not occur given the table's own append-only design but the
 * tiebreak is defensive).
 *
 * LEFT JOIN (never INNER): an event with no covering assignment must resolve to a NULL
 * `driver_id` and still appear in the result set — counted as unattributed in its own bucket,
 * never silently dropped and never assigned to the nearest driver by proximity or guesswork.
 *
 * The caller's own query must bind `$1` to `operating_company_id` — every existing call site in
 * this codebase uses that convention, and this fragment relies on it rather than accepting a
 * fourth parameter, to stay a pure drop-in replacement for the inline predicate it centralizes.
 */
export function driverAtTimeSql(unitAlias: string, tsExpr: string, resultAlias = "driver_at_time"): string {
  return `LEFT JOIN LATERAL (
    SELECT a.driver_id
    FROM telematics.vehicle_driver_assignments a
    WHERE a.operating_company_id = $1::uuid
      AND a.unit_id = ${unitAlias}
      AND a.started_at <= ${tsExpr}
      AND (a.ended_at IS NULL OR a.ended_at > ${tsExpr})
    ORDER BY a.started_at DESC, a.created_at DESC
    LIMIT 1
  ) ${resultAlias} ON true`;
}

export const DRIVER_ATTRIBUTION_RESULT_ALIAS_DEFAULT = "driver_at_time";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const ODOMETER_READING_TOLERANCE_HOURS = 24;

export type DriverMilesInPeriod = { miles: number | null; windowCount: number; gapCount: number };

type WindowAggRow = {
  driver_id: string;
  window_count: string;
  gap_count: string;
  confirmed_miles: string | null;
};

/**
 * Per-driver confirmed miles driven in `[periodStart, periodEnd)`, resolved from the driver's own
 * `telematics.vehicle_driver_assignments` windows (clipped to the period) each bounded by the
 * nearest `telematics.odometer_readings` row within ±`ODOMETER_READING_TOLERANCE_HOURS` of the
 * window's own start/end. `miles` is NULL — never estimated, never partially summed — the moment
 * any one of the driver's windows in the period is missing a boundary reading; `gapCount` says how
 * many. Shared by B-28 (MPG denominator) and B-29 (per-100k-miles normalization) so there is one
 * definition of "how many miles was this driver responsible for," not two.
 */
export async function computeDriverMilesInPeriod(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, DriverMilesInPeriod>> {
  const res = await client.query<WindowAggRow>(
    `
    WITH windows AS (
      SELECT
        a.driver_id,
        a.unit_id,
        GREATEST(a.started_at, $2::timestamptz) AS window_start,
        LEAST(COALESCE(a.ended_at, now()), $3::timestamptz) AS window_end
      FROM telematics.vehicle_driver_assignments a
      WHERE a.operating_company_id = $1::uuid
        AND a.driver_id IS NOT NULL
        AND a.started_at < $3::timestamptz
        AND (a.ended_at IS NULL OR a.ended_at > $2::timestamptz)
    ), windows_with_odo AS (
      SELECT
        w.driver_id,
        start_odo.odometer_miles AS start_miles,
        end_odo.odometer_miles AS end_miles
      FROM windows w
      LEFT JOIN LATERAL (
        SELECT o.odometer_miles
        FROM telematics.odometer_readings o
        WHERE o.operating_company_id = $1::uuid AND o.unit_id = w.unit_id
          AND o.read_at BETWEEN w.window_start - (${ODOMETER_READING_TOLERANCE_HOURS} || ' hours')::interval
                             AND w.window_start + (${ODOMETER_READING_TOLERANCE_HOURS} || ' hours')::interval
        ORDER BY abs(extract(epoch FROM (o.read_at - w.window_start))) ASC
        LIMIT 1
      ) start_odo ON true
      LEFT JOIN LATERAL (
        SELECT o.odometer_miles
        FROM telematics.odometer_readings o
        WHERE o.operating_company_id = $1::uuid AND o.unit_id = w.unit_id
          AND o.read_at BETWEEN w.window_end - (${ODOMETER_READING_TOLERANCE_HOURS} || ' hours')::interval
                             AND w.window_end + (${ODOMETER_READING_TOLERANCE_HOURS} || ' hours')::interval
        ORDER BY abs(extract(epoch FROM (o.read_at - w.window_end))) ASC
        LIMIT 1
      ) end_odo ON true
    )
    SELECT
      driver_id::text,
      count(*)::text AS window_count,
      count(*) FILTER (WHERE start_miles IS NULL OR end_miles IS NULL OR end_miles < start_miles)::text AS gap_count,
      sum(GREATEST(end_miles - start_miles, 0)) FILTER (WHERE start_miles IS NOT NULL AND end_miles IS NOT NULL AND end_miles >= start_miles)::text AS confirmed_miles
    FROM windows_with_odo
    GROUP BY driver_id
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );

  const out = new Map<string, DriverMilesInPeriod>();
  for (const row of res.rows) {
    const gapCount = Number(row.gap_count);
    out.set(row.driver_id, {
      miles: gapCount > 0 ? null : row.confirmed_miles != null ? Number(row.confirmed_miles) : 0,
      windowCount: Number(row.window_count),
      gapCount,
    });
  }
  return out;
}
