import type { PoolClient } from "pg";
import { buildCompositeInput, computeCompositeScore } from "./composite-score.js";

export type ScoringDbClient = Pick<PoolClient, "query">;

export type DriverSafetyScoreRow = {
  uuid: string;
  operating_company_id: string;
  driver_uuid: string;
  driver_name: string;
  period_start: string;
  period_end: string;
  harsh_brake_count: number;
  hard_accel_count: number;
  speeding_seconds: number;
  lane_departure_count: number;
  miles_driven: number;
  composite_score: number | null;
  rank_in_fleet: number | null;
  computed_at: string;
};

type RawDriverCounts = {
  driver_uuid: string;
  harsh_brake_count: number;
  hard_accel_count: number;
  speeding_seconds: number;
  lane_departure_count: number;
  miles_driven: number;
  driving_seconds: number;
};

const SPEEDING_EVENT_SECONDS = 60;

async function tableExists(client: ScoringDbClient, schema: string, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function aggregateDriverCountsForPeriod(
  client: ScoringDbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<RawDriverCounts[]> {
  const hasHarshEvents = await tableExists(client, "safety", "harsh_events");
  const hasAssignments = await tableExists(client, "telematics", "vehicle_driver_assignments");
  const hasLocations = await tableExists(client, "telematics", "vehicle_locations");

  if (!hasHarshEvents) return [];

  const eventRes = await client.query<{
    driver_uuid: string;
    harsh_brake_count: string;
    hard_accel_count: string;
    speeding_seconds: string;
    lane_departure_count: string;
  }>(
    `
      SELECT
        e.driver_id::text AS driver_uuid,
        COUNT(*) FILTER (WHERE e.event_kind = 'harsh_brake')::int AS harsh_brake_count,
        COUNT(*) FILTER (WHERE e.event_kind = 'harsh_accel')::int AS hard_accel_count,
        (COUNT(*) FILTER (WHERE e.event_kind = 'speeding') * $4::int)::int AS speeding_seconds,
        COUNT(*) FILTER (WHERE e.event_kind IN ('harsh_turn'))::int AS lane_departure_count
      FROM safety.harsh_events e
      WHERE e.operating_company_id = $1::uuid
        AND e.driver_id IS NOT NULL
        AND e.event_at >= $2::date
        AND e.event_at < ($3::date + interval '1 day')
      GROUP BY e.driver_id
    `,
    [operatingCompanyId, periodStart, periodEnd, SPEEDING_EVENT_SECONDS]
  );

  const milesByDriver = new Map<string, { miles: number; driving_seconds: number }>();

  if (hasAssignments && hasLocations) {
    const milesRes = await client.query<{ driver_uuid: string; miles: string; driving_seconds: string }>(
      `
        WITH bounds AS (
          SELECT
            $2::date::timestamptz AS period_start,
            ($3::date::timestamptz + interval '1 day') AS period_end
        ),
        mileage AS (
          SELECT
            a.driver_id::text AS driver_uuid,
            COALESCE(SUM(
              CASE
                WHEN p.prev_lat IS NULL OR p.prev_lng IS NULL THEN 0
                WHEN p.prev_ts IS NULL OR p.prev_ts < b.period_start THEN 0
                ELSE (
                  3958.7613 * 2 * asin(
                    sqrt(
                      power(sin(radians((p.lat - p.prev_lat) / 2)), 2) +
                      cos(radians(p.prev_lat)) * cos(radians(p.lat)) *
                      power(sin(radians((p.lng - p.prev_lng) / 2)), 2)
                    )
                  )
                )
              END
            ), 0)::numeric AS miles,
            COALESCE(SUM(
              CASE
                WHEN p.prev_ts IS NULL OR p.prev_ts < b.period_start THEN 0
                ELSE EXTRACT(EPOCH FROM (p.captured_at - GREATEST(p.prev_ts, b.period_start)))
              END
            ), 0)::numeric AS driving_seconds
          FROM (
            SELECT
              v.unit_id,
              v.captured_at,
              v.lat::float8 AS lat,
              v.lng::float8 AS lng,
              lag(v.lat::float8) OVER (PARTITION BY v.operating_company_id, v.unit_id ORDER BY v.captured_at) AS prev_lat,
              lag(v.lng::float8) OVER (PARTITION BY v.operating_company_id, v.unit_id ORDER BY v.captured_at) AS prev_lng,
              lag(v.captured_at) OVER (PARTITION BY v.operating_company_id, v.unit_id ORDER BY v.captured_at) AS prev_ts
            FROM telematics.vehicle_locations v
            CROSS JOIN bounds b
            WHERE v.operating_company_id = $1::uuid
              AND v.captured_at >= b.period_start
              AND v.captured_at < b.period_end
          ) p
          CROSS JOIN bounds b
          JOIN telematics.vehicle_driver_assignments a
            ON a.operating_company_id = $1::uuid
           AND a.unit_id = p.unit_id
           AND a.started_at <= p.captured_at
           AND (a.ended_at IS NULL OR a.ended_at > p.captured_at)
           AND a.driver_id IS NOT NULL
          GROUP BY a.driver_id
        )
        SELECT driver_uuid, miles, driving_seconds FROM mileage
      `,
      [operatingCompanyId, periodStart, periodEnd]
    );

    for (const row of milesRes.rows) {
      milesByDriver.set(row.driver_uuid, {
        miles: Number(row.miles ?? 0),
        driving_seconds: Number(row.driving_seconds ?? 0),
      });
    }
  }

  const activeDrivers = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND active = true
    `,
    [operatingCompanyId]
  );

  const byDriver = new Map<string, RawDriverCounts>();

  for (const driver of activeDrivers.rows) {
    byDriver.set(driver.id, {
      driver_uuid: driver.id,
      harsh_brake_count: 0,
      hard_accel_count: 0,
      speeding_seconds: 0,
      lane_departure_count: 0,
      miles_driven: 0,
      driving_seconds: 0,
    });
  }

  for (const row of eventRes.rows) {
    const miles = milesByDriver.get(row.driver_uuid);
    byDriver.set(row.driver_uuid, {
      driver_uuid: row.driver_uuid,
      harsh_brake_count: Number(row.harsh_brake_count ?? 0),
      hard_accel_count: Number(row.hard_accel_count ?? 0),
      speeding_seconds: Number(row.speeding_seconds ?? 0),
      lane_departure_count: Number(row.lane_departure_count ?? 0),
      miles_driven: miles?.miles ?? 0,
      driving_seconds: miles?.driving_seconds ?? 0,
    });
  }

  for (const [driverId, miles] of milesByDriver.entries()) {
    const existing = byDriver.get(driverId);
    if (existing) {
      existing.miles_driven = miles.miles;
      existing.driving_seconds = miles.driving_seconds;
    } else {
      byDriver.set(driverId, {
        driver_uuid: driverId,
        harsh_brake_count: 0,
        hard_accel_count: 0,
        speeding_seconds: 0,
        lane_departure_count: 0,
        miles_driven: miles.miles,
        driving_seconds: miles.driving_seconds,
      });
    }
  }

  return [...byDriver.values()];
}

export async function aggregateForPeriod(
  client: ScoringDbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ rows_written: number }> {
  const hasScores = await tableExists(client, "safety", "driver_safety_scores");
  if (!hasScores) return { rows_written: 0 };

  const counts = await aggregateDriverCountsForPeriod(client, operatingCompanyId, periodStart, periodEnd);

  const scored = counts.map((row) => {
    const compositeInput = buildCompositeInput(row);
    const composite_score = computeCompositeScore(compositeInput);
    return { ...row, composite_score };
  });

  scored.sort((a, b) => {
    const aScore = a.composite_score ?? -1;
    const bScore = b.composite_score ?? -1;
    if (bScore !== aScore) return bScore - aScore;
    return a.miles_driven - b.miles_driven;
  });

  let rank = 0;
  let rowsWritten = 0;

  for (const row of scored) {
    if (row.composite_score != null) rank += 1;
    await client.query(
      `
        INSERT INTO safety.driver_safety_scores (
          operating_company_id,
          driver_uuid,
          period_start,
          period_end,
          harsh_brake_count,
          hard_accel_count,
          speeding_seconds,
          lane_departure_count,
          miles_driven,
          composite_score,
          rank_in_fleet,
          computed_at
        )
        VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11, now())
        ON CONFLICT (driver_uuid, period_start, period_end)
        DO NOTHING
      `,
      [
        operatingCompanyId,
        row.driver_uuid,
        periodStart,
        periodEnd,
        row.harsh_brake_count,
        row.hard_accel_count,
        row.speeding_seconds,
        row.lane_departure_count,
        row.miles_driven,
        row.composite_score,
        row.composite_score != null ? rank : null,
      ]
    );
    rowsWritten += 1;
  }

  return { rows_written: rowsWritten };
}

export async function listPeriodLeaderboard(
  client: ScoringDbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<DriverSafetyScoreRow[]> {
  const hasScores = await tableExists(client, "safety", "driver_safety_scores");
  if (!hasScores) return [];

  const res = await client.query<DriverSafetyScoreRow>(
    `
      SELECT
        s.uuid::text,
        s.operating_company_id::text,
        s.driver_uuid::text,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
        s.period_start::text,
        s.period_end::text,
        s.harsh_brake_count::int,
        s.hard_accel_count::int,
        s.speeding_seconds::int,
        s.lane_departure_count::int,
        s.miles_driven::float8 AS miles_driven,
        s.composite_score::float8 AS composite_score,
        s.rank_in_fleet::int AS rank_in_fleet,
        s.computed_at::text
      FROM safety.driver_safety_scores s
      JOIN mdata.drivers d ON d.id = s.driver_uuid
      WHERE s.operating_company_id = $1::uuid
        AND s.period_start = $2::date
        AND s.period_end = $3::date
      ORDER BY s.rank_in_fleet NULLS LAST, driver_name ASC
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );

  return res.rows.map((row) => ({
    ...row,
    harsh_brake_count: Number(row.harsh_brake_count),
    hard_accel_count: Number(row.hard_accel_count),
    speeding_seconds: Number(row.speeding_seconds),
    lane_departure_count: Number(row.lane_departure_count),
    miles_driven: Number(row.miles_driven),
    composite_score: row.composite_score == null ? null : Number(row.composite_score),
    rank_in_fleet: row.rank_in_fleet == null ? null : Number(row.rank_in_fleet),
  }));
}

