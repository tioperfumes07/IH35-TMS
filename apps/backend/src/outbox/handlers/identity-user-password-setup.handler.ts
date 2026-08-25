import { enqueueEmailWithClient } from "../../email/queue.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`identity_user_password_setup_missing_${key}`);
  return value.trim();
}

export class IdentityUserPasswordSetupHandler implements OutboxEventHandler {
  eventType = "identity.user.password_setup_invite" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const operatingCompanyId = requiredText(payload, "operating_company_id");
    const to = requiredText(payload, "to");
    const userName = requiredText(payload, "user_name");
    const confirmUrl = requiredText(payload, "confirm_url");
    const recipientUserId = requiredText(payload, "recipient_user_id");
    const queuedByUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : null;

    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const { queueId } = await enqueueEmailWithClient(ctx.client, {
      operatingCompanyId,
      toAddresses: [to],
      subject: "Set your IH 35 Dispatch password",
      templateKey: "identity-user-password-setup",
      templateVars: { userName, confirmUrl, recipientUserId },
      queuedByUserId,
    });
    return { message: `email_queue:${queueId}` };
  }
}
