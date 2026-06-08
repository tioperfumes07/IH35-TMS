/**
 * CAP-12 Tire Tread Projection Service — GAP-62
 * Linear regression on historical tread measurements to project replacement date.
 * DOT minimums: 4/32" steer, 2/32" drive/trailer (49 CFR §393.75).
 */
import type { PoolClient } from "pg";
import { dotThresholdForPosition, type TreadMeasurement } from "./measurement.service.js";

export type RegressionPoint = { x: number; y: number };

export type LinearRegressionResult = {
  slope: number;
  intercept: number;
};

export type ReplacementProjection = {
  unit_uuid: string;
  tire_position: string;
  threshold_32nds: number;
  current_depth_32nds: number | null;
  projected_replacement_date: string | null;
  wear_rate_32nds_per_day: number | null;
  days_until_replacement: number | null;
};

const MS_PER_DAY = 86_400_000;

export function linearRegression(points: RegressionPoint[]): LinearRegressionResult | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function projectReplacementFromMeasurements(
  measurements: TreadMeasurement[],
  position: string,
  dailyMileRate = 400
): ReplacementProjection {
  const threshold = dotThresholdForPosition(position);
  const sorted = [...measurements]
    .filter((m) => m.tire_position === position)
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  const unitUuid = sorted[0]?.unit_uuid ?? measurements[0]?.unit_uuid ?? "";
  if (sorted.length === 0) {
    return {
      unit_uuid: unitUuid,
      tire_position: position,
      threshold_32nds: threshold,
      current_depth_32nds: null,
      projected_replacement_date: null,
      wear_rate_32nds_per_day: null,
      days_until_replacement: null,
    };
  }

  const latest = sorted[sorted.length - 1]!;
  const currentDepth = latest.tread_depth_32nds;
  if (currentDepth <= threshold) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      unit_uuid: unitUuid,
      tire_position: position,
      threshold_32nds: threshold,
      current_depth_32nds: currentDepth,
      projected_replacement_date: today,
      wear_rate_32nds_per_day: null,
      days_until_replacement: 0,
    };
  }

  const points: RegressionPoint[] = sorted.map((m) => ({
    x: new Date(m.measured_at).getTime() / MS_PER_DAY,
    y: m.tread_depth_32nds,
  }));

  const regression = linearRegression(points);
  if (!regression || regression.slope >= 0) {
    const wearPerDay = estimateWearFromOdometer(sorted, dailyMileRate);
    return projectWithWearRate(latest, threshold, wearPerDay);
  }

  const targetDay = (threshold - regression.intercept) / regression.slope;
  const latestDay = points[points.length - 1]!.x;
  const daysUntil = Math.max(0, Math.ceil(targetDay - latestDay));
  const projectedDate = new Date(Date.now() + daysUntil * MS_PER_DAY).toISOString().slice(0, 10);

  return {
    unit_uuid: unitUuid,
    tire_position: position,
    threshold_32nds: threshold,
    current_depth_32nds: currentDepth,
    projected_replacement_date: projectedDate,
    wear_rate_32nds_per_day: Math.abs(regression.slope),
    days_until_replacement: daysUntil,
  };
}

function estimateWearFromOdometer(measurements: TreadMeasurement[], dailyMileRate: number): number | null {
  const withOdometer = measurements.filter((m) => m.odometer_miles != null);
  if (withOdometer.length < 2) {
    return dailyMileRate > 0 ? 32 / (80_000 / dailyMileRate) : null;
  }
  const first = withOdometer[0]!;
  const last = withOdometer[withOdometer.length - 1]!;
  const miles = (last.odometer_miles ?? 0) - (first.odometer_miles ?? 0);
  const days =
    (new Date(last.measured_at).getTime() - new Date(first.measured_at).getTime()) / MS_PER_DAY || 1;
  const depthLoss = first.tread_depth_32nds - last.tread_depth_32nds;
  if (depthLoss <= 0 || miles <= 0) return null;
  const milesPerDay = miles / days;
  return milesPerDay > 0 ? (depthLoss / miles) * milesPerDay : null;
}

function projectWithWearRate(
  latest: TreadMeasurement,
  threshold: number,
  wearPerDay: number | null
): ReplacementProjection {
  if (!wearPerDay || wearPerDay <= 0) {
    return {
      unit_uuid: latest.unit_uuid,
      tire_position: latest.tire_position,
      threshold_32nds: threshold,
      current_depth_32nds: latest.tread_depth_32nds,
      projected_replacement_date: null,
      wear_rate_32nds_per_day: null,
      days_until_replacement: null,
    };
  }
  const remaining = latest.tread_depth_32nds - threshold;
  const daysUntil = Math.ceil(remaining / wearPerDay);
  const projectedDate = new Date(Date.now() + daysUntil * MS_PER_DAY).toISOString().slice(0, 10);
  return {
    unit_uuid: latest.unit_uuid,
    tire_position: latest.tire_position,
    threshold_32nds: threshold,
    current_depth_32nds: latest.tread_depth_32nds,
    projected_replacement_date: projectedDate,
    wear_rate_32nds_per_day: wearPerDay,
    days_until_replacement: daysUntil,
  };
}

