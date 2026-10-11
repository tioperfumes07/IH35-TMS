// 443.53 #2 — re-derive one load's planning miles ON THE SERVER (the Google routing key lives only there): every leg this
// module owns (relearnLoadStopLegs) and the first-stop deadhead (recomputeFirstStopDeadhead), through chooseLegMiles — point
// mileage cache, Google routing, historical lane average, else NULL. Never a straight line. Never a pay / settlement table:
// driver pay miles are the signed settlement. Idempotent: a second delivery recomputes the same values from the cache.
import { recomputeFirstStopDeadhead, relearnLoadStopLegs } from "../../dispatch/load-lane-learning.service.js";
import { geocodeStopsWithClient } from "../../telematics/stops-geocode-backfill.service.js";
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
    // 443.53 #1: first resolve the load's stops through the one resolution order (Samsara address > existing street location >
    // Google place in the stop's city / state > recorded Google no-result) — in THIS event's transaction, so a deploy restart
    // cannot roll back a whole-company sweep — then measure the legs from the real points.
    const geo = await geocodeStopsWithClient(ctx.client as never, actorUserId, operatingCompanyId, loadId, { reresolve: true });
    const legs = await relearnLoadStopLegs(ctx.client as never, { operatingCompanyId, loadId, actorUserId });
    const deadhead = await recomputeFirstStopDeadhead(ctx.client as never, { operatingCompanyId, loadId, actorUserId });
    // 443.55: record_sources = also record 'document' as the source of every miles field that has a value and no recorded
    // source (with both recommendations at this moment). Never changes a value.
    const sources = payload.record_sources === true ? await recordDocumentMilesSources(ctx.client as never, { operatingCompanyId, loadId, actorUserId }) : null;
    return {
      message: `street_from_place:${geo.street_from_place ?? 0}:samsara:${geo.samsara_matched}:zip_listed:${geo.zip_center_listed.length}:relearned:${legs.changed.length}:unresolved:${legs.unresolved.length}:deadhead:${deadhead.written ? deadhead.method ?? "written" : deadhead.reason ?? "kept"}${sources ? `:sources:${sources.recorded.join("+") || "none"}` : ""}`,
    };
  }
}
