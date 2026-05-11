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

    await distributeLoadInstructions({
      operating_company_id: operatingCompanyId,
      load_id: loadId,
      requested_by_user_id: actorUserId,
    });

    ctx.log("outbox dispatch.load.dispatched delivered", {
      eventId: ctx.eventId,
      loadId,
      operatingCompanyId,
    });
    return { message: "driver_instructions_distributed" };
  }
}
