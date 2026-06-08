/**
 * CAP-13 Brake Wear Service — GAP-63
 * Lining thickness tracking + replacement projection (PM, DVIR, brake service, Samsara).
 * DOT minimums: 6.4 mm steer · 3.2 mm drive (49 CFR §393.47).
 */

export type BrakeMeasurementSource = "dvir" | "pm_inspection" | "brake_service" | "samsara_diagnostics";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type BrakeMeasurement = {
  uuid: string;
  operating_company_id: string;
  unit_uuid: string;
  brake_position: string;
  lining_thickness_mm: number;
  measured_at: string;
  measured_by_user_uuid: string | null;
  source: BrakeMeasurementSource;
  odometer_miles: number | null;
  created_at: string;
};

export type RecordMeasurementInput = {
  operating_company_id: string;
  unit_uuid: string;
  position: string;
  thickness_mm: number;
  source: BrakeMeasurementSource;
  measured_at?: string;
  measured_by_user_uuid?: string | null;
  odometer_miles?: number | null;
};

export type ReplacementProjection = {
  unit_uuid: string;
  brake_position: string;
  threshold_mm: number;
  current_thickness_mm: number | null;
  projected_replacement_date: string | null;
  wear_rate_mm_per_day: number | null;
  days_until_replacement: number | null;
};

export type AtRiskBrakeRow = ReplacementProjection & {
  unit_number: string | null;
  axle_group: "steer" | "drive" | "other";
};

/** Standard tractor brake positions for projection seeding. */
export const TRACTOR_BRAKE_POSITIONS = ["LF-S", "RF-S", "LR1-D", "RR1-D", "LR2-D", "RR2-D"] as const;

const MS_PER_DAY = 86_400_000;
const STEER_THRESHOLD_MM = 6.4;
const DRIVE_THRESHOLD_MM = 3.2;

export type RegressionPoint = { x: number; y: number };

export type LinearRegressionResult = {
  slope: number;
  intercept: number;
};

export function axleGroupForPosition(position: string): "steer" | "drive" | "other" {
  if (/-S$/i.test(position) || /^LF-S|^RF-S/i.test(position)) return "steer";
  if (/-D$/i.test(position) || /^L[RL]\d-D|^R[RL]\d-D/i.test(position)) return "drive";
  return "other";
}

export function dotThresholdForPosition(position: string): number {
  return axleGroupForPosition(position) === "steer" ? STEER_THRESHOLD_MM : DRIVE_THRESHOLD_MM;
}

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

