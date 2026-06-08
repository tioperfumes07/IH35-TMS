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
  next_load_uuid: string | null;
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

export async function detectLayovers(client: PoolClient, operatingCompanyId: string): Promise<number> {
  const hasLoads = await tableExists(client, "mdata", "loads");
  const hasAssignments = await tableExists(client, "mdata", "load_assignments");
  if (!hasLoads || !hasAssignments) return 0;

  // Find consecutive load pairs for each driver with gap > 8h
  const gaps = await client.query(
    `WITH driver_loads AS (
       SELECT
         la.driver_uuid,
         l.uuid AS load_uuid,
         l.operating_company_id,
         l.delivered_at,
         LEAD(l.uuid) OVER (PARTITION BY la.driver_uuid ORDER BY l.delivered_at) AS next_load_uuid,
         LEAD(la.assigned_at) OVER (PARTITION BY la.driver_uuid ORDER BY l.delivered_at) AS next_assigned_at
       FROM mdata.loads l
       JOIN mdata.load_assignments la ON la.load_uuid = l.uuid
       WHERE l.operating_company_id = $1
         AND l.status = 'delivered'
         AND l.delivered_at IS NOT NULL
         AND la.driver_uuid IS NOT NULL
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
  return inserted;
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
      `SELECT uuid, driver_uuid, previous_load_uuid, next_load_uuid,
              layover_started_at, layover_ended_at, duration_hours,
              layover_location, billable_to_customer, per_diem_eligible
       FROM dispatch.driver_layovers
       WHERE operating_company_id = $1 AND driver_uuid = $2
         ${dateFilter}
       ORDER BY layover_started_at DESC
       LIMIT 100`,
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
       WHERE operating_company_id = $1
         AND driver_uuid = $2
         AND layover_started_at >= now() - ($3 * INTERVAL '1 day')`,
      [operatingCompanyId, driverUuid, lastDays]
    );
    return res.rows[0] ?? { total_layovers: 0, total_hours: 0, billable_count: 0, per_diem_count: 0 };
  });
}
