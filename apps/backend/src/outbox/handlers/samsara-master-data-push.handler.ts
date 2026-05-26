import {
  syncSamsaraDriversMaster,
  syncSamsaraVehiclesMaster,
} from "../../integrations/samsara/samsara-master-sync.service.js";
import { getSamsaraConfigForCompany, rowIsConfigured } from "../../integrations/samsara/samsara.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./registry.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

export class SamsaraMasterDataPushHandler implements OutboxEventHandler {
  eventType = "samsara.master_data.push_requested" as const;

  canHandle() {
    return (process.env.SAMSARA_MASTER_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = requireUuid(payload.operating_company_id, "operating_company_id");
    const entity = String(payload.entity ?? "").trim();
    if (entity !== "vehicle" && entity !== "driver") throw new Error("entity_invalid");

    const config = await getSamsaraConfigForCompany(ctx.client, operatingCompanyId);
    if (!rowIsConfigured(config) || !Boolean(config?.is_enabled)) {
      return { message: "samsara_not_configured" };
    }

    const stats =
      entity === "vehicle"
        ? await syncSamsaraVehiclesMaster(ctx.client, operatingCompanyId)
        : await syncSamsaraDriversMaster(ctx.client, operatingCompanyId);
    if (stats.errors.length > 0) {
      throw new Error(`samsara_master_sync_failed:${stats.errors[0]}`);
    }
    return { message: `samsara_master_sync_ok:${entity}` };
  }
}
