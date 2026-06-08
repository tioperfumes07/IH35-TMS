/**
 * CAP-14 Cargo Sensor Threshold Service — GAP-64
 */
import { createNotification, listCompanyNotifyUserIds } from "../../../notifications/notification.service.js";
import type { DbClient } from "./ingester.service.js";

export type CargoThresholdRange = {
  min_temp_c: number;
  max_temp_c: number;
  min_humidity_pct: number | null;
  max_humidity_pct: number | null;
  source: "required_range" | "setpoint" | "default";
};

export type CargoSensorThresholdInput = {
  temp_celsius: number | null;
  humidity_pct: number | null;
  reading_at: string;
};

export type CargoThresholdEvaluation = {
  out_of_range: boolean;
  near_edge: boolean;
  status: "green" | "amber" | "red";
  reasons: string[];
};

export type CargoSensorIncident = {
  started_at: string;
  ended_at: string | null;
  severity: "warning" | "critical";
  duration_minutes: number;
  sample_count: number;
  reasons: string[];
};

export type OutOfRangeIncident = {
  reading_uuid: string;
  load_uuid: string | null;
  trailer_uuid: string;
  temp_celsius: number | null;
  duration_minutes: number;
  severity: "warning" | "critical";
};

const DEFAULT_MIN_TEMP_C = 1.7;
const DEFAULT_MAX_TEMP_C = 4.4;
const DEFAULT_SETPOINT_BAND_C = 1.5;
const EDGE_TEMP_C = 0.5;
const EDGE_HUMIDITY_PCT = 3;
const CRITICAL_DURATION_MINUTES = 10;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value != null) return value;
  }
  return null;
}

function fahrenheitToCelsius(value: number): number {
  return ((value - 32) * 5) / 9;
}

function clamp(min: number, max: number): [number, number] {
  return min <= max ? [min, max] : [max, min];
}

function minutesBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function resolveCargoThresholds(loadMetadata: Record<string, unknown> | null | undefined): CargoThresholdRange {
  const meta = loadMetadata ?? {};
  let source: CargoThresholdRange["source"] = "default";
  let minTempC =
    readFirstNumber(meta, ["required_temp_min_c", "required_temp_min", "temp_min_celsius", "min_temp_c"]) ?? null;
  let maxTempC =
    readFirstNumber(meta, ["required_temp_max_c", "required_temp_max", "temp_max_celsius", "max_temp_c"]) ?? null;

  if (minTempC == null) {
    const minF = readFirstNumber(meta, ["required_temp_min_f", "required_temp_min_fahrenheit"]);
    if (minF != null) minTempC = fahrenheitToCelsius(minF);
  }
  if (maxTempC == null) {
    const maxF = readFirstNumber(meta, ["required_temp_max_f", "required_temp_max_fahrenheit"]);
    if (maxF != null) maxTempC = fahrenheitToCelsius(maxF);
  }

  if (minTempC != null || maxTempC != null) {
    source = "required_range";
  } else {
    const setpointF = readFirstNumber(meta, ["temp_fahrenheit", "reefer_setpoint_f", "setpoint_temp_f"]);
    const setpointC =
      readFirstNumber(meta, ["temp_celsius", "reefer_setpoint_c", "setpoint_temp_c"]) ??
      (setpointF != null ? fahrenheitToCelsius(setpointF) : null);
    if (setpointC != null) {
      minTempC = setpointC - DEFAULT_SETPOINT_BAND_C;
      maxTempC = setpointC + DEFAULT_SETPOINT_BAND_C;
      source = "setpoint";
    }
  }

  if (minTempC == null && maxTempC == null) {
    minTempC = DEFAULT_MIN_TEMP_C;
    maxTempC = DEFAULT_MAX_TEMP_C;
  } else if (minTempC == null) {
    minTempC = (maxTempC as number) - 3;
  } else if (maxTempC == null) {
    maxTempC = minTempC + 3;
  }

  const [safeMin, safeMax] = clamp(minTempC as number, maxTempC as number);
  const minHumidity = readFirstNumber(meta, ["required_humidity_min_pct", "required_humidity_min", "min_humidity_pct"]);
  const maxHumidity = readFirstNumber(meta, ["required_humidity_max_pct", "required_humidity_max", "max_humidity_pct"]);

  let minHumidityPct: number | null = null;
  let maxHumidityPct: number | null = null;
  if (minHumidity != null && maxHumidity != null) {
    [minHumidityPct, maxHumidityPct] = clamp(minHumidity, maxHumidity);
  }

  return {
    min_temp_c: safeMin,
    max_temp_c: safeMax,
    min_humidity_pct: minHumidityPct,
    max_humidity_pct: maxHumidityPct,
    source,
  };
}

export function evaluateCargoThreshold(
  reading: CargoSensorThresholdInput,
  range: CargoThresholdRange
): CargoThresholdEvaluation {
  const reasons: string[] = [];
  let outOfRange = false;
  let nearEdge = false;

  if (reading.temp_celsius != null) {
    if (reading.temp_celsius < range.min_temp_c) {
      outOfRange = true;
      reasons.push("temp_below_min");
    } else if (reading.temp_celsius > range.max_temp_c) {
      outOfRange = true;
      reasons.push("temp_above_max");
    } else {
      const nearLower = reading.temp_celsius - range.min_temp_c <= EDGE_TEMP_C;
      const nearUpper = range.max_temp_c - reading.temp_celsius <= EDGE_TEMP_C;
      if (nearLower || nearUpper) {
        nearEdge = true;
        reasons.push("temp_near_edge");
      }
    }
  }

  if (reading.humidity_pct != null && range.min_humidity_pct != null && range.max_humidity_pct != null) {
    if (reading.humidity_pct < range.min_humidity_pct) {
      outOfRange = true;
      reasons.push("humidity_below_min");
    } else if (reading.humidity_pct > range.max_humidity_pct) {
      outOfRange = true;
      reasons.push("humidity_above_max");
    } else {
      const nearLower = reading.humidity_pct - range.min_humidity_pct <= EDGE_HUMIDITY_PCT;
      const nearUpper = range.max_humidity_pct - reading.humidity_pct <= EDGE_HUMIDITY_PCT;
      if (nearLower || nearUpper) nearEdge = true;
    }
  }

  return { out_of_range: outOfRange, near_edge: nearEdge, status: outOfRange ? "red" : nearEdge ? "amber" : "green", reasons };
}

