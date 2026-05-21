import type { DbClient, ProjectionResult, SamsaraWebhookEvent } from "../webhook-projection.types.js";

function extractDriverRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  if (payload.data && typeof payload.data === "object" && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }
  if (payload.driver && typeof payload.driver === "object" && payload.driver !== null) {
    return payload.driver as Record<string, unknown>;
  }
  return payload;
}

function extractDriverId(payload: Record<string, unknown>): string | null {
  const record = extractDriverRecord(payload);
  if (!record) return null;
  if (typeof record.id === "string" && record.id.trim().length > 0) return record.id.trim();
  if (typeof payload.id === "string" && payload.id.trim().length > 0) return payload.id.trim();
  return null;
}

export async function projectDriverEvent(client: DbClient, event: SamsaraWebhookEvent): Promise<ProjectionResult> {
  const driverId = extractDriverId(event.payload);
  if (!driverId) {
    return {
      success: false,
      classification: "permanent",
      error_class: "malformed_payload",
      error_message: "driver event payload missing id",
    };
  }
  await client.query(
    `
      INSERT INTO integrations.samsara_drivers (
        operating_company_id,
        samsara_driver_id,
        raw_payload,
        last_seen_at
      )
      VALUES ($1::uuid, $2, $3::jsonb, now())
      ON CONFLICT (operating_company_id, samsara_driver_id)
      DO UPDATE SET
        raw_payload = EXCLUDED.raw_payload,
        last_seen_at = now()
    `,
    [event.operating_company_id, driverId, JSON.stringify(event.payload)]
  );
  return { success: true };
}
