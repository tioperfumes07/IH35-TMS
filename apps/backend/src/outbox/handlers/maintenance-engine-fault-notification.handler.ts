import { deliverEngineFaultWorkOrderNotification } from "../../notifications/fault-notifications.js";
import type { FaultSeverity } from "../../integrations/samsara/engine-faults/severe-fault-catalog.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`maintenance_engine_fault_notification_missing_${key}`);
  return value.trim();
}

export class MaintenanceEngineFaultNotificationHandler implements OutboxEventHandler {
  eventType = "maintenance.engine_fault_work_order_notification" as const;
  requiresDelivery = true as const;
  canHandle() { return true; }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const severity = requiredText(payload, "severity");
    if (!(["info", "warn", "severe", "critical"] as string[]).includes(severity)) {
      throw new Error("maintenance_engine_fault_notification_invalid_severity");
    }
    const result = await deliverEngineFaultWorkOrderNotification(ctx.client, {
      operating_company_id: requiredText(payload, "operating_company_id"),
      unit_label: requiredText(payload, "unit_label"),
      fault_description: requiredText(payload, "fault_description"),
      severity: severity as FaultSeverity,
      work_order_id: requiredText(payload, "work_order_id"),
      driver_id: typeof payload.driver_id === "string" && payload.driver_id.trim() ? payload.driver_id.trim() : null,
    });
    return { message: `maintenance_engine_fault_notification_sent:${JSON.stringify(result)}` };
  }
}
