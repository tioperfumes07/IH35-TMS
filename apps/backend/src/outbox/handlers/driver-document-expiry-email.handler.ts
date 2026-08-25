import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`driver_document_expiry_email_missing_${key}`);
  return value.trim();
}

export class DriverDocumentExpiryEmailHandler implements OutboxEventHandler {
  eventType = "driver.document_expiry_email" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    await sendEmail({
      to: requiredText(payload, "to"),
      subject: requiredText(payload, "subject"),
      html: requiredText(payload, "body_html"),
      sender: "noreply",
      eventClass: requiredText(payload, "event_class"),
    });
    return { message: "driver_document_expiry_email_sent" };
  }
}
