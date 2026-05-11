import { distributeLoadInstructions } from "../../dispatch/load-distribution.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./registry.js";

export class DispatchLoadDispatchedHandler implements OutboxEventHandler {
  eventType = "dispatch.load.dispatched" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const loadId = typeof payload.load_id === "string" ? payload.load_id : "";
    const operatingCompanyId = typeof payload.operating_company_id === "string" ? payload.operating_company_id : "";
    const actorUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : "";

    if (!loadId || !operatingCompanyId) {
      throw new Error("dispatch_load_dispatched_payload_invalid");
    }
    if (!actorUserId) throw new Error("dispatch_load_dispatched_missing_actor");

    const maxAttempts = 3;
    let attempt = 0;
    let lastError: Error | null = null;
    while (attempt < maxAttempts) {
      try {
        attempt += 1;
        await distributeLoadInstructions({
          operating_company_id: operatingCompanyId,
          load_id: loadId,
          requested_by_user_id: actorUserId,
        });
        break;
      } catch (error) {
        lastError = error as Error;
        if (attempt >= maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    if (lastError) {
      await ctx.client.query(
        `SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`,
        [
          "dispatch.load.distribution_retry_exhausted",
          "warning",
          JSON.stringify({
            load_id: loadId,
            operating_company_id: operatingCompanyId,
            attempts: maxAttempts,
            error: String(lastError.message ?? lastError),
          }),
          actorUserId,
          "P6-D3",
        ]
      );
      await ctx.client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1,$2,$3,$4::jsonb)
        `,
        [
          "dispatch.loads",
          loadId,
          "dispatch.wf064.distribution_failure",
          JSON.stringify({
            load_id: loadId,
            operating_company_id: operatingCompanyId,
            reason: String(lastError.message ?? lastError),
            attempts: maxAttempts,
          }),
        ]
      );
      throw lastError;
    }

    ctx.log("outbox dispatch.load.dispatched delivered", {
      eventId: ctx.eventId,
      loadId,
      operatingCompanyId,
    });
    return { message: "driver_instructions_distributed" };
  }
}