export async function projectReplacementDate(
  client: PoolClient,
  operatingCompanyId: string,
  unitUuid: string,
  position: string
): Promise<ReplacementProjection> {
  const res = await client.query<TreadMeasurement>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        tire_position,
        tread_depth_32nds,
        measured_at::text,
        measured_by_user_uuid::text,
        source,
        odometer_miles,
        created_at::text
      FROM maintenance.tire_tread_measurements
      WHERE operating_company_id = $1
        AND unit_uuid = $2
        AND tire_position = $3
      ORDER BY measured_at ASC
    `,
    [operatingCompanyId, unitUuid, position]
  );
  return projectReplacementFromMeasurements(res.rows, position);
}

export async function upsertProjection(
  client: PoolClient,
  operatingCompanyId: string,
  projection: ReplacementProjection
): Promise<void> {
  await client.query(
    `
      INSERT INTO maintenance.tire_projections (
        operating_company_id,
        unit_uuid,
        tire_position,
        threshold_32nds,
        current_depth_32nds,
        projected_replacement_date,
        wear_rate_32nds_per_day,
        computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, now())
      ON CONFLICT (operating_company_id, unit_uuid, tire_position)
      DO UPDATE SET
        threshold_32nds = EXCLUDED.threshold_32nds,
        current_depth_32nds = EXCLUDED.current_depth_32nds,
        projected_replacement_date = EXCLUDED.projected_replacement_date,
        wear_rate_32nds_per_day = EXCLUDED.wear_rate_32nds_per_day,
        computed_at = now()
    `,
    [
      operatingCompanyId,
      projection.unit_uuid,
      projection.tire_position,
      projection.threshold_32nds,
      projection.current_depth_32nds,
      projection.projected_replacement_date,
      projection.wear_rate_32nds_per_day,
    ]
  );
}

export async function listProjectionsForUnit(
  client: PoolClient,
  operatingCompanyId: string,
  unitUuid: string
): Promise<ReplacementProjection[]> {
  const res = await client.query<{
    unit_uuid: string;
    tire_position: string;
    threshold_32nds: number;
    current_depth_32nds: number | null;
    projected_replacement_date: string | null;
    wear_rate_32nds_per_day: string | null;
  }>(
    `
      SELECT
        unit_uuid::text,
        tire_position,
        threshold_32nds,
        current_depth_32nds,
        projected_replacement_date::text,
        wear_rate_32nds_per_day::text
      FROM maintenance.tire_projections
      WHERE operating_company_id = $1
        AND unit_uuid = $2
      ORDER BY tire_position
    `,
    [operatingCompanyId, unitUuid]
  );
  return res.rows.map((row) => ({
    unit_uuid: row.unit_uuid,
    tire_position: row.tire_position,
    threshold_32nds: row.threshold_32nds,
    current_depth_32nds: row.current_depth_32nds,
    projected_replacement_date: row.projected_replacement_date,
    wear_rate_32nds_per_day: row.wear_rate_32nds_per_day != null ? Number(row.wear_rate_32nds_per_day) : null,
    days_until_replacement: row.projected_replacement_date
      ? Math.max(
          0,
          Math.ceil(
            (new Date(row.projected_replacement_date).getTime() - Date.now()) / MS_PER_DAY
          )
        )
      : null,
  }));
}

export async function listAtRiskUnits(
  client: PoolClient,
  operatingCompanyId: string,
  withinDays: number
): Promise<
  Array<
    ReplacementProjection & {
      unit_number: string | null;
      position_group: string | null;
    }
  >
> {
  const res = await client.query<{
    unit_uuid: string;
    unit_number: string | null;
    tire_position: string;
    threshold_32nds: number;
    current_depth_32nds: number | null;
    projected_replacement_date: string | null;
    wear_rate_32nds_per_day: string | null;
    position_group: string | null;
  }>(
    `
      SELECT
        tp.unit_uuid::text,
        u.unit_number,
        tp.tire_position,
        tp.threshold_32nds,
        tp.current_depth_32nds,
        tp.projected_replacement_date::text,
        tp.wear_rate_32nds_per_day::text,
        CASE
          WHEN tp.tire_position ILIKE 'STEER-%' THEN 'steer'
          WHEN tp.tire_position ILIKE 'DRIVE-%' THEN 'drive'
          WHEN tp.tire_position ILIKE 'TRAILER-%' THEN 'trailer'
          ELSE NULL
        END AS position_group
      FROM maintenance.tire_projections tp
      JOIN mdata.units u ON u.id = tp.unit_uuid
      WHERE tp.operating_company_id = $1
        AND tp.projected_replacement_date IS NOT NULL
        AND tp.projected_replacement_date <= (CURRENT_DATE + ($2::int * INTERVAL '1 day'))
      ORDER BY tp.projected_replacement_date ASC, u.unit_number, tp.tire_position
    `,
    [operatingCompanyId, withinDays]
  );
  return res.rows.map((row) => ({
    unit_uuid: row.unit_uuid,
    unit_number: row.unit_number,
    tire_position: row.tire_position,
    threshold_32nds: row.threshold_32nds,
    current_depth_32nds: row.current_depth_32nds,
    projected_replacement_date: row.projected_replacement_date,
    wear_rate_32nds_per_day:
      row.wear_rate_32nds_per_day != null ? Number(row.wear_rate_32nds_per_day) : null,
    position_group: row.position_group,
    days_until_replacement: row.projected_replacement_date
      ? Math.max(
          0,
          Math.ceil(
            (new Date(row.projected_replacement_date).getTime() - Date.now()) / MS_PER_DAY
          )
        )
      : null,
  }));
}
