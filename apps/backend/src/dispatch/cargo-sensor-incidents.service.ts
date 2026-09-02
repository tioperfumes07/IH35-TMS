import {
  evaluateCargoThreshold,
  resolveCargoThresholds,
  type CargoSensorThresholdInput,
  type CargoThresholdRange,
} from "../integrations/samsara/cap-14-cargo-sensors/threshold.service.js";
import type { DbClient } from "../integrations/samsara/cap-14-cargo-sensors/db-client.type.js";

export const SETTLING_WINDOW_MINUTES = 5;

type Reading = {
  uuid: string;
  operating_company_id: string;
  load_uuid: string | null;
  trailer_uuid: string;
  sensor_id: string;
  temp_celsius: number | null;
  humidity_pct: number | null;
  door_status: "open" | "closed" | "unknown";
  reading_at: string;
  load_metadata: Record<string, unknown> | null;
  customer_metadata: Record<string, unknown> | null;
};

export type CargoIncidentRow = {
  id: string;
  load_id: string | null;
  sensor_id: string;
  breach_kind: "temperature" | "humidity" | "door";
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  reading_count: number;
  worst_value: number | null;
  threshold_low: number | null;
  threshold_high: number | null;
  severity: "warning" | "critical";
  resolved_at: string | null;
  claim_incident_id: string | null;
};

function breachKinds(reading: Reading, reasons: string[]): CargoIncidentRow["breach_kind"][] {
  const kinds = new Set<CargoIncidentRow["breach_kind"]>();
  if (reasons.some((reason) => reason.startsWith("temp_"))) kinds.add("temperature");
  if (reasons.some((reason) => reason.startsWith("humidity_"))) kinds.add("humidity");
  if (reading.door_status === "open") kinds.add("door");
  return [...kinds];
}

function worstValue(reading: Reading, kind: CargoIncidentRow["breach_kind"]): number | null {
  if (kind === "temperature") return reading.temp_celsius;
  if (kind === "humidity") return reading.humidity_pct;
  return kind === "door" ? 1 : null;
}


export type CargoBreachKind = "temperature" | "humidity" | "door";
export type CargoSensorReadingForIncidents = {
  uuid: string; operating_company_id: string; load_uuid: string | null; trailer_uuid: string; sensor_id: string;
  temp_celsius: number | null; humidity_pct: number | null; door_status: "open" | "closed" | "unknown"; reading_at: string; out_of_range: boolean;
};
export type ClassifiedBreach = { breach_kind: CargoBreachKind; threshold_low: number | null; threshold_high: number | null; worst_value: number | null };
function toRecord(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; return value as Record<string, unknown>; }
function mergeMetadata(loadMeta: Record<string, unknown>, customerMeta: Record<string, unknown>): Record<string, unknown> {
  const loadRange = resolveCargoThresholds(loadMeta);
  if (loadRange.source !== "default") return { ...customerMeta, ...loadMeta };
  return { ...customerMeta, ...loadMeta };
}
export function classifyReadingBreaches(
  reading: Pick<CargoSensorReadingForIncidents, "temp_celsius" | "humidity_pct" | "door_status" | "reading_at">,
  range: CargoThresholdRange
): ClassifiedBreach[] {
  const evaluation = evaluateCargoThreshold(
    { temp_celsius: reading.temp_celsius, humidity_pct: reading.humidity_pct, reading_at: reading.reading_at } satisfies CargoSensorThresholdInput,
    range
  );
  const breaches: ClassifiedBreach[] = [];
  if (evaluation.reasons.some((r) => r.startsWith("temp_")) && reading.temp_celsius != null) {
    breaches.push({ breach_kind: "temperature", threshold_low: range.min_temp_c, threshold_high: range.max_temp_c, worst_value: reading.temp_celsius });
  }
  if (evaluation.reasons.some((r) => r.startsWith("humidity_")) && reading.humidity_pct != null && range.min_humidity_pct != null && range.max_humidity_pct != null) {
    breaches.push({ breach_kind: "humidity", threshold_low: range.min_humidity_pct, threshold_high: range.max_humidity_pct, worst_value: reading.humidity_pct });
  }
  if (reading.door_status === "open") breaches.push({ breach_kind: "door", threshold_low: null, threshold_high: null, worst_value: null });
  return breaches;
}
export async function resolveThresholdsForLoad(client: DbClient, operatingCompanyId: string, loadUuid: string | null): Promise<CargoThresholdRange> {
  if (!loadUuid) return resolveCargoThresholds(null);
  const res = await client.query(`SELECT to_jsonb(l) AS load_metadata, to_jsonb(c) AS customer_metadata FROM mdata.loads l LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id WHERE l.operating_company_id = $1::uuid AND l.id = $2::uuid LIMIT 1`, [operatingCompanyId, loadUuid]);
  const row = res.rows[0];
  if (!row) return resolveCargoThresholds(null);
  return resolveCargoThresholds(mergeMetadata(toRecord(row.load_metadata), toRecord(row.customer_metadata)));
}

