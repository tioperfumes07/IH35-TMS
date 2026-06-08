/**
 * CAP-14 Cargo Sensors Ingester — GAP-64
 * Ingests reefer temperature/humidity readings and flags out-of-range rows.
 */
import { withLuciaBypass } from "../../../auth/db.js";
import {
  evaluateCargoThreshold,
  resolveCargoThresholds,
  type CargoSensorThresholdInput,
  type CargoThresholdRange,
} from "./threshold.service.js";

export type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type DoorStatus = "open" | "closed" | "unknown";

export type ActiveReeferLoad = {
  load_uuid: string;
  operating_company_id: string;
  trailer_uuid: string;
  load_metadata: Record<string, unknown>;
};

export type CargoSensorReadingInput = {
  operating_company_id: string;
  load_uuid?: string | null;
  trailer_uuid: string;
  sensor_id: string;
  temp_celsius?: number | null;
  humidity_pct?: number | null;
  door_status?: DoorStatus | null;
  reading_at: string;
};

export type CargoSensorReadingRow = {
  uuid: string;
  operating_company_id: string;
  load_uuid: string | null;
  trailer_uuid: string;
  sensor_id: string;
  temp_celsius: number | null;
  humidity_pct: number | null;
  door_status: DoorStatus;
  reading_at: string;
  out_of_range: boolean;
  created_at: string;
};

export type CargoTimelineRow = CargoSensorReadingRow & {
  threshold_status: "green" | "amber" | "red";
};

export type CargoTimelinePayload = {
  operating_company_id: string;
  load_uuid: string;
  threshold: CargoThresholdRange;
  rows: CargoTimelineRow[];
};

export type CargoSensorIngestionSummary = {
  companies_processed: number;
  reefer_loads_scanned: number;
  readings_ingested: number;
  out_of_range_count: number;
  skipped: number;
};

export type CargoSensorProvider = (input: {
  operating_company_id: string;
  reefer_loads: ActiveReeferLoad[];
}) => Promise<CargoSensorReadingInput[]>;

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeDoorStatus(value: string | null | undefined): DoorStatus {
  if (value === "open" || value === "closed") return value;
  return "unknown";
}

function deduceThresholdStatus(
  row: Pick<CargoSensorReadingRow, "temp_celsius" | "humidity_pct" | "out_of_range">,
  threshold: CargoThresholdRange
): "green" | "amber" | "red" {
  if (row.out_of_range) return "red";
  const evaluation = evaluateCargoThreshold(
    {
      temp_celsius: row.temp_celsius,
      humidity_pct: row.humidity_pct,
      reading_at: new Date().toISOString(),
    },
    threshold
  );
  return evaluation.status;
}

export async function listActiveReeferLoads(
  client: DbClient,
  operatingCompanyId: string
): Promise<ActiveReeferLoad[]> {
  const res = await client.query<{
    load_uuid: string;
    operating_company_id: string;
    trailer_uuid: string;
    load_metadata: unknown;
  }>(
    `
      SELECT
        l.id::text AS load_uuid,
        l.operating_company_id::text AS operating_company_id,
        COALESCE(
          NULLIF(to_jsonb(l)->>'assigned_trailer_id', ''),
          NULLIF(to_jsonb(l)->>'trailer_uuid', ''),
          NULLIF(l.assigned_unit_id::text, '')
        ) AS trailer_uuid,
        to_jsonb(l) AS load_metadata
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text NOT IN ('closed', 'paid', 'invoiced', 'cancelled', 'abandoned', 'driver_walkoff', 'driver_no_show')
        AND (
          lower(COALESCE(to_jsonb(l)->>'trailer_type', '')) LIKE '%refrigerated%'
          OR lower(COALESCE(to_jsonb(l)->>'trailer_type', '')) LIKE '%reefer%'
          OR (to_jsonb(l)->>'temp_fahrenheit') IS NOT NULL
          OR (to_jsonb(l)->>'required_temp_min') IS NOT NULL
          OR (to_jsonb(l)->>'required_temp_max') IS NOT NULL
        )
    `,
    [operatingCompanyId]
  );

  return res.rows
    .filter((row) => Boolean(row.trailer_uuid))
    .map((row) => ({
      load_uuid: row.load_uuid,
      operating_company_id: row.operating_company_id,
      trailer_uuid: row.trailer_uuid,
      load_metadata: toRecord(row.load_metadata),
    }));
}

