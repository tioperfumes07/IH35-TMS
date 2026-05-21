import type { DbClient, ProjectionResult, SamsaraWebhookEvent } from "../webhook-projection.types.js";

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
  await client.query(
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
    `,
    [event.operating_company_id, vehicleId, JSON.stringify(event.payload)]
  );
  return { success: true };
}
