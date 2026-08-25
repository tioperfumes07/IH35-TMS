import { appendCrudAudit } from "../../audit/crud-audit.js";
import { SAMSARA_GEOFENCE_RADIUS_METERS } from "../../integrations/samsara/geofences/wf-051-radius.js";
import { SamsaraApiError, SamsaraClient } from "../../integrations/samsara/samsara-client.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { getSamsaraConfigForCompany, rowIsConfigured } from "../../integrations/samsara/samsara.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./outbox-handler.types.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

function requireCoord(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field}_invalid`);
  return n;
}

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

export class SamsaraCreateGeofenceHandler implements OutboxEventHandler {
  eventType = "samsara.create_geofence" as const;

  canHandle() {
    return (process.env.SAMSARA_GEOFENCE_CREATE_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = requireUuid(payload.operating_company_id, "operating_company_id");
    const geofenceId = requireUuid(payload.geofence_id, "geofence_id");
    const latitude = requireCoord(payload.latitude, "latitude");
    const longitude = requireCoord(payload.longitude, "longitude");
    const label = String(payload.label ?? payload.formatted_address ?? "").trim() || `geofence ${geofenceId}`;
    const formattedAddress = String(payload.formatted_address ?? label).trim() || label;

    const config = await getSamsaraConfigForCompany(ctx.client, operatingCompanyId);
    if (!rowIsConfigured(config) || !Boolean(config?.is_enabled)) {
      return { message: "samsara_not_configured" };
    }

    let token: string | null = null;
    try {
      token = decryptSamsaraSecret(readEncryptedToken(config as Record<string, unknown>));
    } catch {
      token = null;
    }
    if (!token?.trim()) {
      return { message: "samsara_not_configured" };
    }

    const api = new SamsaraClient({
      apiToken: token,
      samsaraOrgId: config?.samsara_org_id ? String(config.samsara_org_id) : null,
    });

    try {
      const created = await api.createAddress({
        name: label,
        formattedAddress,
        latitude,
        longitude,
        radiusMeters: SAMSARA_GEOFENCE_RADIUS_METERS,
        geofenceId,
      });
      const actorRaw = String(payload.actor_user_id ?? "").trim();
      const actorUserId = /^[0-9a-fA-F-]{36}$/.test(actorRaw)
        ? actorRaw
        : "00000000-0000-4000-8000-000000000001";
      await appendCrudAudit(
        ctx.client as never,
        actorUserId,
        "telematics.samsara.geofence_created",
        {
          operating_company_id: operatingCompanyId,
          geofence_id: geofenceId,
          samsara_address_id: created.id,
          load_id: payload.load_id ?? null,
          stop_id: payload.stop_id ?? null,
        },
        "info",
        "CAP-2"
      );
      return { message: `samsara_geofence_created:${created.id}` };
    } catch (error) {
      if (error instanceof SamsaraApiError && error.message === "samsara_not_configured") {
        return { message: "samsara_not_configured" };
      }
      throw error;
    }
  }
}
