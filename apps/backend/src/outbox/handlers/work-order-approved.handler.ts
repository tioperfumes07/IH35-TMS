import { enqueueEmailWithClient } from "../../email/queue.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function text(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

export class WorkOrderApprovedHandler implements OutboxEventHandler {
  eventType = "work_order.approved" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const recipients = (process.env.WO_APPROVED_NOTIFY_EMAIL ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    if (recipients.length === 0) return { message: "work_order_approved_trail_only_no_email_recipients" };

    const operatingCompanyId = text(payload, "operating_company_id");
    const workOrderId = text(payload, "work_order_id");
    if (!operatingCompanyId) throw new Error("work_order_approved_missing_operating_company_id");
    if (!workOrderId) throw new Error("work_order_approved_missing_work_order_id");
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const workOrderLabel = text(payload, "work_order_label") || workOrderId;
    const { queueId } = await enqueueEmailWithClient(ctx.client, {
      operatingCompanyId,
      toAddresses: recipients,
      subject: `Work order approved — ${workOrderLabel}`,
      templateKey: "wo-approved",
      templateVars: {
        workOrderLabel,
        shopName: text(payload, "shop_name"),
        unitLabel: text(payload, "unit_label"),
        approvedAt: text(payload, "approved_at"),
      },
      queuedByUserId: text(payload, "approved_by") || null,
    });
    return { message: `email_queue:${queueId}` };
  }
}
