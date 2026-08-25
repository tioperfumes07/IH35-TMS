import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`shipper_portal_password_reset_email_missing_${key}`);
  return value.trim();
}

export class ShipperPortalPasswordResetEmailHandler implements OutboxEventHandler {
  eventType = "shipper_portal.password_reset_email" as const;
  requiresDelivery = true as const;
  canHandle() { return true; }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    await sendEmail({
      to: requiredText(payload, "to"),
      subject: requiredText(payload, "subject"),
      html: requiredText(payload, "body_html"),
      text: requiredText(payload, "body_text"),
      sender: "noreply",
      eventClass: requiredText(payload, "event_class"),
    });
    return { message: "shipper_portal_password_reset_email_sent" };
  }
}
