// 443.53 #2 — re-derive one load's planning miles ON THE SERVER (the Google routing key lives only there): every leg this
// module owns (relearnLoadStopLegs) and the first-stop deadhead (recomputeFirstStopDeadhead), through chooseLegMiles — point
// mileage cache, Google routing, historical lane average, else NULL. Never a straight line. Never a pay / settlement table:
// driver pay miles are the signed settlement. Idempotent: a second delivery recomputes the same values from the cache.
import { recomputeFirstStopDeadhead, relearnLoadStopLegs } from "../../dispatch/load-lane-learning.service.js";
import { recordDocumentMilesSources } from "../../dispatch/mileage/miles-recommendations.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./outbox-handler.types.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

export const DISPATCH_RELEARN_LOAD_MILES_EVENT = "dispatch.relearn_load_miles" as const;

export class DispatchRelearnLoadMilesHandler implements OutboxEventHandler {
  eventType = DISPATCH_RELEARN_LOAD_MILES_EVENT;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = requireUuid(payload.operating_company_id, "operating_company_id");
    const loadId = requireUuid(payload.load_id, "load_id");
    const actorUserId = requireUuid(payload.actor_user_id, "actor_user_id");
    // The worker's client carries no company context; the stops / loads / lanes read here are under RLS.
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const legs = await relearnLoadStopLegs(ctx.client as never, { operatingCompanyId, loadId, actorUserId });
    const deadhead = await recomputeFirstStopDeadhead(ctx.client as never, { operatingCompanyId, loadId, actorUserId });
    // 443.55: record_sources = also record 'document' as the source of every miles field that has a value and no recorded
    // source (with both recommendations at this moment). Never changes a value.
    const sources = payload.record_sources === true ? await recordDocumentMilesSources(ctx.client as never, { operatingCompanyId, loadId, actorUserId }) : null;
    return {
      message: `relearned:${legs.changed.length}:unresolved:${legs.unresolved.length}:deadhead:${deadhead.written ? deadhead.method ?? "written" : deadhead.reason ?? "kept"}${sources ? `:sources:${sources.recorded.join("+") || "none"}` : ""}`,
    };
  }
}
