import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`legal_contract_verification_email_missing_${key}`);
  return value.trim();
}

export class LegalContractVerificationEmailHandler implements OutboxEventHandler {
  eventType = "legal.contract.verification_email" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const code = requiredText(payload, "code");
    if (!/^\d{6}$/.test(code)) throw new Error("legal_contract_verification_email_invalid_code");
    await sendEmail({
      to: requiredText(payload, "to"),
      subject: "IH 35 contract verification code",
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
      text: `Verification code: ${code} (expires in 10 minutes)`,
      sender: "noreply",
      eventClass: "legal.contract.verify_code_sent",
    });
    return { message: "legal_contract_verification_email_sent" };
  }
}