export function detectCargoIncidents(
  readings: CargoSensorThresholdInput[],
  range: CargoThresholdRange,
  nowIso = new Date().toISOString()
): CargoSensorIncident[] {
  const sorted = [...readings].sort((a, b) => Date.parse(a.reading_at) - Date.parse(b.reading_at));
  const incidents: CargoSensorIncident[] = [];

  let active:
    | {
        started_at: string;
        sample_count: number;
        reasons: Set<string>;
      }
    | null = null;

  for (const reading of sorted) {
    const evaluation = evaluateCargoThreshold(reading, range);

    if (evaluation.out_of_range) {
      if (!active) {
        active = {
          started_at: reading.reading_at,
          sample_count: 1,
          reasons: new Set(evaluation.reasons),
        };
      } else {
        active.sample_count += 1;
        for (const reason of evaluation.reasons) active.reasons.add(reason);
      }
      continue;
    }

    if (!active) continue;
    const duration = minutesBetween(active.started_at, reading.reading_at);
    incidents.push({
      started_at: active.started_at,
      ended_at: reading.reading_at,
      duration_minutes: duration,
      severity: duration >= CRITICAL_DURATION_MINUTES ? "critical" : "warning",
      sample_count: active.sample_count,
      reasons: [...active.reasons],
    });
    active = null;
  }

  if (active) {
    const duration = minutesBetween(active.started_at, nowIso);
    incidents.push({
      started_at: active.started_at,
      ended_at: null,
      duration_minutes: duration,
      severity: duration >= CRITICAL_DURATION_MINUTES ? "critical" : "warning",
      sample_count: active.sample_count,
      reasons: [...active.reasons],
    });
  }

  return incidents;
}

export async function findOutOfRangeIncidents(
  client: DbClient,
  operatingCompanyId: string,
  sinceMinutes = 60
): Promise<OutOfRangeIncident[]> {
  const res = await client.query<Record<string, unknown>>(
    `
      WITH recent AS (
        SELECT uuid::text AS reading_uuid, load_uuid::text, trailer_uuid::text, temp_celsius, reading_at
        FROM dispatch.cargo_sensor_readings
        WHERE operating_company_id = $1::uuid AND out_of_range = true
          AND reading_at >= now() - ($2::text || ' minutes')::interval
      ),
      grouped AS (
        SELECT trailer_uuid, load_uuid, MIN(reading_at) AS first_at, MAX(reading_at) AS last_at,
               MAX(reading_uuid) AS reading_uuid, MAX(temp_celsius) AS temp_celsius
        FROM recent GROUP BY trailer_uuid, load_uuid
      )
      SELECT reading_uuid, load_uuid, trailer_uuid, temp_celsius,
             GREATEST(1, EXTRACT(EPOCH FROM (last_at - first_at)) / 60)::int AS duration_minutes
      FROM grouped
    `,
    [operatingCompanyId, String(sinceMinutes)]
  );

  return res.rows.map((row) => {
    const duration = Number(row.duration_minutes ?? 0);
    return {
      reading_uuid: String(row.reading_uuid ?? ""),
      load_uuid: row.load_uuid ? String(row.load_uuid) : null,
      trailer_uuid: String(row.trailer_uuid ?? ""),
      temp_celsius: row.temp_celsius != null ? Number(row.temp_celsius) : null,
      duration_minutes: duration,
      severity: duration > 10 ? "critical" : "warning",
    };
  });
}

export async function notifyOutOfRangeIncident(
  client: DbClient,
  operatingCompanyId: string,
  incident: OutOfRangeIncident
): Promise<number> {
  const roles = incident.severity === "critical" ? ["Owner", "Administrator", "Dispatcher"] : ["Dispatcher"];
  const recipientUserIds = await listCompanyNotifyUserIds(client, operatingCompanyId, roles);
  const tempLabel = incident.temp_celsius != null ? `${incident.temp_celsius}°C` : "unknown";
  let sent = 0;
  for (const userId of recipientUserIds) {
    await createNotification(
      {
        operating_company_id: operatingCompanyId,
        user_id: userId,
        type: "load_status",
        severity: incident.severity === "critical" ? "critical" : "high",
        title: incident.severity === "critical" ? "Critical reefer cargo out of range" : "Reefer cargo temperature warning",
        body: `Trailer ${incident.trailer_uuid.slice(0, 8)}… at ${tempLabel} for ${incident.duration_minutes} min.`,
        action_link: incident.load_uuid ? `/dispatch/loads/${incident.load_uuid}` : "/dispatch",
        entity_type: "cargo_sensor_reading",
        entity_id: incident.reading_uuid,
        source_block: "gap-64-cap-14-cargo-sensors",
      },
      client
    );
    sent += 1;
  }
  return sent;
}

export async function processOutOfRangeAlerts(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ incidents: number; notifications: number }> {
  const incidents = await findOutOfRangeIncidents(client, operatingCompanyId);
  let notifications = 0;
  for (const incident of incidents) {
    notifications += await notifyOutOfRangeIncident(client, operatingCompanyId, incident);
  }
  return { incidents: incidents.length, notifications };
}
