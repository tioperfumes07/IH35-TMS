/**
 * GAP-29 — Booking-gap time per dispatcher analytics.
 * Measures time between load delivery and next unit assignment for each dispatcher.
 * Filter: gaps > 24h excluded (weekends/downtime per spec).
 *
 * Real schema:
 *   - mdata.loads: booked_by_user_id (FK → identity.users.id), status enum
 *   - mdata.load_stops: stop_type = 'delivery', actual_departure_at
 *   - dispatch.load_assignment_history: load_id, new_unit_id, assigned_at
 *   - identity.users: first_name, last_name, email (no full_name column)
 */
import type { PoolClient } from "pg";
import { withCurrentUser } from "../../auth/db.js";

export interface DispatcherGapStats {
  dispatcher_id: string | null;
  dispatcher_label: string;
  loads_counted: number;
  avg_gap_hours: number;
  p50_gap_hours: number;
  p90_gap_hours: number;
  rank: number;
}

export interface BookingGapPeriodResult {
  from: string;
  to: string;
  dispatchers: DispatcherGapStats[];
}

async function tableExists(client: PoolClient, schema: string, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function aggregateForPeriod(
  client: PoolClient,
  operatingCompanyId: string,
  from: string,
  to: string
): Promise<BookingGapPeriodResult> {
  const [hasLoads, hasStops, hasHistory] = await Promise.all([
    tableExists(client, "mdata", "loads"),
    tableExists(client, "mdata", "load_stops"),
    tableExists(client, "dispatch", "load_assignment_history"),
  ]);

  if (!hasLoads || !hasStops || !hasHistory) {
    return { from, to, dispatchers: [] };
  }

  const result = await client.query(
    `WITH delivered_loads AS (
       -- Each delivered load with its dispatcher and delivery stop departure time
       SELECT DISTINCT ON (l.id)
         l.id AS load_id,
         l.booked_by_user_id AS dispatcher_id,
         lah.new_unit_id AS unit_id,
         ls.actual_departure_at AS delivered_at
       FROM mdata.loads l
       JOIN mdata.load_stops ls
         ON ls.load_id = l.id
         AND ls.stop_type = 'delivery'
         AND ls.actual_departure_at IS NOT NULL
         AND ls.actual_departure_at BETWEEN $2::date AND ($3::date + INTERVAL '1 day')
       JOIN dispatch.load_assignment_history lah
         ON lah.load_id = l.id
         AND lah.new_unit_id IS NOT NULL
       WHERE l.operating_company_id = $1::uuid
         AND l.status::text IN ('delivered', 'delivered_pending_docs')
         AND l.soft_deleted_at IS NULL
       ORDER BY l.id, lah.assigned_at DESC
     ),
     next_assignments AS (
       -- For each delivered load, find the earliest subsequent assignment of the same unit
       SELECT
         dl.load_id,
         dl.dispatcher_id,
         dl.delivered_at,
         MIN(lah2.assigned_at) AS next_assigned_at
       FROM delivered_loads dl
       JOIN dispatch.load_assignment_history lah2
         ON lah2.new_unit_id = dl.unit_id
         AND lah2.load_id != dl.load_id
         AND lah2.assigned_at > dl.delivered_at
       GROUP BY dl.load_id, dl.dispatcher_id, dl.delivered_at
     ),
     gaps AS (
       SELECT
         dispatcher_id,
         EXTRACT(EPOCH FROM (next_assigned_at - delivered_at)) / 3600.0 AS gap_hours
       FROM next_assignments
     ),
     filtered AS (
       SELECT dispatcher_id, gap_hours
       FROM gaps
       WHERE gap_hours IS NOT NULL
         AND gap_hours > 0
         AND gap_hours <= 24
     ),
     stats AS (
       SELECT
         dispatcher_id,
         COUNT(*) AS loads_counted,
         AVG(gap_hours) AS avg_gap_hours,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_hours) AS p50_gap_hours,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY gap_hours) AS p90_gap_hours
       FROM filtered
       GROUP BY dispatcher_id
     )
     SELECT
       s.dispatcher_id,
       COALESCE(
         NULLIF(trim(concat(u.first_name, ' ', u.last_name)), ''),
         u.email,
         'Unknown'
       ) AS dispatcher_label,
       s.loads_counted::integer,
       ROUND(s.avg_gap_hours::numeric, 2) AS avg_gap_hours,
       ROUND(s.p50_gap_hours::numeric, 2) AS p50_gap_hours,
       ROUND(s.p90_gap_hours::numeric, 2) AS p90_gap_hours,
       RANK() OVER (ORDER BY s.avg_gap_hours ASC) AS rank
     FROM stats s
     LEFT JOIN identity.users u ON u.id = s.dispatcher_id
     ORDER BY rank`,
    [operatingCompanyId, from, to]
  );

  return {
    from,
    to,
    dispatchers: result.rows.map((r) => ({
      dispatcher_id: r.dispatcher_id ?? null,
      dispatcher_label: r.dispatcher_label ?? "Unknown",
      loads_counted: Number(r.loads_counted),
      avg_gap_hours: parseFloat(r.avg_gap_hours),
      p50_gap_hours: parseFloat(r.p50_gap_hours),
      p90_gap_hours: parseFloat(r.p90_gap_hours),
      rank: Number(r.rank),
    })),
  };
}

export async function getDispatcherDetail(
  requestingUserUuid: string,
  operatingCompanyId: string,
  dispatcherUuid: string,
  from: string,
  to: string
): Promise<DispatcherGapStats | null> {
  const full = await withCurrentUser(requestingUserUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return aggregateForPeriod(client, operatingCompanyId, from, to);
  });
  return full.dispatchers.find((d) => d.dispatcher_id === dispatcherUuid) ?? null;
}
