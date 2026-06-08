/**
 * CAP-12 Tire Tread Measurement Service — GAP-62
 * Centralizes tread depth readings from DVIR, PM, tire service, and Samsara sensors.
 */
import type { PoolClient } from "pg";
import { positionGroupForCode } from "../../../maintenance/tires.routes.js";

export type TreadMeasurementSource =
  | "dvir_inspection"
  | "maintenance_pm"
  | "tire_service"
  | "samsara_smart_sensor";

export type TreadMeasurement = {
  uuid: string;
  operating_company_id: string;
  unit_uuid: string;
  tire_position: string;
  tread_depth_32nds: number;
  measured_at: string;
  measured_by_user_uuid: string | null;
  source: TreadMeasurementSource;
  odometer_miles: number | null;
  created_at: string;
};

export type RecordMeasurementInput = {
  operating_company_id: string;
  unit_uuid: string;
  position: string;
  depth_32nds: number;
  source: TreadMeasurementSource;
  measured_at?: string;
  measured_by_user_uuid?: string | null;
  odometer_miles?: number | null;
};

export function dotThresholdForPosition(position: string): number {
  const group = positionGroupForCode(position);
  if (group === "steer") return 4;
  if (group === "drive" || group === "trailer") return 2;
  if (/^STEER-/i.test(position)) return 4;
  return 2;
}

export async function recordMeasurement(
  client: PoolClient,
  input: RecordMeasurementInput
): Promise<TreadMeasurement> {
  const res = await client.query<TreadMeasurement>(
    `
      INSERT INTO maintenance.tire_tread_measurements (
        operating_company_id,
        unit_uuid,
        tire_position,
        tread_depth_32nds,
        measured_at,
        measured_by_user_uuid,
        source,
        odometer_miles
      ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7, $8)
      RETURNING
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
    `,
    [
      input.operating_company_id,
      input.unit_uuid,
      input.position,
      input.depth_32nds,
      input.measured_at ?? null,
      input.measured_by_user_uuid ?? null,
      input.source,
      input.odometer_miles ?? null,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error("tread_measurement_insert_failed");
  return row;
}

export async function getLatestForUnit(
  client: PoolClient,
  operatingCompanyId: string,
  unitUuid: string
): Promise<TreadMeasurement[]> {
  const res = await client.query<TreadMeasurement>(
    `
      SELECT DISTINCT ON (tire_position)
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
      ORDER BY tire_position, measured_at DESC
    `,
    [operatingCompanyId, unitUuid]
  );
  return res.rows;
}

export async function listMeasurements(
  client: PoolClient,
  operatingCompanyId: string,
  filters: { unit_uuid?: string; position?: string; limit?: number }
): Promise<TreadMeasurement[]> {
  const clauses = ["operating_company_id = $1"];
  const values: unknown[] = [operatingCompanyId];
  if (filters.unit_uuid) {
    values.push(filters.unit_uuid);
    clauses.push(`unit_uuid = $${values.length}`);
  }
  if (filters.position) {
    values.push(filters.position);
    clauses.push(`tire_position = $${values.length}`);
  }
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  values.push(limit);
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
      WHERE ${clauses.join(" AND ")}
      ORDER BY measured_at DESC
      LIMIT $${values.length}
    `,
    values
  );
  return res.rows;
}
