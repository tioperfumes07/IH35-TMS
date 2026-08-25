import { sendEmail } from "../../notifications/email.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`identity_password_reset_missing_${key}`);
  return value.trim();
}

export class IdentityPasswordResetEmailHandler implements OutboxEventHandler {
  eventType = "identity.password_reset.email_requested" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, _ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const to = requiredText(payload, "to");
    const confirmUrl = requiredText(payload, "confirm_url");
    const recipientUserId = requiredText(payload, "recipient_user_id");
    await sendEmail({
      to,
      subject: "Reset your IH 35 Dispatch password",
      html: `<p>You requested a password reset for your IH 35 Dispatch account.</p><p><a href="${confirmUrl}">Choose a new password</a> (link expires in one hour).</p><p>If you did not request this, you can ignore this email.</p>`,
      text: `Reset your password (expires in one hour): ${confirmUrl}`,
      sender: "noreply",
      eventClass: "identity.password_reset.email",
      recipientUserUuid: recipientUserId,
      actorUserId: null,
      tags: [
        { name: "type", value: "office_password_reset" },
        { name: "user_id", value: recipientUserId },
      ],
    });
    return { message: "identity_password_reset_email_sent" };
  }
}
