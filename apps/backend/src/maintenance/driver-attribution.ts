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

/**
 * L-3 (Lead order, ROUND 299): the mirror of driverAtTimeSql — given a DRIVER + a timestamp,
 * resolve which UNIT he was holding. Needed to repair fuel.fuel_transactions rows that carry a
 * driver_id and a load_id but no unit_id: the driver is already known, so the missing fact is
 * "which truck was he in," not "who was driving." Kept in this same file (not a bespoke query in
 * the repair script) so there is still exactly one definition of the time-boxed assignment
 * predicate, in either direction — the Lead's own instruction was "do not write a second
 * resolver."
 *
 * Same boundary condition and tiebreak as driverAtTimeSql, same LEFT JOIN (an unattributable
 * driver+time still returns a row, with unit_id NULL, never dropped).
 */
export function unitAtTimeSql(driverAlias: string, tsExpr: string, resultAlias = "unit_at_time"): string {
  return `LEFT JOIN LATERAL (
    SELECT a.unit_id
    FROM telematics.vehicle_driver_assignments a
    WHERE a.operating_company_id = $1::uuid
      AND a.driver_id = ${driverAlias}
      AND a.started_at <= ${tsExpr}
      AND (a.ended_at IS NULL OR a.ended_at > ${tsExpr})
    ORDER BY a.started_at DESC, a.created_at DESC
    LIMIT 1
  ) ${resultAlias} ON true`;
}

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

/**
 * ROUND 305 B-47: the in-memory mirror of driverAtTimeSql, for engines that already hold a unit's
 * assignment windows and must attribute many timestamps (stop segments, Relay fills) without one
 * query per timestamp. Same predicate, same tiebreak — started_at <= ts < ended_at (open end =
 * still assigned), latest started_at then latest created_at wins. Kept beside the SQL form so the
 * attribution rule still has exactly one home.
 */
export type AssignmentWindow = { driverId: string; startedAt: Date; endedAt: Date | null; createdAt: Date };

export function driverAtTimeFromWindows(windows: AssignmentWindow[], ts: Date): string | null {
  let best: AssignmentWindow | null = null;
  for (const w of windows) {
    if (w.startedAt.getTime() > ts.getTime()) continue;
    if (w.endedAt !== null && w.endedAt.getTime() <= ts.getTime()) continue;
    if (
      best === null ||
      w.startedAt.getTime() > best.startedAt.getTime() ||
      (w.startedAt.getTime() === best.startedAt.getTime() && w.createdAt.getTime() > best.createdAt.getTime())
    ) {
      best = w;
    }
  }
  return best?.driverId ?? null;
}

/** One unit's assignment windows. $1 = operating_company_id, $2 = unit_id. Read-only. */
export function unitAssignmentWindowsSql(): string {
  return `
    SELECT driver_id::text AS driver_id, started_at, ended_at, created_at
      FROM telematics.vehicle_driver_assignments
     WHERE operating_company_id = $1::uuid AND unit_id = $2::uuid
     ORDER BY started_at ASC`;
}

/**
 * ROUND 306 E-27 addition — where a driver's miles come from, and the label that says so.
 *
 * Target source: telematics.unit_stop_events.miles_since_previous_stop (E-03, the Lead's stop-
 * odometer engine — odometer deltas between real stops, never interpolated). The table is not in
 * production yet (to_regclass = NULL on 2026-10-01) and its migration is not published, so this
 * does NOT guess its shape: it switches only when the table exists AND information_schema shows
 * every column it reads. Until then the source stays the daily odometer snapshot and is LABELLED
 * as such, so no screen presents snapshot miles as stop-measured miles.
 *
 * Stop-event attribution follows the B-47 rule: a segment's miles count for a driver only when the
 * same driver held the truck at both of its ends (driverAtTimeSql at this stop and the previous
 * one); a segment straddling a handover is excluded, never split.
 */
export type MilesSource = "stop_events" | "daily_snapshot_miles";

export type ResolvedDriverMiles = {
  source: MilesSource;
  /** Plain words for the screen. Never empty. */
  label: string;
  byDriver: Map<string, { miles: number | null }>;
};

export const STOP_EVENT_REQUIRED_COLUMNS = ["operating_company_id", "unit_id", "stopped_at", "miles_since_previous_stop"] as const;

async function stopEventsReadable(client: DbClient): Promise<boolean> {
  const res = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'telematics' AND table_name = 'unit_stop_events' AND column_name = ANY($1::text[])`,
    [[...STOP_EVENT_REQUIRED_COLUMNS]]
  );
  return (res.rows[0]?.n ?? 0) === STOP_EVENT_REQUIRED_COLUMNS.length;
}

export async function resolveDriverMilesInPeriod(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<ResolvedDriverMiles> {
  if (await stopEventsReadable(client)) {
    const res = await client.query<{ driver_id: string; miles: string }>(
      `
      WITH seg AS (
        SELECT s.unit_id, s.stopped_at, s.miles_since_previous_stop AS miles,
               lag(s.stopped_at) OVER (PARTITION BY s.unit_id ORDER BY s.stopped_at) AS prev_stopped_at
          FROM telematics.unit_stop_events s
         WHERE s.operating_company_id = $1::uuid
      )
      SELECT d_end.driver_id::text AS driver_id, sum(seg.miles)::text AS miles
        FROM seg
        ${driverAtTimeSql("seg.unit_id", "seg.stopped_at", "d_end")}
        ${driverAtTimeSql("seg.unit_id", "seg.prev_stopped_at", "d_start")}
       WHERE seg.miles IS NOT NULL AND seg.miles >= 0
         AND seg.stopped_at >= $2::timestamptz AND seg.stopped_at < $3::timestamptz
         AND d_end.driver_id IS NOT NULL AND d_end.driver_id = d_start.driver_id
       GROUP BY d_end.driver_id
      `,
      [operatingCompanyId, periodStart, periodEnd]
    );
    return {
      source: "stop_events",
      label: "stop-odometer miles (E-03): odometer deltas between stops, same driver at both ends",
      byDriver: new Map(res.rows.map((r) => [r.driver_id, { miles: Number(r.miles) }])),
    };
  }
  const snap = await computeDriverMilesInPeriod(client, operatingCompanyId, periodStart, periodEnd);
  return {
    source: "daily_snapshot_miles",
    label:
      "daily snapshot miles — telematics.odometer_readings once a day; stop-odometer miles (E-03) take over when telematics.unit_stop_events exists",
    byDriver: new Map([...snap].map(([d, v]) => [d, { miles: v.miles }])),
  };
}