export async function listDriverTrend(
  client: ScoringDbClient,
  operatingCompanyId: string,
  driverUuid: string,
  periods: number
): Promise<DriverSafetyScoreRow[]> {
  const hasScores = await tableExists(client, "safety", "driver_safety_scores");
  if (!hasScores) return [];

  const res = await client.query<DriverSafetyScoreRow>(
    `
      SELECT
        s.uuid::text,
        s.operating_company_id::text,
        s.driver_uuid::text,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
        s.period_start::text,
        s.period_end::text,
        s.harsh_brake_count::int,
        s.hard_accel_count::int,
        s.speeding_seconds::int,
        s.lane_departure_count::int,
        s.miles_driven::float8 AS miles_driven,
        s.composite_score::float8 AS composite_score,
        s.rank_in_fleet::int AS rank_in_fleet,
        s.computed_at::text
      FROM safety.driver_safety_scores s
      JOIN mdata.drivers d ON d.id = s.driver_uuid
      WHERE s.operating_company_id = $1::uuid
        AND s.driver_uuid = $2::uuid
      ORDER BY s.period_end DESC
      LIMIT $3::int
    `,
    [operatingCompanyId, driverUuid, periods]
  );

  return res.rows
    .map((row) => ({
      ...row,
      harsh_brake_count: Number(row.harsh_brake_count),
      hard_accel_count: Number(row.hard_accel_count),
      speeding_seconds: Number(row.speeding_seconds),
      lane_departure_count: Number(row.lane_departure_count),
      miles_driven: Number(row.miles_driven),
      composite_score: row.composite_score == null ? null : Number(row.composite_score),
      rank_in_fleet: row.rank_in_fleet == null ? null : Number(row.rank_in_fleet),
    }))
    .reverse();
}

export function previousWeekPeriod(reference = new Date()): { period_start: string; period_end: string } {
  const day = reference.getUTCDay();
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - ((day + 7 - 0) % 7 || 7));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  };
}