export async function syncCargoSensorIncidentsForCompany(client: DbClient, operatingCompanyId: string) {
  const readings = await client.query<Reading>(
    `
      SELECT r.uuid::text, r.operating_company_id::text, r.load_uuid::text,
             r.trailer_uuid::text, r.sensor_id, r.temp_celsius::float8,
             r.humidity_pct::float8, r.door_status, r.reading_at::text,
             to_jsonb(l) AS load_metadata, to_jsonb(c) AS customer_metadata
      FROM dispatch.cargo_sensor_readings r
      LEFT JOIN mdata.loads l
        ON l.id = r.load_uuid AND l.operating_company_id = r.operating_company_id
      LEFT JOIN mdata.customers c
        ON c.id = l.customer_id AND c.operating_company_id = r.operating_company_id
      WHERE r.operating_company_id = $1::uuid
        AND r.reading_at >= now() - interval '1 day'
      ORDER BY r.reading_at, r.uuid
    `,
    [operatingCompanyId]
  );

  let openedOrExtended = 0;
  let closed = 0;
  for (const reading of readings.rows) {
    const threshold = resolveCargoThresholds({
      ...(reading.customer_metadata ?? {}),
      ...(reading.load_metadata ?? {}),
    });
    // A default cold-chain range is useful for display, but cannot create a customer incident.
    if (threshold.source === "default") continue;
    const evaluation = evaluateCargoThreshold(reading, threshold);
    const activeKinds = breachKinds(reading, evaluation.reasons);

    for (const kind of ["temperature", "humidity", "door"] as const) {
      if (activeKinds.includes(kind)) {
        const value = worstValue(reading, kind);
        const low = kind === "temperature" ? threshold.min_temp_c : kind === "humidity" ? threshold.min_humidity_pct : null;
        const high = kind === "temperature" ? threshold.max_temp_c : kind === "humidity" ? threshold.max_humidity_pct : null;
        const result = await client.query(
          `
            INSERT INTO dispatch.cargo_sensor_incidents (
              operating_company_id, load_id, trailer_id, unit_id, driver_id, customer_id,
              sensor_id, breach_kind, started_at, reading_count, worst_value,
              threshold_low, threshold_high, severity, first_reading_uuid, last_reading_uuid
            )
            SELECT $1::uuid, r.load_uuid, NULL, r.trailer_uuid, l.assigned_primary_driver_id, l.customer_id,
                   r.sensor_id, $3, r.reading_at, 1, $4::numeric, $5::numeric, $6::numeric,
                   'warning', r.uuid, r.uuid
            FROM dispatch.cargo_sensor_readings r
            LEFT JOIN mdata.loads l ON l.id = r.load_uuid AND l.operating_company_id = r.operating_company_id
            WHERE r.uuid = $2::uuid AND r.operating_company_id = $1::uuid
            ON CONFLICT (operating_company_id, sensor_id, breach_kind)
              WHERE ended_at IS NULL AND voided_at IS NULL
            DO UPDATE SET
              last_reading_uuid = EXCLUDED.last_reading_uuid,
              reading_count = dispatch.cargo_sensor_incidents.reading_count + 1,
              worst_value = CASE
                WHEN $3 = 'temperature' THEN
                  CASE WHEN abs(EXCLUDED.worst_value - COALESCE(EXCLUDED.threshold_low, EXCLUDED.threshold_high)) >
                            abs(dispatch.cargo_sensor_incidents.worst_value - COALESCE(dispatch.cargo_sensor_incidents.threshold_low, dispatch.cargo_sensor_incidents.threshold_high))
                       THEN EXCLUDED.worst_value ELSE dispatch.cargo_sensor_incidents.worst_value END
                ELSE GREATEST(dispatch.cargo_sensor_incidents.worst_value, EXCLUDED.worst_value)
              END,
              duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (EXCLUDED.started_at - dispatch.cargo_sensor_incidents.started_at)) / 60)::int,
              severity = CASE WHEN EXCLUDED.started_at - dispatch.cargo_sensor_incidents.started_at >= interval '10 minutes' THEN 'critical' ELSE 'warning' END,
              updated_at = now()
            WHERE dispatch.cargo_sensor_incidents.last_reading_uuid IS DISTINCT FROM EXCLUDED.last_reading_uuid
            RETURNING id
          `,
          [operatingCompanyId, reading.uuid, kind, value, low, high]
        );
        openedOrExtended += result.rowCount ?? 0;
      } else {
        const result = await client.query(
          `
            UPDATE dispatch.cargo_sensor_incidents i
            SET ended_at = $4::timestamptz,
                duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM ($4::timestamptz - i.started_at)) / 60)::int,
                updated_at = now()
            WHERE i.operating_company_id = $1::uuid
              AND i.sensor_id = $2
              AND i.breach_kind = $3
              AND i.ended_at IS NULL
              AND i.voided_at IS NULL
              AND $4::timestamptz >= (
                SELECT prior.reading_at + ($5::text || ' minutes')::interval
                FROM dispatch.cargo_sensor_readings prior
                WHERE prior.uuid = i.last_reading_uuid
              )
          `,
          [operatingCompanyId, reading.sensor_id, kind, reading.reading_at, String(SETTLING_WINDOW_MINUTES)]
        );
        closed += result.rowCount ?? 0;
      }
    }
  }
  return { readings: readings.rows.length, opened_or_extended: openedOrExtended, closed };
}

