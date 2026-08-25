import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`compliance_reminder_email_missing_${key}`);
  return value.trim();
}

export class ComplianceReminderEmailHandler implements OutboxEventHandler {
  eventType = "compliance.reminder_email" as const;
  requiresDelivery = true as const;
  canHandle() { return true; }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    await sendEmail({
      to: requiredText(payload, "recipient"),
      subject: requiredText(payload, "subject"),
      html: requiredText(payload, "body_html"),
      sender: "noreply",
      eventClass: "compliance.reminder",
    });
    await ctx.client.query(
      `
        INSERT INTO compliance.notification_log (
          operating_company_id, rule_id, credential_type, entity_type, entity_id,
          expiration_date, days_until_expiration, channel, recipient, status
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::date, $7, 'email', $8, 'sent')
      `,
      [
        requiredText(payload, "operating_company_id"),
        requiredText(payload, "rule_id"),
        requiredText(payload, "credential_type"),
        requiredText(payload, "entity_type"),
        requiredText(payload, "entity_id"),
        typeof payload.expiration_date === "string" ? payload.expiration_date : null,
        typeof payload.days_until_expiration === "number" ? payload.days_until_expiration : null,
        requiredText(payload, "recipient"),
      ]
    );
    return { message: "compliance_reminder_email_sent" };
  }
}
