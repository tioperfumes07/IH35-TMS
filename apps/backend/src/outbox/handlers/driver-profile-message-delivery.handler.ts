import { sendEmail } from "../../notifications/email.service.js";
import { bridgeDriverSms } from "../../notifications/sms-bridge.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`driver_profile_message_delivery_missing_${key}`);
  return value.trim();
}

export class DriverProfileMessageDeliveryHandler implements OutboxEventHandler {
  eventType = "driver.profile_message.deliver" as const;
  requiresDelivery = true as const;
  canHandle() { return true; }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const companyId = requiredText(payload, "operating_company_id");
    const messageId = requiredText(payload, "aggregate_id");
    const driverId = requiredText(payload, "driver_id");
    const channel = requiredText(payload, "channel");
    const to = requiredText(payload, "to");
    const message = requiredText(payload, "message");
    let deliveryRef: string | null = null;

    if (channel === "sms") {
      const result = await bridgeDriverSms({ to, body: message });
      if (!result.success) throw new Error(result.error || "driver_profile_sms_delivery_failed");
      deliveryRef = result.sid ?? null;
    } else if (channel === "email") {
      const result = await sendEmail({
        to,
        subject: "Message from IH35 Dispatch",
        html: `<p>${message.replace(/</g, "&lt;")}</p>`,
        text: message,
        sender: "dispatch",
        eventClass: "driver.profile.message",
        recipientUserUuid: typeof payload.recipient_user_id === "string" ? payload.recipient_user_id : null,
        actorUserId: typeof payload.actor_user_id === "string" ? payload.actor_user_id : null,
      });
      deliveryRef = result.id;
    } else {
      throw new Error("driver_profile_message_delivery_invalid_channel");
    }

    // Outbox workers have no authenticated user session. mdata.driver_profile_messages is FORCE-RLS,
    // so company scope alone cannot authorize this delivery receipt write. Establish the canonical
    // worker bypass first, while retaining exact company/message/driver predicates on the UPDATE.
    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const updated = await ctx.client.query<{ id: string }>(
      `UPDATE mdata.driver_profile_messages
          SET delivery_status = 'sent', delivery_ref = $3
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND driver_id = $4::uuid
        RETURNING id::text`,
      [messageId, companyId, deliveryRef, driverId]
    );
    if (updated.rows.length !== 1) throw new Error("driver_profile_message_delivery_row_not_found");
    return { message: "driver_profile_message_delivered" };
  }
}