export async function upsertCargoSensorReading(
  client: DbClient,
  input: CargoSensorReadingInput & { out_of_range: boolean }
): Promise<CargoSensorReadingRow> {
  const res = await client.query<CargoSensorReadingRow>(
    `
      INSERT INTO dispatch.cargo_sensor_readings (
        operating_company_id,
        load_uuid,
        trailer_uuid,
        sensor_id,
        temp_celsius,
        humidity_pct,
        door_status,
        reading_at,
        out_of_range
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::timestamptz, $9)
      ON CONFLICT (operating_company_id, sensor_id, reading_at)
      DO UPDATE SET
        load_uuid = EXCLUDED.load_uuid,
        trailer_uuid = EXCLUDED.trailer_uuid,
        temp_celsius = EXCLUDED.temp_celsius,
        humidity_pct = EXCLUDED.humidity_pct,
        door_status = EXCLUDED.door_status,
        out_of_range = EXCLUDED.out_of_range
      RETURNING
        uuid::text,
        operating_company_id::text,
        load_uuid::text,
        trailer_uuid::text,
        sensor_id,
        temp_celsius::float8 AS temp_celsius,
        humidity_pct::float8 AS humidity_pct,
        door_status,
        reading_at::text,
        out_of_range,
        created_at::text
    `,
    [
      input.operating_company_id,
      input.load_uuid ?? null,
      input.trailer_uuid,
      input.sensor_id,
      input.temp_celsius ?? null,
      input.humidity_pct ?? null,
      normalizeDoorStatus(input.door_status),
      input.reading_at,
      input.out_of_range,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error("cargo_sensor_upsert_failed");
  return row;
}

export async function runCargoSensorIngestionForCompany(
  client: DbClient,
  operatingCompanyId: string,
  provider: CargoSensorProvider
): Promise<{ reefer_loads_scanned: number; readings_ingested: number; out_of_range_count: number; skipped: number }> {
  const reeferLoads = await listActiveReeferLoads(client, operatingCompanyId);
  if (reeferLoads.length === 0) {
    return { reefer_loads_scanned: 0, readings_ingested: 0, out_of_range_count: 0, skipped: 0 };
  }

  const payload = await provider({
    operating_company_id: operatingCompanyId,
    reefer_loads: reeferLoads,
  });

  const byLoad = new Map(reeferLoads.map((row) => [row.load_uuid, row]));
  const byTrailer = new Map(reeferLoads.map((row) => [row.trailer_uuid, row]));

  let readingsIngested = 0;
  let outOfRangeCount = 0;
  let skipped = 0;

  for (const reading of payload) {
    if (reading.operating_company_id !== operatingCompanyId) {
      skipped += 1;
      continue;
    }

    const matchedByLoad = reading.load_uuid ? byLoad.get(reading.load_uuid) : undefined;
    const matchedByTrailer = byTrailer.get(reading.trailer_uuid);
    const matched = matchedByLoad ?? matchedByTrailer;
    if (!matched) {
      skipped += 1;
      continue;
    }

    const threshold = resolveCargoThresholds(matched.load_metadata);
    const evaluation = evaluateCargoThreshold(
      {
        temp_celsius: reading.temp_celsius ?? null,
        humidity_pct: reading.humidity_pct ?? null,
        reading_at: reading.reading_at,
      },
      threshold
    );

    await upsertCargoSensorReading(client, {
      ...reading,
      load_uuid: reading.load_uuid ?? matched.load_uuid,
      trailer_uuid: reading.trailer_uuid ?? matched.trailer_uuid,
      out_of_range: evaluation.out_of_range,
    });
    readingsIngested += 1;
    if (evaluation.out_of_range) outOfRangeCount += 1;
  }

  return {
    reefer_loads_scanned: reeferLoads.length,
    readings_ingested: readingsIngested,
    out_of_range_count: outOfRangeCount,
    skipped,
  };
}

export async function listCargoSensorTimelineForLoad(
  client: DbClient,
  operatingCompanyId: string,
  loadUuid: string,
  limit = 200
): Promise<CargoTimelinePayload> {
  const loadMetaRes = await client.query<{ load_metadata: unknown }>(
    `
      SELECT to_jsonb(l) AS load_metadata
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, loadUuid]
  );
  const threshold = resolveCargoThresholds(toRecord(loadMetaRes.rows[0]?.load_metadata));

  const cappedLimit = Math.max(1, Math.min(limit, 1000));
  const timelineRes = await client.query<CargoSensorReadingRow>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        load_uuid::text,
        trailer_uuid::text,
        sensor_id,
        temp_celsius::float8 AS temp_celsius,
        humidity_pct::float8 AS humidity_pct,
        door_status,
        reading_at::text,
        out_of_range,
        created_at::text
      FROM dispatch.cargo_sensor_readings
      WHERE operating_company_id = $1::uuid
        AND load_uuid = $2::uuid
      ORDER BY reading_at DESC
      LIMIT $3
    `,
    [operatingCompanyId, loadUuid, cappedLimit]
  );

  const rows = timelineRes.rows.map((row) => ({
    ...row,
    threshold_status: deduceThresholdStatus(row, threshold),
  }));

  return {
    operating_company_id: operatingCompanyId,
    load_uuid: loadUuid,
    threshold,
    rows,
  };
}

export async function listOutOfRangeCargoReadings(
  client: DbClient,
  operatingCompanyId: string,
  filters: { from?: string; to?: string; limit?: number }
): Promise<CargoSensorReadingRow[]> {
  const clauses = ["operating_company_id = $1::uuid", "out_of_range = true"];
  const values: unknown[] = [operatingCompanyId];

  if (filters.from) {
    values.push(filters.from);
    clauses.push(`reading_at >= $${values.length}::timestamptz`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`reading_at <= $${values.length}::timestamptz`);
  }

  const limit = Math.max(1, Math.min(filters.limit ?? 200, 1000));
  values.push(limit);

  const res = await client.query<CargoSensorReadingRow>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        load_uuid::text,
        trailer_uuid::text,
        sensor_id,
        temp_celsius::float8 AS temp_celsius,
        humidity_pct::float8 AS humidity_pct,
        door_status,
        reading_at::text,
        out_of_range,
        created_at::text
      FROM dispatch.cargo_sensor_readings
      WHERE ${clauses.join(" AND ")}
      ORDER BY reading_at DESC
      LIMIT $${values.length}
    `,
    values
  );
  return res.rows;
}

async function listActiveCompanyIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
      ORDER BY id
    `
  );
  return res.rows.map((row) => row.id);
}

async function defaultCargoSensorProvider(): Promise<CargoSensorReadingInput[]> {
  // Hardware feed adapter is injected by caller. Default no-op keeps worker safe in fleets
  // without Samsara reefer sensors enabled.
  return [];
}

export async function runCargoSensorIngestionTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
  provider?: CargoSensorProvider;
}): Promise<CargoSensorIngestionSummary> {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const provider = deps?.provider ?? defaultCargoSensorProvider;
  const summary: CargoSensorIngestionSummary = {
    companies_processed: 0,
    reefer_loads_scanned: 0,
    readings_ingested: 0,
    out_of_range_count: 0,
    skipped: 0,
  };

  await withLuciaBypassImpl(async (client) => {
    const companyIds = await listActiveCompanyIds(client);
    for (const operatingCompanyId of companyIds) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const result = await runCargoSensorIngestionForCompany(client, operatingCompanyId, provider);
      summary.companies_processed += 1;
      summary.reefer_loads_scanned += result.reefer_loads_scanned;
      summary.readings_ingested += result.readings_ingested;
      summary.out_of_range_count += result.out_of_range_count;
      summary.skipped += result.skipped;
    }
  });

  return summary;
}

export function evaluateReadingForThreshold(
  reading: CargoSensorThresholdInput,
  threshold: CargoThresholdRange
) {
  return evaluateCargoThreshold(reading, threshold);
}