export async function listCargoSensorIncidents(client: DbClient, operatingCompanyId: string, loadId?: string) {
  const values: unknown[] = [operatingCompanyId];
  const loadClause = loadId ? "AND load_id = $2::uuid" : "";
  if (loadId) values.push(loadId);
  const result = await client.query<CargoIncidentRow>(
    `SELECT id::text, load_id::text, sensor_id, breach_kind, started_at::text, ended_at::text,
            duration_minutes, reading_count, worst_value::float8, threshold_low::float8,
            threshold_high::float8, severity, resolved_at::text, claim_incident_id::text
       FROM dispatch.cargo_sensor_incidents
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL ${loadClause}
      ORDER BY started_at DESC LIMIT 250`,
    values
  );
  return result.rows;
}

export async function resolveCargoSensorIncident(client: DbClient, operatingCompanyId: string, incidentId: string, userId: string, note: string) {
  const result = await client.query<CargoIncidentRow>(
    `UPDATE dispatch.cargo_sensor_incidents
        SET resolved_at = now(), resolved_by_user_id = $3::uuid, resolution_note = $4, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND resolved_at IS NULL AND voided_at IS NULL
      RETURNING id::text, load_id::text, sensor_id, breach_kind, started_at::text, ended_at::text,
                duration_minutes, reading_count, worst_value::float8, threshold_low::float8,
                threshold_high::float8, severity, resolved_at::text, claim_incident_id::text`,
    [incidentId, operatingCompanyId, userId, note]
  );
  const row = result.rows[0] ?? null;
  if (row) {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "dispatch.cargo_sensor_incident.resolved",
      "info",
      JSON.stringify({ operating_company_id: operatingCompanyId, cargo_incident_id: row.id, actor_user_id: userId, resolution_note: note }),
      "go20-cargo-incidents",
    ]);
  }
  return row;
}