export async function recordMeasurement(
  client: DbClient,
  input: RecordMeasurementInput
): Promise<BrakeMeasurement> {
  const res = await client.query<BrakeMeasurement>(
    `
      INSERT INTO maintenance.brake_wear_measurements (
        operating_company_id,
        unit_uuid,
        brake_position,
        lining_thickness_mm,
        measured_at,
        measured_by_user_uuid,
        source,
        odometer_miles
      ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7, $8)
      RETURNING
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        brake_position,
        lining_thickness_mm::float8 AS lining_thickness_mm,
        measured_at::text,
        measured_by_user_uuid::text,
        source,
        odometer_miles,
        created_at::text
    `,
    [
      input.operating_company_id,
      input.unit_uuid,
      input.position,
      input.thickness_mm,
      input.measured_at ?? null,
      input.measured_by_user_uuid ?? null,
      input.source,
      input.odometer_miles ?? null,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error("brake_measurement_insert_failed");
  return row;
}

export async function getLatestForUnit(
  client: DbClient,
  operatingCompanyId: string,
  unitUuid: string
): Promise<BrakeMeasurement[]> {
  const res = await client.query<BrakeMeasurement>(
    `
      SELECT DISTINCT ON (brake_position)
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        brake_position,
        lining_thickness_mm::float8 AS lining_thickness_mm,
        measured_at::text,
        measured_by_user_uuid::text,
        source,
        odometer_miles,
        created_at::text
      FROM maintenance.brake_wear_measurements
      WHERE operating_company_id = $1
        AND unit_uuid = $2
      ORDER BY brake_position, measured_at DESC
    `,
    [operatingCompanyId, unitUuid]
  );
  return res.rows;
}

export async function listMeasurements(
  client: DbClient,
  operatingCompanyId: string,
  filters: { unit_uuid?: string; position?: string; limit?: number }
): Promise<BrakeMeasurement[]> {
  const clauses = ["operating_company_id = $1"];
  const values: unknown[] = [operatingCompanyId];
  if (filters.unit_uuid) {
    values.push(filters.unit_uuid);
    clauses.push(`unit_uuid = $${values.length}`);
  }
  if (filters.position) {
    values.push(filters.position);
    clauses.push(`brake_position = $${values.length}`);
  }
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  values.push(limit);
  const res = await client.query<BrakeMeasurement>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        brake_position,
        lining_thickness_mm::float8 AS lining_thickness_mm,
        measured_at::text,
        measured_by_user_uuid::text,
        source,
        odometer_miles,
        created_at::text
      FROM maintenance.brake_wear_measurements
      WHERE ${clauses.join(" AND ")}
      ORDER BY measured_at DESC
      LIMIT $${values.length}
    `,
    values
  );
  return res.rows;
}

function estimateWearFromOdometer(measurements: BrakeMeasurement[], dailyMileRate = 400): number | null {
  const withOdometer = measurements.filter((m) => m.odometer_miles != null);
  if (withOdometer.length < 2) {
    return dailyMileRate > 0 ? 12 / (120_000 / dailyMileRate) : null;
  }
  const first = withOdometer[0]!;
  const last = withOdometer[withOdometer.length - 1]!;
  const miles = (last.odometer_miles ?? 0) - (first.odometer_miles ?? 0);
  const days =
    (new Date(last.measured_at).getTime() - new Date(first.measured_at).getTime()) / MS_PER_DAY || 1;
  const depthLoss = first.lining_thickness_mm - last.lining_thickness_mm;
  if (depthLoss <= 0 || miles <= 0) return null;
  const milesPerDay = miles / days;
  return milesPerDay > 0 ? (depthLoss / miles) * milesPerDay : null;
}

function projectWithWearRate(
  latest: BrakeMeasurement,
  threshold: number,
  wearPerDay: number | null
): ReplacementProjection {
  if (!wearPerDay || wearPerDay <= 0) {
    return {
      unit_uuid: latest.unit_uuid,
      brake_position: latest.brake_position,
      threshold_mm: threshold,
      current_thickness_mm: latest.lining_thickness_mm,
      projected_replacement_date: null,
      wear_rate_mm_per_day: null,
      days_until_replacement: null,
    };
  }
  const remaining = latest.lining_thickness_mm - threshold;
  const daysUntil = Math.ceil(remaining / wearPerDay);
  const projectedDate = new Date(Date.now() + daysUntil * MS_PER_DAY).toISOString().slice(0, 10);
  return {
    unit_uuid: latest.unit_uuid,
    brake_position: latest.brake_position,
    threshold_mm: threshold,
    current_thickness_mm: latest.lining_thickness_mm,
    projected_replacement_date: projectedDate,
    wear_rate_mm_per_day: wearPerDay,
    days_until_replacement: daysUntil,
  };
}

export function projectReplacementFromMeasurements(
  measurements: BrakeMeasurement[],
  position: string,
  dailyMileRate = 400
): ReplacementProjection {
  const threshold = dotThresholdForPosition(position);
  const sorted = [...measurements]
    .filter((m) => m.brake_position === position)
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  const unitUuid = sorted[0]?.unit_uuid ?? measurements[0]?.unit_uuid ?? "";
  if (sorted.length === 0) {
    return {
      unit_uuid: unitUuid,
      brake_position: position,
      threshold_mm: threshold,
      current_thickness_mm: null,
      projected_replacement_date: null,
      wear_rate_mm_per_day: null,
      days_until_replacement: null,
    };
  }

  const latest = sorted[sorted.length - 1]!;
  const currentThickness = latest.lining_thickness_mm;
  if (currentThickness <= threshold) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      unit_uuid: unitUuid,
      brake_position: position,
      threshold_mm: threshold,
      current_thickness_mm: currentThickness,
      projected_replacement_date: today,
      wear_rate_mm_per_day: null,
      days_until_replacement: 0,
    };
  }

  const points: RegressionPoint[] = sorted.map((m) => ({
    x: new Date(m.measured_at).getTime() / MS_PER_DAY,
    y: m.lining_thickness_mm,
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
    brake_position: position,
    threshold_mm: threshold,
    current_thickness_mm: currentThickness,
    projected_replacement_date: projectedDate,
    wear_rate_mm_per_day: Math.abs(regression.slope),
    days_until_replacement: daysUntil,
  };
}

export async function projectReplacement(
  client: DbClient,
  operatingCompanyId: string,
  unitUuid: string,
  position: string
): Promise<ReplacementProjection> {
  const res = await client.query<BrakeMeasurement>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        brake_position,
        lining_thickness_mm::float8 AS lining_thickness_mm,
        measured_at::text,
        measured_by_user_uuid::text,
        source,
        odometer_miles,
        created_at::text
      FROM maintenance.brake_wear_measurements
      WHERE operating_company_id = $1
        AND unit_uuid = $2
        AND brake_position = $3
      ORDER BY measured_at ASC
    `,
    [operatingCompanyId, unitUuid, position]
  );
  return projectReplacementFromMeasurements(res.rows, position);
}

export async function upsertProjection(
  client: DbClient,
  operatingCompanyId: string,
  projection: ReplacementProjection
): Promise<void> {
  await client.query(
    `
      INSERT INTO maintenance.brake_projections (
        operating_company_id,
        unit_uuid,
        brake_position,
        threshold_mm,
        current_thickness_mm,
        projected_replacement_date,
        wear_rate_mm_per_day,
        computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, now())
      ON CONFLICT (operating_company_id, unit_uuid, brake_position)
      DO UPDATE SET
        threshold_mm = EXCLUDED.threshold_mm,
        current_thickness_mm = EXCLUDED.current_thickness_mm,
        projected_replacement_date = EXCLUDED.projected_replacement_date,
        wear_rate_mm_per_day = EXCLUDED.wear_rate_mm_per_day,
        computed_at = now()
    `,
    [
      operatingCompanyId,
      projection.unit_uuid,
      projection.brake_position,
      projection.threshold_mm,
      projection.current_thickness_mm,
      projection.projected_replacement_date,
      projection.wear_rate_mm_per_day,
    ]
  );
}

export async function listProjectionsForUnit(
  client: DbClient,
  operatingCompanyId: string,
  unitUuid: string
): Promise<ReplacementProjection[]> {
  const res = await client.query<{
    unit_uuid: string;
    brake_position: string;
    threshold_mm: string;
    current_thickness_mm: string | null;
    projected_replacement_date: string | null;
    wear_rate_mm_per_day: string | null;
  }>(
    `
      SELECT
        unit_uuid::text,
        brake_position,
        threshold_mm::text,
        current_thickness_mm::text,
        projected_replacement_date::text,
        wear_rate_mm_per_day::text
      FROM maintenance.brake_projections
      WHERE operating_company_id = $1
        AND unit_uuid = $2
      ORDER BY brake_position
    `,
    [operatingCompanyId, unitUuid]
  );
  return res.rows.map((row) => ({
    unit_uuid: row.unit_uuid,
    brake_position: row.brake_position,
    threshold_mm: Number(row.threshold_mm),
    current_thickness_mm: row.current_thickness_mm != null ? Number(row.current_thickness_mm) : null,
    projected_replacement_date: row.projected_replacement_date,
    wear_rate_mm_per_day: row.wear_rate_mm_per_day != null ? Number(row.wear_rate_mm_per_day) : null,
    days_until_replacement: row.projected_replacement_date
      ? Math.max(
          0,
          Math.ceil((new Date(row.projected_replacement_date).getTime() - Date.now()) / MS_PER_DAY)
        )
      : null,
  }));
}

export async function getAtRiskFleet(
  client: DbClient,
  operatingCompanyId: string,
  withinDays = 30
): Promise<AtRiskBrakeRow[]> {
  const res = await client.query<{
    unit_uuid: string;
    unit_number: string | null;
    brake_position: string;
    threshold_mm: string;
    current_thickness_mm: string | null;
    projected_replacement_date: string | null;
    wear_rate_mm_per_day: string | null;
  }>(
    `
      SELECT
        bp.unit_uuid::text,
        u.unit_number,
        bp.brake_position,
        bp.threshold_mm::text,
        bp.current_thickness_mm::text,
        bp.projected_replacement_date::text,
        bp.wear_rate_mm_per_day::text
      FROM maintenance.brake_projections bp
      JOIN mdata.units u ON u.id = bp.unit_uuid
      WHERE bp.operating_company_id = $1
        AND bp.projected_replacement_date IS NOT NULL
        AND bp.projected_replacement_date <= (CURRENT_DATE + ($2::int * INTERVAL '1 day'))
      ORDER BY bp.projected_replacement_date ASC, u.unit_number, bp.brake_position
    `,
    [operatingCompanyId, withinDays]
  );
  return res.rows.map((row) => ({
    unit_uuid: row.unit_uuid,
    unit_number: row.unit_number,
    brake_position: row.brake_position,
    threshold_mm: Number(row.threshold_mm),
    current_thickness_mm: row.current_thickness_mm != null ? Number(row.current_thickness_mm) : null,
    projected_replacement_date: row.projected_replacement_date,
    wear_rate_mm_per_day: row.wear_rate_mm_per_day != null ? Number(row.wear_rate_mm_per_day) : null,
    axle_group: axleGroupForPosition(row.brake_position),
    days_until_replacement: row.projected_replacement_date
      ? Math.max(
          0,
          Math.ceil((new Date(row.projected_replacement_date).getTime() - Date.now()) / MS_PER_DAY)
        )
      : null,
  }));
}
