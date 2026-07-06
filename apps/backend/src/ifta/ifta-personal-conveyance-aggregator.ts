// BLOCK-03 — TRIP methodology: personal-conveyance mileage for the quarter, computed from
// hos.duty_status_events odometer deltas during 'personal_conveyance' duty-status segments.
// That duty status + its odometer_mi column already exist (CAP-11, migration 0219) — this is a
// pure READ, no HOS schema change. Per-unit total (hos.duty_status_events has no per-state
// location, so state-level attribution isn't possible from data alone — see the migration
// header + ifta-tax-calculator.ts for the proportional-apportionment convention this feeds).
import type { QuarterWindow } from "./ifta-state-miles-aggregator.js";

export type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

export type PersonalConveyanceUnitRow = {
  unit_id: string | null;
  miles: number;
};

/**
 * For every 'personal_conveyance' duty-status segment that has both a starting and (implicit)
 * next-event odometer reading within the quarter window, sums the odometer delta per unit. Uses
 * a window-function LEAD to find each segment's end-odometer from the next event for that
 * driver, since duty_status_events only carries odometer_mi at segment START (append-only,
 * CAP-11) — the "distance traveled while in personal_conveyance" is the delta between a PC
 * event's own odometer and the odometer of the NEXT event for that driver (whatever status it
 * transitions to). Only segments with both odometer readings present and a non-negative delta
 * are counted; NULL/negative/out-of-window deltas are excluded rather than guessed.
 */
export async function aggregatePersonalConveyanceMiles(
  client: Queryable,
  operatingCompanyId: string,
  window: QuarterWindow
): Promise<PersonalConveyanceUnitRow[]> {
  const res = await client.query<{ unit_id: string | null; miles: string }>(
    `
      WITH ordered_events AS (
        SELECT
          driver_id,
          unit_id,
          duty_status,
          started_at,
          odometer_mi,
          LEAD(odometer_mi) OVER (PARTITION BY driver_id ORDER BY started_at) AS next_odometer_mi,
          LEAD(started_at) OVER (PARTITION BY driver_id ORDER BY started_at) AS next_started_at
        FROM hos.duty_status_events
        WHERE operating_company_id = $1::uuid
      )
      SELECT
        unit_id::text AS unit_id,
        COALESCE(SUM(GREATEST(next_odometer_mi - odometer_mi, 0)), 0)::numeric(12, 3) AS miles
      FROM ordered_events
      WHERE duty_status = 'personal_conveyance'
        AND started_at >= $2::date
        AND started_at < $3::date
        AND odometer_mi IS NOT NULL
        AND next_odometer_mi IS NOT NULL
        AND next_started_at < $3::date
      GROUP BY unit_id
    `,
    [operatingCompanyId, window.startDate, window.endDateExclusive]
  );

  return res.rows.map((row) => ({
    unit_id: row.unit_id,
    miles: Number(row.miles ?? 0),
  }));
}

export function totalPersonalConveyanceMiles(rows: PersonalConveyanceUnitRow[]): number {
  return rows.reduce((sum, row) => sum + row.miles, 0);
}