export async function fileCargoSensorIncidentClaim(
  client: DbClient,
  operatingCompanyId: string,
  incidentId: string,
  userId: string,
  claimReasonId: string
) {
  const result = await client.query<{ cargo_incident_id: string; claim_incident_id: string }>(
    `
      WITH cargo AS (
        SELECT * FROM dispatch.cargo_sensor_incidents
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND voided_at IS NULL AND claim_incident_id IS NULL
        FOR UPDATE
      ), reason AS (
        SELECT id, reason_code FROM catalogs.cargo_claim_reasons
        WHERE id = $3::uuid AND operating_company_id = $2::uuid AND is_active = true
      ), claim AS (
        INSERT INTO safety.incidents (
          operating_company_id, incident_type, incident_at, location, description,
          driver_id, unit_id, load_id, damage_amount_cents, claim_reason_code,
          claim_reason_id, claimant_customer_id, claim_filed_at, recovery_rail
        )
        SELECT c.operating_company_id, 'cargo_claim', c.started_at, '',
               concat('Cargo sensor ', c.breach_kind, ' excursion from ', c.started_at::text),
               c.driver_id, c.unit_id, c.load_id, 0, r.reason_code,
               r.id, c.customer_id, current_date, 'ask'
        FROM cargo c CROSS JOIN reason r
        RETURNING id
      )
      UPDATE dispatch.cargo_sensor_incidents c
         SET claim_incident_id = claim.id, updated_at = now()
        FROM claim
       WHERE c.id = $1::uuid AND c.operating_company_id = $2::uuid
      RETURNING c.id::text AS cargo_incident_id, claim.id::text AS claim_incident_id
    `,
    [incidentId, operatingCompanyId, claimReasonId]
  );
  const row = result.rows[0] ?? null;
  if (row) {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "dispatch.cargo_sensor_incident.claim_filed",
      "info",
      JSON.stringify({ operating_company_id: operatingCompanyId, cargo_incident_id: row.cargo_incident_id, claim_incident_id: row.claim_incident_id, actor_user_id: userId }),
      "go20-cargo-incidents",
    ]);
  }
  return row;
}


export async function closeSettledIncidents(client: DbClient, operatingCompanyId: string): Promise<number> {
  const before = await client.query(`SELECT COUNT(*)::text AS c FROM dispatch.cargo_sensor_incidents WHERE operating_company_id = $1::uuid AND ended_at IS NULL`, [operatingCompanyId]);
  await syncCargoSensorIncidentsForCompany(client, operatingCompanyId);
  const after = await client.query(`SELECT COUNT(*)::text AS c FROM dispatch.cargo_sensor_incidents WHERE operating_company_id = $1::uuid AND ended_at IS NULL`, [operatingCompanyId]);
  return Math.max(0, Number(before.rows[0]?.c ?? 0) - Number(after.rows[0]?.c ?? 0));
}

export async function processCargoSensorReadingForIncidents(client: DbClient, reading: CargoSensorReadingForIncidents): Promise<{ opened: number; extended: number }> {
  const thresholds = await resolveThresholdsForLoad(client, reading.operating_company_id, reading.load_uuid);
  if (classifyReadingBreaches(reading, thresholds).length === 0) return { opened: 0, extended: 0 };
  await syncCargoSensorIncidentsForCompany(client, reading.operating_company_id, { sinceMinutes: 240 });
  return { opened: 1, extended: 0 };
}
