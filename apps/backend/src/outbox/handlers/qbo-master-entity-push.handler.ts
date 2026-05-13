import { deliverQboMasterEntityPush, type QboMasterPushPayload } from "../../qbo/push.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./registry.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

export class QboMasterEntityPushHandler implements OutboxEventHandler {
  eventType = "qbo.master_entity.push_requested" as const;

  canHandle() {
    return (process.env.QBO_MASTER_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const mirror_row_id = requireUuid(payload.mirror_row_id, "mirror_row_id");
    const entityRaw = String(payload.entity ?? "").trim();
    const operationRaw = String(payload.operation ?? "").trim();

    if (!["vendor", "customer", "item", "account"].includes(entityRaw)) throw new Error("entity_invalid");
    if (!["create", "update"].includes(operationRaw)) throw new Error("operation_invalid");

    const typed: QboMasterPushPayload = {
      operating_company_id,
      mirror_row_id,
      entity: entityRaw as QboMasterPushPayload["entity"],
      operation: operationRaw as QboMasterPushPayload["operation"],
    };

    return deliverQboMasterEntityPush(typed, ctx);
  }
}
