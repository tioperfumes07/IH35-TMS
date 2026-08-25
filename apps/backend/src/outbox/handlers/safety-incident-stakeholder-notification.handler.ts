import { createNotification } from "../../notifications/notification.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`safety_incident_notification_missing_${key}`);
  return value.trim();
}

export class SafetyIncidentStakeholderNotificationHandler implements OutboxEventHandler {
  eventType = "safety.incident.stakeholder_notification" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const incidentId = requiredText(payload, "aggregate_id");
    const created = await createNotification(
      {
        operating_company_id: requiredText(payload, "operating_company_id"),
        user_id: requiredText(payload, "recipient_user_id"),
        type: "driver_alert",
        severity: requiredText(payload, "severity") === "critical" ? "critical" : "high",
        title: requiredText(payload, "title"),
        body: requiredText(payload, "body"),
        action_link: `/safety/incidents/${incidentId}`,
        entity_type: "safety_incident",
        entity_id: incidentId,
        source_block: "safety-incident-auto-workflow",
      },
      ctx.client
    );
    if (!created) throw new Error("safety_incident_notification_not_created");
    return { message: "safety_incident_stakeholder_notified" };
  }
}
