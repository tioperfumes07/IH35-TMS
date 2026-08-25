import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`legal_attorney_decision_email_missing_${key}`);
  return value.trim();
}

export class LegalAttorneyDecisionEmailHandler implements OutboxEventHandler {
  eventType = "legal.attorney.decision_email" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    await sendEmail({
      to: requiredText(payload, "to"),
      subject: requiredText(payload, "subject"),
      text: requiredText(payload, "body_text"),
      html: requiredText(payload, "body_html"),
      sender: "noreply",
      eventClass: requiredText(payload, "event_class"),
      actorUserId: null,
    });
    return { message: "legal_attorney_decision_email_sent" };
  }
}
