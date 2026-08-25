import { sendEmail } from "../../notifications/email.service.js";
import { createNotification } from "../../notifications/notification.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`safety_cert_expiry_notification_missing_${key}`);
  return value.trim();
}

function recipientIds(payload: OutboxPayload): string[] {
  const value = payload.recipient_user_ids;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("safety_cert_expiry_notification_invalid_recipients");
  }
  return value.map((id) => String(id).trim());
}

export class SafetyCertExpiryCriticalNotificationHandler implements OutboxEventHandler {
  eventType = "safety.cert_expiry.critical_notification" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const operatingCompanyId = requiredText(payload, "operating_company_id");
    const driverId = requiredText(payload, "aggregate_id");
    const title = requiredText(payload, "subject");
    const body = requiredText(payload, "body");
    for (const userId of recipientIds(payload)) {
      const created = await createNotification(
        {
          operating_company_id: operatingCompanyId,
          user_id: userId,
          type: "compliance_expiring",
          severity: "critical",
          title,
          body,
          action_link: `/drivers/${driverId}`,
          entity_type: "driver",
          entity_id: driverId,
          source_block: "gap-82-cert-expiry",
        },
        ctx.client
      );
      if (!created) throw new Error("safety_cert_expiry_notification_not_created");
    }
    await sendEmail({
      to: requiredText(payload, "to"),
      subject: title,
      html: requiredText(payload, "body_html"),
      sender: "noreply",
      eventClass: "safety.cert_expiry.critical",
    });
    return { message: "safety_cert_expiry_critical_notification_sent" };
  }
}
