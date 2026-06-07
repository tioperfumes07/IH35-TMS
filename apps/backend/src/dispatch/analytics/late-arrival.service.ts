import type { PoolClient } from "pg";
import { withCurrentUser } from "../../auth/db.js";
import { lateArrivalGraceMinutes } from "../late-arrivals.service.js";

export type LateArrivalGroupBy = "driver" | "customer" | "lane";

export interface LateArrivalAggregateRow {
  entity_id: string;
  entity_label: string;
  late_count: number;
  total_count: number;
  late_rate: number;
  chronic_offender: boolean;
}

export interface LateArrivalEntityDetail {
  entity_id: string;
  entity_label: string;
  late_count: number;
  total_count: number;
  late_rate: number;
  chronic_offender: boolean;
  grace_minutes: number;
  from: string;
  to: string;
}

export function computeLateRate(lateCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return lateCount / totalCount;
}

export function isChronicOffender(lateRate: number, threshold = 0.2): boolean {
  return lateRate > threshold;
}

export function isLateArrival(input: {
  arrived_at: Date | string;
  scheduled_at: Date | string | null | undefined;
  grace_minutes: number;
}): boolean {
  if (!input.scheduled_at) return false;
  const scheduledMs = new Date(input.scheduled_at).getTime();
  const arrivedMs = new Date(input.arrived_at).getTime();
  if (!Number.isFinite(scheduledMs) || !Number.isFinite(arrivedMs)) return false;
  return arrivedMs > scheduledMs + input.grace_minutes * 60_000;
}

async function tableExists(client: PoolClient, qualified: string): Promise<boolean> {
  const [schema, table] = qualified.includes(".") ? qualified.split(".") : ["public", qualified];
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return res.rowCount > 0;
}

const COMPLETED_STOPS_CTE = `
  completed AS (
    SELECT
      sa.driver_id,
      l.customer_id,
      c.customer_name,
      d.first_name AS driver_first_name,
      d.last_name AS driver_last_name,
      lane.origin_city,
      lane.origin_state,
      lane.destination_city,
      lane.destination_state,
      COALESCE(sa.confirmed_at, sa.triggered_at) AS arrived_at,
      COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at) AS scheduled_at
    FROM dispatch.stop_arrivals sa
    JOIN mdata.load_stops ls ON ls.id = sa.stop_id
    JOIN mdata.loads l ON l.id = ls.load_id
    LEFT JOIN mdata.customers c ON c.id = l.customer_id
    LEFT JOIN mdata.drivers d ON d.id = sa.driver_id
    LEFT JOIN LATERAL (
      SELECT
        NULLIF(trim(p.city), '') AS origin_city,
        NULLIF(trim(p.state), '') AS origin_state,
        NULLIF(trim(del.city), '') AS destination_city,
        NULLIF(trim(del.state), '') AS destination_state
      FROM mdata.load_stops p
      JOIN mdata.load_stops del ON del.load_id = l.id
      WHERE p.load_id = l.id
        AND p.stop_type = 'pickup'
        AND del.stop_type = 'delivery'
      ORDER BY p.stop_sequence ASC, del.stop_sequence DESC
      LIMIT 1
    ) lane ON true
    WHERE sa.operating_company_id = $1::uuid
      AND l.operating_company_id = $1::uuid
      AND l.soft_deleted_at IS NULL
      AND COALESCE(sa.confirmed_at, sa.triggered_at) >= $2::timestamptz
      AND COALESCE(sa.confirmed_at, sa.triggered_at) < ($3::date + interval '1 day')
      AND COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at) IS NOT NULL
  )
`;

