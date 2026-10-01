/**
 * ROUND 313 — Samsara GeofenceEntry / GeofenceExit webhooks (webhook "IH35-TMS", 1839499484286657) fed into the
 * CANONICAL fence detector. The detector (telematics/geofence-detector.service.ts) stays the only writer of
 * geo.geofence_events: the webhook only says WHEN and WHICH TRUCK, so it is answered with that truck's own real GPS
 * fix nearest the event time (telematics.vehicle_locations, within 5 minutes), run through
 * processGeofenceDetectionsForGpsPoint. No fix polled yet -> transient, the projection worker retries (backoff);
 * unknown vehicle -> permanent. Nothing is synthesised from the Samsara address centre.
 */
import { processGeofenceDetectionsForGpsPoint } from "../../../telematics/geofence-detector.service.js";
import type { DbClient, ProjectionResult, SamsaraWebhookEvent } from "../webhook-projection.types.js";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function geofenceEventParts(payload: Record<string, unknown>): { vehicleId: string | null; at: string | null } {
  const data = obj(payload.data) ?? payload;
  const vehicle = obj(data.vehicle) ?? obj(obj(data.conditions)?.vehicle);
  const at = typeof payload.eventTime === "string" ? payload.eventTime : typeof data.eventTime === "string" ? data.eventTime : typeof payload.happenedAtTime === "string" ? payload.happenedAtTime : null;
  return { vehicleId: vehicle?.id != null ? String(vehicle.id) : null, at };
}

export async function projectGeofenceEvent(client: DbClient, event: SamsaraWebhookEvent): Promise<ProjectionResult> {
  const { vehicleId, at } = geofenceEventParts(event.payload as Record<string, unknown>);
  if (!vehicleId || !at || Number.isNaN(Date.parse(at))) {
    return { success: false, classification: "permanent", error_class: "malformed_payload", error_message: "geofence event without vehicle id or event time" };
  }
  const unit = await client.query<{ id: string }>(
    `SELECT u.id::text FROM mdata.units u
      WHERE u.samsara_vehicle_id = $1 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
        AND u.deactivated_at IS NULL LIMIT 2`,
    [vehicleId, event.operating_company_id]
  );
  if (unit.rows.length !== 1) {
    return { success: false, classification: "permanent", error_class: "malformed_payload", error_message: `samsara vehicle ${vehicleId} maps to ${unit.rows.length} units` };
  }
  const fix = await client.query<{ lat: string; lng: string; captured_at: string }>(
    `SELECT v.lat::text, v.lng::text, v.captured_at::text FROM telematics.vehicle_locations v
      WHERE v.unit_id = $1::uuid AND v.lat IS NOT NULL AND v.lng IS NOT NULL
        AND v.captured_at BETWEEN $2::timestamptz - interval '5 minutes' AND $2::timestamptz + interval '5 minutes'
      ORDER BY abs(extract(epoch FROM v.captured_at - $2::timestamptz)) LIMIT 1`,
    [unit.rows[0]!.id, at]
  );
  if (!fix.rows[0]) {
    return { success: false, classification: "transient", error_class: "transient_db_error", error_message: "no GPS fix within 5 min of the geofence event yet -- retry after the next position poll" };
  }
  await processGeofenceDetectionsForGpsPoint(client as never, {
    operating_company_id: event.operating_company_id,
    unit_id: unit.rows[0]!.id,
    latitude: Number(fix.rows[0].lat),
    longitude: Number(fix.rows[0].lng),
    occurred_at: fix.rows[0].captured_at,
    source: "samsara_gps",
  });
  return { success: true };
}
