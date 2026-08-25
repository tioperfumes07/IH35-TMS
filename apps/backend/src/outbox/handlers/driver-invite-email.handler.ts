import { enqueueEmailWithClient } from "../../email/queue.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`driver_invite_email_missing_${key}`);
  return value.trim();
}

export class DriverInviteEmailHandler implements OutboxEventHandler {
  eventType = "email.driver_invite.send" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const operatingCompanyId = requiredText(payload, "operating_company_id");
    const to = requiredText(payload, "to");
    const driverName = requiredText(payload, "driver_name");
    const loginUrl = requiredText(payload, "login_url");
    const queuedByUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : null;
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const { queueId } = await enqueueEmailWithClient(ctx.client, {
      operatingCompanyId,
      toAddresses: [to],
      subject: "Welcome to IH 35 Dispatch — your driver app login",
      templateKey: "driver-invite",
      templateVars: { driverName, loginUrl, ownerName: "Jorge", supportEmail: process.env.EMAIL_FROM_DISPATCH || "dispatch@ih35dispatch.com" },
      queuedByUserId,
    });
    return { message: `email_queue:${queueId}` };
  }
}