function buildAggregateQuery(
  groupBy: LateArrivalGroupBy,
  entityFilter?: { sql: string; value: string }
): { sql: string; params: unknown[] } {
  const graceMinutes = lateArrivalGraceMinutes();
  const filterClause = entityFilter ? `AND ${entityFilter.sql}` : "";
  const graceParam = entityFilter ? "$5" : "$4";

  let selectSql = "";
  switch (groupBy) {
    case "driver":
      selectSql = `
        SELECT
          driver_id::text AS entity_id,
          trim(concat(coalesce(driver_first_name, ''), ' ', coalesce(driver_last_name, ''))) AS entity_label,
          count(*) FILTER (
            WHERE arrived_at > scheduled_at + (${graceParam}::int * interval '1 minute')
          )::int AS late_count,
          count(*)::int AS total_count
        FROM completed
        WHERE driver_id IS NOT NULL ${filterClause}
        GROUP BY driver_id, driver_first_name, driver_last_name
      `;
      break;
    case "customer":
      selectSql = `
        SELECT
          customer_id::text AS entity_id,
          coalesce(customer_name, 'Unknown customer') AS entity_label,
          count(*) FILTER (
            WHERE arrived_at > scheduled_at + (${graceParam}::int * interval '1 minute')
          )::int AS late_count,
          count(*)::int AS total_count
        FROM completed
        WHERE customer_id IS NOT NULL ${filterClause}
        GROUP BY customer_id, customer_name
      `;
      break;
    case "lane":
      selectSql = `
        SELECT
          concat(origin_city, '|', origin_state, '|', destination_city, '|', destination_state) AS entity_id,
          concat(origin_city, ', ', origin_state, ' → ', destination_city, ', ', destination_state) AS entity_label,
          count(*) FILTER (
            WHERE arrived_at > scheduled_at + (${graceParam}::int * interval '1 minute')
          )::int AS late_count,
          count(*)::int AS total_count
        FROM completed
        WHERE origin_city IS NOT NULL AND destination_city IS NOT NULL ${filterClause}
        GROUP BY origin_city, origin_state, destination_city, destination_state
      `;
      break;
    default:
      throw new Error(`unsupported groupBy: ${groupBy satisfies never}`);
  }

  const params: unknown[] = entityFilter
    ? ["$1", "$2", "$3", entityFilter.value, graceMinutes]
    : ["$1", "$2", "$3", graceMinutes];

  return {
    sql: `
      WITH ${COMPLETED_STOPS_CTE}
      ${selectSql}
      HAVING count(*) > 0
      ORDER BY late_count DESC, entity_label ASC
      LIMIT 500
    `,
    params: [],
  };
}

