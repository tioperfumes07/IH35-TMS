import type { DbClient, ProjectionResult, SamsaraWebhookEvent } from "../webhook-projection.types.js";
import { processGeofenceDetectionsForGpsPoint } from "../../../telematics/geofence-detector.service.js";
import { processVehicleDriverPairingWebhookEvent } from "../../../telematics/vehicle-driver-lookup.service.js";

function extractVehicleRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  if (payload.data && typeof payload.data === "object" && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }
  if (payload.vehicle && typeof payload.vehicle === "object" && payload.vehicle !== null) {
    return payload.vehicle as Record<string, unknown>;
  }
  return payload;
}

function extractVehicleId(payload: Record<string, unknown>): string | null {
  const record = extractVehicleRecord(payload);
  if (!record) return null;
  if (typeof record.id === "string" && record.id.trim().length > 0) return record.id.trim();
  if (typeof payload.id === "string" && payload.id.trim().length > 0) return payload.id.trim();
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function extractLocation(payload: Record<string, unknown>): { latitude: number; longitude: number; occurred_at: string } | null {
  const record = extractVehicleRecord(payload) ?? payload;
  const candidates = [
    asObject(record.location),
    asObject(record.gps),
    asObject(record.position),
    asObject(payload.location),
    asObject(payload.gps),
    asObject(payload.position),
  ].filter((v): v is Record<string, unknown> => Boolean(v));

  for (const candidate of candidates) {
    const latRaw = candidate.latitude ?? candidate.lat;
    const lngRaw = candidate.longitude ?? candidate.lng ?? candidate.lon;
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const timeRaw =
      candidate.time ??
      candidate.timestamp ??
      candidate.recorded_at ??
      candidate.recordedAt ??
      candidate.occurred_at ??
      payload.timestamp ??
      payload.time;
    const occurredAt =
      typeof timeRaw === "string" && timeRaw.trim().length > 0
        ? new Date(timeRaw).toISOString()
        : new Date().toISOString();

    return { latitude, longitude, occurred_at: occurredAt };
  }

  return null;
}

export async function projectVehicleEvent(client: DbClient, event: SamsaraWebhookEvent): Promise<ProjectionResult> {
  const vehicleId = extractVehicleId(event.payload);
  if (!vehicleId) {
    return {
      success: false,
      classification: "permanent",
      error_class: "malformed_payload",
      error_message: "vehicle event payload missing id",
    };
  }
  const upsertRes = await client.query<{ local_unit_id: string | null }>(
    `
      INSERT INTO integrations.samsara_vehicles (
        operating_company_id,
        samsara_vehicle_id,
        raw_payload,
        last_seen_at
      )
      VALUES ($1::uuid, $2, $3::jsonb, now())
      ON CONFLICT (operating_company_id, samsara_vehicle_id)
      DO UPDATE SET
        raw_payload = EXCLUDED.raw_payload,
        last_seen_at = now()
      RETURNING local_unit_id::text
    `,
    [event.operating_company_id, vehicleId, JSON.stringify(event.payload)]
  );

  const location = extractLocation(event.payload);
  const localUnitId = upsertRes.rows[0]?.local_unit_id ?? null;
  if (location && localUnitId) {
    await processGeofenceDetectionsForGpsPoint(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      latitude: location.latitude,
      longitude: location.longitude,
      occurred_at: location.occurred_at,
      source: "samsara_gps",
    });
  }
  await processVehicleDriverPairingWebhookEvent(client, event, vehicleId);
  return { success: true };
}
