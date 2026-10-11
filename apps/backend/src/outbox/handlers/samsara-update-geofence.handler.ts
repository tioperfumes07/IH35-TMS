/**
 * Lead 443.49 (owner 2026-10-11 05:39 CT: "We keep them and we need the real address geo fences"): a fence this TMS already
 * pushed to the owner's Samsara account is moved to the facility's REAL address — the SAME Samsara address is updated in place
 * (PATCH /addresses/{id}); no second address, nothing deleted. The local fence row is moved in the same engine run that
 * enqueues this event; the handler only performs the Samsara write and audits it.
 */
import { resolveSamsaraApiToken } from "../../integrations/samsara/samsara-token.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { SAMSARA_GEOFENCE_RADIUS_METERS } from "../../integrations/samsara/geofences/wf-051-radius.js";
import { SamsaraApiError, SamsaraClient } from "../../integrations/samsara/samsara-client.js";
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

export class SamsaraUpdateGeofenceHandler implements OutboxEventHandler {
  eventType = "samsara.update_geofence" as const;

  canHandle() {
    return (process.env.SAMSARA_GEOFENCE_UPDATE_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = requireUuid(payload.operating_company_id, "operating_company_id");
    const geofenceId = requireUuid(payload.geofence_id, "geofence_id");
    const samsaraAddressId = String(payload.samsara_address_id ?? "").trim();
    if (!samsaraAddressId) throw new Error("samsara_address_id_missing");
    const latitude = requireCoord(payload.latitude, "latitude");
    const longitude = requireCoord(payload.longitude, "longitude");
    const label = String(payload.label ?? "").trim() || `geofence ${geofenceId}`;
    const formattedAddress = String(payload.formatted_address ?? label).trim() || label;

    const config = await getSamsaraConfigForCompany(ctx.client, operatingCompanyId);
    if (!rowIsConfigured(config) || !Boolean(config?.is_enabled)) throw new Error("samsara_not_configured");
    let token: string | null = null;
    try {
      token = resolveSamsaraApiToken(config as Record<string, unknown>);
    } catch {
      token = null;
    }
    if (!token?.trim()) throw new Error("samsara_not_configured");

    const api = new SamsaraClient({ apiToken: token, samsaraOrgId: config?.samsara_org_id ? String(config.samsara_org_id) : null });
    try {
      await api.updateAddress(samsaraAddressId, { name: label, formattedAddress, latitude, longitude, radiusMeters: SAMSARA_GEOFENCE_RADIUS_METERS });
    } catch (error) {
      // Not configured / missing id is a real failure here (the event exists only because the fence HAS a Samsara copy): retry, never "delivered".
      if (error instanceof SamsaraApiError) throw new Error(error.message);
      throw error;
    }
    const actorRaw = String(payload.actor_user_id ?? "").trim();
    const actorUserId = /^[0-9a-fA-F-]{36}$/.test(actorRaw) ? actorRaw : "00000000-0000-4000-8000-000000000001";
    await appendCrudAudit(
      ctx.client as never,
      actorUserId,
      "telematics.samsara.geofence_moved_to_real_address",
      { operating_company_id: operatingCompanyId, geofence_id: geofenceId, samsara_address_id: samsaraAddressId, latitude, longitude, formatted_address: formattedAddress },
      "info",
      "443.49"
    );
    return { message: `samsara_geofence_updated:${samsaraAddressId}` };
  }
}
