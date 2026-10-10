/**
 * ROUND 443.3 / 443.7 — how the Settlement Creator delivers a load: every stop stamped from the signed settlement's
 * dates, then dispatch's ONE transition engine (dispatched -> in_transit -> delivered_pending_docs). Shared by the
 * seeder (each load is delivered right after it is booked, so the same truck can take the next load of the tour —
 * bookLoad refuses a unit still active on an undelivered load) and the post.
 */
import type { DbClient } from "../dispatch/presettlement-link.service.js";
import { transitionDispatchLoadInClientTx } from "../dispatch/load-transition.service.js";
import { fromMdataStatus } from "../dispatch/load-state-machine.js";
import { SettlementCreatorError } from "./settlement-creator.service.js";

export async function stampDeliveryStopActuals(
  client: DbClient,
  loadId: string,
  deliveryDate: string | null | undefined,
  pickupDate?: string | null,
): Promise<void> {
  const at = deliveryDate ? `${deliveryDate}T18:00:00.000Z` : new Date().toISOString();
  await client.query(
    `
      UPDATE mdata.load_stops
         SET actual_arrival_at = COALESCE(actual_arrival_at, $2::timestamptz),
             actual_departure_at = COALESCE(actual_departure_at, $2::timestamptz),
             updated_at = now()
       WHERE load_id = $1::uuid
         AND stop_type = 'delivery'
         AND soft_deleted_at IS NULL
    `,
    [loadId, at],
  );
  // ROUND 443.3 (prod-fork e2e): a delivered load needs EVERY stop stamped (feed gate load.stops_stamped); the pickup
  // happened on the signed settlement's pickup date. Never overwrites a stamp already there.
  const pickedAt = pickupDate ? `${pickupDate}T14:00:00.000Z` : at;
  await client.query(
    `
      UPDATE mdata.load_stops
         SET actual_arrival_at = COALESCE(actual_arrival_at, $2::timestamptz),
             actual_departure_at = COALESCE(actual_departure_at, $2::timestamptz),
             updated_at = now()
       WHERE load_id = $1::uuid
         AND stop_type = 'pickup'
         AND soft_deleted_at IS NULL
    `,
    [loadId, pickedAt],
  );
}

/** The forward path from a dispatched load to delivered in dispatch's state machine (load-state-machine.ts forwardTransitions). */
const CREATOR_DELIVERY_PATH = ["dispatched", "in_transit", "delivered_pending_docs"] as const;
const ALREADY_DELIVERED = new Set(["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced", "paid", "closed"]);

export async function deliverLoadThroughDispatch(
  client: DbClient,
  actorUserId: string,
  operatingCompanyId: string,
  loadId: string,
  deliveryDate: string | null | undefined,
  transition: typeof transitionDispatchLoadInClientTx = transitionDispatchLoadInClientTx,
): Promise<void> {
  const deliveredAt = deliveryDate ? `${deliveryDate}T18:00:00.000Z` : null;
  for (let guard = 0; guard < CREATOR_DELIVERY_PATH.length; guard++) {
    const cur = String(
      (await client.query<{ status: string }>(
        `SELECT status::text AS status FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [loadId, operatingCompanyId],
      )).rows[0]?.status ?? "",
    );
    if (ALREADY_DELIVERED.has(cur)) return;
    const bucket = fromMdataStatus(cur);
    if (bucket === "delivered_pending_docs" || bucket === "completed_docs_received") return;
    const at = CREATOR_DELIVERY_PATH.indexOf(bucket as (typeof CREATOR_DELIVERY_PATH)[number]);
    if (at < 0) {
      throw new SettlementCreatorError("load_not_deliverable", `Load ${loadId}: status '${cur}' cannot be moved to delivered.`);
    }
    const next = CREATOR_DELIVERY_PATH[at + 1]!;
    const result = (await transition(client as never, actorUserId, operatingCompanyId, loadId, {
      new_status: next as never,
      reason: "Settlement Creator: delivered per the signed settlement",
      delivered_at: next === "delivered_pending_docs" ? deliveredAt : null,
    })) as { error?: string } | null | undefined;
    if (!result || result.error) {
      throw new SettlementCreatorError("load_delivery_refused", `Load ${loadId}: dispatch refused ${cur} -> ${next}: ${result?.error ?? "load not found"}`);
    }
  }
}
