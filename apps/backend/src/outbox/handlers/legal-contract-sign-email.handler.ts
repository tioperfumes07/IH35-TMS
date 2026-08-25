import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`legal_contract_sign_email_missing_${key}`);
  return value.trim();
}

export class LegalContractSignEmailHandler implements OutboxEventHandler {
  eventType = "legal.contract.sign_email" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const signerName = requiredText(payload, "signer_name");
    const signerUrl = requiredText(payload, "signer_url");
    const actorUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : null;
    await sendEmail({
      to: requiredText(payload, "to"),
      subject: "IH 35 contract signature requested",
      html: `<p>Hello ${signerName},</p><p>Please review and sign your document here:</p><p><a href="${signerUrl}">${signerUrl}</a></p>`,
      text: `Hello ${signerName}, sign your document: ${signerUrl}`,
      sender: "noreply",
      eventClass: "legal.contract.sign_link_sent",
      actorUserId,
    });
    return { message: "legal_contract_sign_email_sent" };
  }
}