async function queryAggregates(
  client: PoolClient,
  operatingCompanyId: string,
  from: string,
  to: string,
  groupBy: LateArrivalGroupBy,
  entityFilter?: { sql: string; value: string }
): Promise<LateArrivalAggregateRow[]> {
  if (!(await tableExists(client, "dispatch.stop_arrivals"))) return [];

  const graceMinutes = lateArrivalGraceMinutes();
  const filterClause = entityFilter ? `AND ${entityFilter.sql}` : "";
  const graceParam = entityFilter ? "$5" : "$4";
  const params = entityFilter
    ? [operatingCompanyId, from, to, entityFilter.value, graceMinutes]
    : [operatingCompanyId, from, to, graceMinutes];

  let selectSql = "";
  switch (groupBy) {
    case "driver":
      selectSql = `
        SELECT
          driver_id::text AS entity_id,
          trim(concat(coalesce(driver_first_name, ''), ' ', coalesce(driver_last_name, ''))) AS entity_label,
          count(*) FILTER (
            WHERE arrived_at > scheduled_at + (${graceParam}::int * interval '1 minute')
          )::int AS late_count,
          count(*)::int AS total_count
        FROM completed
        WHERE driver_id IS NOT NULL ${filterClause}
        GROUP BY driver_id, driver_first_name, driver_last_name
      `;
      break;
    case "customer":
      selectSql = `
        SELECT
          customer_id::text AS entity_id,
          coalesce(customer_name, 'Unknown customer') AS entity_label,
          count(*) FILTER (
            WHERE arrived_at > scheduled_at + (${graceParam}::int * interval '1 minute')
          )::int AS late_count,
          count(*)::int AS total_count
        FROM completed
        WHERE customer_id IS NOT NULL ${filterClause}
        GROUP BY customer_id, customer_name
      `;
      break;
    case "lane":
      selectSql = `
        SELECT
          concat(origin_city, '|', origin_state, '|', destination_city, '|', destination_state) AS entity_id,
          concat(origin_city, ', ', origin_state, ' → ', destination_city, ', ', destination_state) AS entity_label,
          count(*) FILTER (
            WHERE arrived_at > scheduled_at + (${graceParam}::int * interval '1 minute')
          )::int AS late_count,
          count(*)::int AS total_count
        FROM completed
        WHERE origin_city IS NOT NULL AND destination_city IS NOT NULL ${filterClause}
        GROUP BY origin_city, origin_state, destination_city, destination_state
      `;
      break;
  }

  const res = await client.query(
    `
      WITH ${COMPLETED_STOPS_CTE}
      ${selectSql}
      HAVING count(*) > 0
      ORDER BY late_count DESC, entity_label ASC
      LIMIT 500
    `,
    params
  );

  return res.rows.map((row) => {
    const lateCount = Number(row.late_count ?? 0);
    const totalCount = Number(row.total_count ?? 0);
    const lateRate = computeLateRate(lateCount, totalCount);
    return {
      entity_id: String(row.entity_id ?? ""),
      entity_label: String(row.entity_label ?? "Unknown").trim() || "Unknown",
      late_count: lateCount,
      total_count: totalCount,
      late_rate: lateRate,
      chronic_offender: isChronicOffender(lateRate),
    };
  });
}

export async function aggregateLateArrivals(
  userId: string,
  operatingCompanyId: string,
  from: string,
  to: string,
  groupBy: LateArrivalGroupBy
): Promise<{ grace_minutes: number; from: string; to: string; group_by: LateArrivalGroupBy; rows: LateArrivalAggregateRow[] }> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const rows = await queryAggregates(client, operatingCompanyId, from, to, groupBy);
    return {
      grace_minutes: lateArrivalGraceMinutes(),
      from,
      to,
      group_by: groupBy,
      rows,
    };
  });
}

export async function getDriverLateArrivalDetail(
  userId: string,
  operatingCompanyId: string,
  driverUuid: string,
  from: string,
  to: string
): Promise<LateArrivalEntityDetail | null> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const rows = await queryAggregates(client, operatingCompanyId, from, to, "driver", {
      sql: "driver_id::text = $4::text",
      value: driverUuid,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      grace_minutes: lateArrivalGraceMinutes(),
      from,
      to,
    };
  });
}

export async function getCustomerLateArrivalDetail(
  userId: string,
  operatingCompanyId: string,
  customerUuid: string,
  from: string,
  to: string
): Promise<LateArrivalEntityDetail | null> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const rows = await queryAggregates(client, operatingCompanyId, from, to, "customer", {
      sql: "customer_id::text = $4::text",
      value: customerUuid,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      grace_minutes: lateArrivalGraceMinutes(),
      from,
      to,
    };
  });
}

export async function runLateArrivalAggregatorTick(client: PoolClient): Promise<number> {
  const companies = await client.query(`SELECT id::text FROM org.companies WHERE is_active = true LIMIT 200`);
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 30);
  const from = fromDate.toISOString().slice(0, 10);
  let processed = 0;

  for (const row of companies.rows) {
    const ociId = String(row.id ?? "");
    if (!ociId) continue;
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [ociId]);
    for (const groupBy of ["driver", "customer", "lane"] as LateArrivalGroupBy[]) {
      await queryAggregates(client, ociId, from, to, groupBy);
    }
    processed += 1;
  }

  return processed;
}
