import { sendEmailCode } from "../../auth/email-send.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`auth_email_verification_missing_${key}`);
  return value.trim();
}

export class AuthEmailVerificationHandler implements OutboxEventHandler {
  eventType = "auth.email.verification_started" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const email = requiredText(payload, "email");
    const code = requiredText(payload, "code");
    if (!/^\d{6}$/.test(code)) throw new Error("auth_email_verification_invalid_code");
    const actorUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : null;
    await sendEmailCode(email, code, actorUserId);
    return { message: "auth_email_verification_sent" };
  }
}
