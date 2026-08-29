/**
 * GAP-28 — Driver layover detection service.
 * Detects gaps >8h between load delivery and next assignment for each driver.
 */
import type { PoolClient } from "pg";
import { withCurrentUser } from "../../auth/db.js";

export const LAYOVER_THRESHOLD_HOURS = 8;

export interface LayoverRow {
  uuid: string;
  driver_uuid: string;
  previous_load_uuid: string;
  previous_load_number: string;
  next_load_uuid: string | null;
  next_load_number: string | null;
  layover_started_at: string;
  layover_ended_at: string | null;
  duration_hours: number | null;
  layover_location: string | null;
  billable_to_customer: boolean;
  per_diem_eligible: boolean;
}

async function tableExists(client: PoolClient, schema: string, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Thrown when the detector CANNOT run. Never conflate this with "ran and found none" — the caller
 * must surface it distinctly, because layover is driver pay and a false zero silently underpays.
 */
export class LayoverDetectionUnavailableError extends Error {
  constructor(reason: string) {
    super(`layover detection unavailable: ${reason}`);
    this.name = "LayoverDetectionUnavailableError";
  }
}

/**
 * What a detection pass actually did. `inserted` alone is a lie waiting to happen: 0 inserted from
 * 0 resolvable deliveries is a DATA state, while 0 inserted from 40 resolvable deliveries is a real
 * "no layovers". The caller must be able to tell them apart.
 */
export type LayoverDetectionResult = {
  inserted: number;
  /** Delivered loads whose release time could be resolved — the denominator behind `inserted`. */
  resolvable_deliveries: number;
};

export async function detectLayovers(client: PoolClient, operatingCompanyId: string): Promise<LayoverDetectionResult> {
  const lockKey = `dispatch.layover_detector:${operatingCompanyId}`;
  await client.query(`SELECT pg_advisory_lock(hashtextextended($1::text, 0))`, [lockKey]);
  try {
  // CANONICAL SOURCES (§4, prod-verified 2026-07-27):
  //   driver     -> mdata.loads.assigned_primary_driver_id   (populated)
  //   delivered  -> the LAST stop_type='delivery' stop's actual_departure_at on mdata.load_stops
  //                 (truck-release basis — McLeod/Alvys treatment, defensible in a pay dispute)
  // The previous implementation joined mdata.load_assignments, which DOES NOT EXIST on prod (retired;
  // canonical is dispatch.load_assignment_history) and selected l.uuid / l.delivered_at, NEITHER of
  // which is a column on mdata.loads (its PK is id, and there is no delivered_at). It could not have
  // run — and it returned 0 rather than saying so.
  const hasLoads = await tableExists(client, "mdata", "loads");
  const hasStops = await tableExists(client, "mdata", "load_stops");
  if (!hasLoads) throw new LayoverDetectionUnavailableError("mdata.loads is absent");
  if (!hasStops) throw new LayoverDetectionUnavailableError("mdata.load_stops is absent — delivery time cannot be resolved");

  // Find consecutive load pairs for each driver with gap > 8h
  const gaps = await client.query(
    `WITH delivered AS (
       -- Truck-RELEASE basis: the last delivery stop's actual_departure_at. Layover accrues from when
       -- the truck is released, not when it arrives (McLeod / Alvys treatment).
       SELECT DISTINCT ON (s.load_id)
              s.load_id,
              s.actual_departure_at AS released_at
         FROM mdata.load_stops s
        WHERE s.stop_type = 'delivery'
          AND s.actual_departure_at IS NOT NULL
        ORDER BY s.load_id, s.sequence_number DESC
     ),
     started AS (
       -- A load's work starts at its FIRST stop's actual arrival; that is when the next assignment
       -- ends the layover.
       SELECT DISTINCT ON (s.load_id)
              s.load_id,
              s.actual_arrival_at AS started_at
         FROM mdata.load_stops s
        WHERE s.actual_arrival_at IS NOT NULL
        ORDER BY s.load_id, s.sequence_number ASC
     ),
     driver_loads AS (
       SELECT
         l.assigned_primary_driver_id AS driver_uuid,
         l.id AS load_uuid,
         l.operating_company_id,
         d.released_at AS delivered_at,
         LEAD(l.id)         OVER (PARTITION BY l.assigned_primary_driver_id ORDER BY d.released_at) AS next_load_uuid,
         LEAD(st.started_at) OVER (PARTITION BY l.assigned_primary_driver_id ORDER BY d.released_at) AS next_assigned_at
       FROM mdata.loads l
       JOIN delivered d ON d.load_id = l.id
       LEFT JOIN started st ON st.load_id = l.id
       WHERE l.operating_company_id = $1::uuid
         AND l.soft_deleted_at IS NULL
         AND l.assigned_primary_driver_id IS NOT NULL
     )
     SELECT
       driver_uuid,
       load_uuid AS previous_load_uuid,
       next_load_uuid,
       delivered_at AS layover_started_at,
       next_assigned_at AS layover_ended_at,
       EXTRACT(EPOCH FROM (next_assigned_at - delivered_at)) / 3600.0 AS gap_hours
     FROM driver_loads
     WHERE next_assigned_at IS NOT NULL
       AND EXTRACT(EPOCH FROM (next_assigned_at - delivered_at)) / 3600.0 > $2
       AND delivered_at > now() - INTERVAL '30 days'`,
    [operatingCompanyId, LAYOVER_THRESHOLD_HOURS]
  );

  // The denominator: how many delivered loads this entity could even be evaluated on.
  const resolvable = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM mdata.loads l
       JOIN mdata.load_stops s ON s.load_id = l.id
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.assigned_primary_driver_id IS NOT NULL
        AND s.stop_type = 'delivery'
        AND s.actual_departure_at IS NOT NULL`,
    [operatingCompanyId]
  );
  const resolvableDeliveries = Number(resolvable.rows[0]?.n ?? 0);

  let inserted = 0;
  for (const row of gaps.rows) {
    const existing = await client.query(
      `SELECT 1 FROM dispatch.driver_layovers
       WHERE driver_uuid = $1 AND previous_load_uuid = $2 LIMIT 1`,
      [row.driver_uuid, row.previous_load_uuid]
    );
    if (existing.rows.length > 0) continue;

    await client.query(
      `INSERT INTO dispatch.driver_layovers
         (operating_company_id, driver_uuid, previous_load_uuid, next_load_uuid,
          layover_started_at, layover_ended_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [operatingCompanyId, row.driver_uuid, row.previous_load_uuid, row.next_load_uuid,
       row.layover_started_at, row.layover_ended_at]
    );
    inserted++;
  }
    return { inserted, resolvable_deliveries: resolvableDeliveries };
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtextextended($1::text, 0))`, [lockKey]);
  }
}

export async function getLayoversForDriver(
  userUuid: string,
  operatingCompanyId: string,
  driverUuid: string,
  from?: string,
  to?: string
): Promise<LayoverRow[]> {
  return withCurrentUser(userUuid, async (client) => {
    const params: unknown[] = [operatingCompanyId, driverUuid];
    let dateFilter = "";
    if (from && to) {
      params.push(from, to);
      dateFilter = `AND layover_started_at BETWEEN $${params.length - 1}::date AND ($${params.length}::date + INTERVAL '1 day')`;
    }
    const res = await client.query<LayoverRow>(
      `SELECT dl.uuid, dl.driver_uuid, dl.previous_load_uuid, previous_load.load_number AS previous_load_number,
              dl.next_load_uuid, next_load.load_number AS next_load_number,
              dl.layover_started_at, dl.layover_ended_at, dl.duration_hours,
              dl.layover_location, dl.billable_to_customer, dl.per_diem_eligible
       FROM dispatch.driver_layovers dl
       JOIN mdata.loads previous_load
         ON previous_load.id = dl.previous_load_uuid
        AND previous_load.operating_company_id = dl.operating_company_id
       LEFT JOIN mdata.loads next_load
         ON next_load.id = dl.next_load_uuid
        AND next_load.operating_company_id = dl.operating_company_id
       WHERE dl.operating_company_id = $1::uuid AND dl.driver_uuid = $2
         ${dateFilter}
       ORDER BY dl.layover_started_at DESC, dl.uuid DESC`,
      params
    );
    return res.rows;
  });
}

export async function getLayoverSummary(
  userUuid: string,
  operatingCompanyId: string,
  driverUuid: string,
  lastDays = 30
): Promise<{ total_layovers: number; total_hours: number; billable_count: number; per_diem_count: number }> {
  return withCurrentUser(userUuid, async (client) => {
    const res = await client.query(
      `SELECT
         COUNT(*) AS total_layovers,
         COALESCE(SUM(duration_hours), 0) AS total_hours,
         COUNT(*) FILTER (WHERE billable_to_customer) AS billable_count,
         COUNT(*) FILTER (WHERE per_diem_eligible) AS per_diem_count
       FROM dispatch.driver_layovers
       WHERE operating_company_id = $1::uuid
         AND driver_uuid = $2
         AND layover_started_at >= now() - ($3 * INTERVAL '1 day')`,
      [operatingCompanyId, driverUuid, lastDays]
    );
    return res.rows[0] ?? { total_layovers: 0, total_hours: 0, billable_count: 0, per_diem_count: 0 };
  });
}
