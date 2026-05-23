import type { DbClient, ProjectionResult, SamsaraWebhookEvent } from "../webhook-projection.types.js";
import { processArrivalDetectionsForGpsPoint } from "../../../telematics/arrival-detection.service.js";
import { processDtcAutoWorkOrderEvent } from "../../../telematics/dtc-auto-work-order.service.js";
import { processAutoStatusSuggestionForVehicleEvent } from "../../../telematics/auto-status.service.js";
import { processDashcamAutoLinkFromWebhook } from "../../../telematics/dashcam-auto-link.service.js";
import { processGeofenceDetectionsForGpsPoint } from "../../../telematics/geofence-detector.service.js";
import { processMaintenancePredictorForOdometer } from "../../../telematics/maintenance-predictor.service.js";
import { processVehicleDriverPairingWebhookEvent } from "../../../telematics/vehicle-driver-lookup.service.js";
import { processHarshEventsFromVehiclePayload } from "../../../safety/harsh-events-ingestion.service.js";
import { notifyDriverWebPush } from "../../../services/push-notification.service.js";

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

function extractOdometerMiles(payload: Record<string, unknown>): number | null {
  const record = extractVehicleRecord(payload) ?? payload;
  const candidates = [asObject(record), asObject(payload)].filter((v): v is Record<string, unknown> => Boolean(v));
  for (const candidate of candidates) {
    const raw = candidate.odometer_mi ?? candidate.odometerMiles ?? candidate.odometer_miles ?? candidate.odometer;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  }
  return null;
}

function extractOccurredAt(payload: Record<string, unknown>): string {
  const record = extractVehicleRecord(payload) ?? payload;
  const raw = String(record.timestamp ?? record.time ?? record.occurred_at ?? payload.timestamp ?? new Date().toISOString());
  return new Date(raw).toISOString();
}

function extractDtcEntries(payload: Record<string, unknown>): Array<{ code: string; description: string | null }> {
  const record = extractVehicleRecord(payload) ?? payload;
  const candidates = [record.dtc_codes, record.diagnostics, record.faults, payload.dtc_codes, payload.faults];
  const out: Array<{ code: string; description: string | null }> = [];
  for (const raw of candidates) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const codeRaw = obj.code ?? obj.dtc_code ?? obj.id;
      const code = typeof codeRaw === "string" ? codeRaw.trim() : "";
      if (!code) continue;
      const descriptionRaw = obj.description ?? obj.message ?? obj.name;
      out.push({
        code,
        description: typeof descriptionRaw === "string" ? descriptionRaw : null,
      });
    }
  }
  return out;
}

function extractSpeedMph(payload: Record<string, unknown>): number | null {
  const record = extractVehicleRecord(payload) ?? payload;
  const candidates = [
    record.speed_mph,
    record.speedMph,
    asObject(record.location)?.speed_mph,
    asObject(record.location)?.speedMph,
    asObject(payload.location)?.speed_mph,
  ];
  for (const raw of candidates) {
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function extractEngineOn(payload: Record<string, unknown>): boolean | null {
  const record = extractVehicleRecord(payload) ?? payload;
  const raw = record.engine_on ?? record.engineOn ?? record.is_engine_on ?? asObject(record.engine)?.on;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "on" || raw.toLowerCase() === "true") return true;
    if (raw.toLowerCase() === "off" || raw.toLowerCase() === "false") return false;
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
  const odometerMiles = extractOdometerMiles(event.payload);
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

    await processArrivalDetectionsForGpsPoint(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      latitude: location.latitude,
      longitude: location.longitude,
      occurred_at: location.occurred_at,
    }, {
      notifyDriver: notifyDriverWebPush,
    });

    await processAutoStatusSuggestionForVehicleEvent(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      occurred_at: location.occurred_at,
      speed_mph: extractSpeedMph(event.payload),
      engine_on: extractEngineOn(event.payload),
    });
  }

  if (localUnitId && odometerMiles != null) {
    await processMaintenancePredictorForOdometer(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      odometer_mi: odometerMiles,
      occurred_at: location?.occurred_at ?? new Date().toISOString(),
    });
  }
  if (localUnitId) {
    await processDashcamAutoLinkFromWebhook(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      occurred_at: location?.occurred_at ?? new Date().toISOString(),
    payload: event.payload,
    });
    const dtcs = extractDtcEntries(event.payload);
    const occurredAt = location?.occurred_at ?? extractOccurredAt(event.payload);
    for (const dtc of dtcs) {
      await processDtcAutoWorkOrderEvent(client, {
        operating_company_id: event.operating_company_id,
        unit_id: localUnitId,
        occurred_at: occurredAt,
        dtc_code: dtc.code,
        description: dtc.description,
      });
    }

    await processHarshEventsFromVehiclePayload(client, {
      operating_company_id: event.operating_company_id,
      unit_id: localUnitId,
      event_at: location?.occurred_at ?? new Date().toISOString(),
      samsara_event_id: event.samsara_event_id,
      payload: event.payload,
    });
  }
  await processVehicleDriverPairingWebhookEvent(client, event, vehicleId);
  return { success: true };
}
