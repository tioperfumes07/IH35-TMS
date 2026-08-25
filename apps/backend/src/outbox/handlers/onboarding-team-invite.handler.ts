import { enqueueEmailWithClient } from "../../email/queue.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`onboarding_team_invite_missing_${key}`);
  return value.trim();
}

export class OnboardingTeamInviteHandler implements OutboxEventHandler {
  eventType = "onboarding.team_invite.send" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const operatingCompanyId = requiredText(payload, "operating_company_id");
    const to = requiredText(payload, "to");
    const role = requiredText(payload, "role");
    const queuedByUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : null;
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const { queueId } = await enqueueEmailWithClient(ctx.client, {
      operatingCompanyId,
      toAddresses: [to],
      subject: "You're invited to IH35 TMS",
      templateKey: "onboarding-team-invite",
      templateVars: { role },
      queuedByUserId,
    });
    return { message: `email_queue:${queueId}` };
  }
}
