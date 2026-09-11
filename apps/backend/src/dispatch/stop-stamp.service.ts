/**
 * Shared stop-arrival/departure stamping logic — extracted from
 * driver-pwa/dispatch-view.routes.ts (2026-09-11, TRUCK LINE build) so a second caller (the
 * office/dispatcher-facing Truck Line "click next station" action) can stamp the SAME
 * mdata.load_stops columns through the SAME transition/side-effect chain, rather than a private
 * reimplementation that could silently drift from the driver-PWA path — especially since that
 * chain includes revenue/settlement side effects (latchOnDeliveryEvidence,
 * pingSettlementOnLoadEvent, mintProformaInvoiceOnFirstPickup) that must never double-fire or be
 * skipped. Both driver-pwa/dispatch-view.routes.ts and dispatch/truck-line/stop-stamp.routes.ts
 * call these two functions; neither re-types the SQL.
 *
 * Callers own their own row lock + authorization JOIN (a driver must own the load; an office
 * caller only needs company membership) — this file starts from an already row-locked stop.
 */
import type { DbClient } from "./presettlement-link.service.js";
import { validateLoadStopStatusWrite } from "./load-state-machine.js";
import { latchOnDeliveryEvidence } from "./delivery-evidence-latch.js";
import { pingSettlementOnLoadEvent } from "../driver-finance/settlements-load-bookended.service.js";
import { mintProformaInvoiceOnFirstPickup } from "../accounting/proforma-mint-on-first-pickup.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export type StopArrivalSource = "driver_app" | "eld_geofence" | "manual";

export type LockedStopRow = {
  id: string;
  stop_type: string;
  load_status: string;
  operating_company_id: string;
};

export type StampResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: "invalid_load_state"; from: string; to: string }
  | { ok: false; error: "arrival_already_recorded" | "departure_already_recorded" | "load_transition_conflict" };

/** Stamp arrival — mirrors driver-pwa/dispatch-view.routes.ts's arrival handler exactly. */
export async function stampStopArrival(
  client: DbClient,
  stop: LockedStopRow,
  ctx: { loadId: string; actorUserId: string; source: StopArrivalSource; auditEvent: string }
): Promise<StampResult<{ proforma_invoice: unknown }>> {
  const nextLoadStatus = stop.stop_type === "pickup" ? "at_pickup" : "at_delivery";
  const transition = validateLoadStopStatusWrite(stop.load_status, nextLoadStatus);
  if (!transition.ok) return { ok: false, error: "invalid_load_state", from: transition.from, to: transition.to };

  const arrivalUpdate = await client.query<{ id: string }>(
    `
      UPDATE mdata.load_stops
      SET actual_arrival_at = now(),
          actual_arrival_source = $3,
          status = 'arrived'
      WHERE id = $1
        AND load_id = $2
        AND actual_arrival_at IS NULL
      RETURNING id
    `,
    [stop.id, ctx.loadId, ctx.source]
  );
  if (!arrivalUpdate.rows[0]?.id) return { ok: false, error: "arrival_already_recorded" };

  const loadUpdate = await client.query<{ id: string }>(
    `UPDATE mdata.loads
     SET status = $2
     WHERE id = $1
       AND operating_company_id = $3::uuid
       AND status::text = $4
     RETURNING id`,
    [ctx.loadId, nextLoadStatus, stop.operating_company_id, stop.load_status]
  );
  if (!loadUpdate.rows[0]?.id) return { ok: false, error: "load_transition_conflict" };

  await appendCrudAudit(client, ctx.actorUserId, ctx.auditEvent, { load_id: ctx.loadId, stop_id: stop.id });

  const pickupMint = await mintProformaInvoiceOnFirstPickup(client, {
    operatingCompanyId: stop.operating_company_id,
    loadId: ctx.loadId,
    actorUserId: ctx.actorUserId,
    stopId: stop.id,
  });
  const proformaInvoice = pickupMint.outcome === "minted" || pickupMint.outcome === "idempotent" ? pickupMint.invoice : null;

  return { ok: true, proforma_invoice: proformaInvoice };
}

/** Stamp departure — mirrors driver-pwa/dispatch-view.routes.ts's departure handler exactly. */
export async function stampStopDeparture(
  client: DbClient,
  stop: LockedStopRow & { status: string },
  ctx: { loadId: string; actorUserId: string; source: StopArrivalSource; auditEvent: string }
): Promise<StampResult<{ proforma_invoice: unknown }> | { ok: false; error: "invalid_stop_state" }> {
  if (!["arrived", "loaded", "unloaded"].includes(stop.status)) return { ok: false, error: "invalid_stop_state" };

  const nextLoadStatus = stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit";
  const transition = validateLoadStopStatusWrite(stop.load_status, nextLoadStatus);
  if (!transition.ok) return { ok: false, error: "invalid_load_state", from: transition.from, to: transition.to };

  const departureUpdate = await client.query<{ id: string }>(
    `
      UPDATE mdata.load_stops
      SET actual_departure_at = now(),
          actual_departure_source = $3,
          status = 'departed'
      WHERE id = $1
        AND load_id = $2
        AND actual_departure_at IS NULL
      RETURNING id
    `,
    [stop.id, ctx.loadId, ctx.source]
  );
  if (!departureUpdate.rows[0]?.id) return { ok: false, error: "departure_already_recorded" };

  const loadUpdate = await client.query<{ id: string }>(
    `UPDATE mdata.loads
     SET status = $2
     WHERE id = $1
       AND operating_company_id = $3::uuid
       AND status::text = $4
     RETURNING id`,
    [ctx.loadId, nextLoadStatus, stop.operating_company_id, stop.load_status]
  );
  if (!loadUpdate.rows[0]?.id) return { ok: false, error: "load_transition_conflict" };

  // Same non-fatal contract as the driver-pwa path — a settlement ping failure must never fail
  // the stamp itself.
  await latchOnDeliveryEvidence(client, {
    operatingCompanyId: stop.operating_company_id,
    loadId: ctx.loadId,
    targetStatus: nextLoadStatus,
    actorUserId: ctx.actorUserId,
  });
  try {
    await pingSettlementOnLoadEvent(client, {
      loadId: ctx.loadId,
      operatingCompanyId: stop.operating_company_id,
      dispatchTargetStatus: nextLoadStatus,
      actorUserId: ctx.actorUserId,
    });
  } catch (err) {
    console.warn({ err, load_id: ctx.loadId }, "stop_departure_settlement_ping_failed");
  }

  await appendCrudAudit(client, ctx.actorUserId, ctx.auditEvent, { load_id: ctx.loadId, stop_id: stop.id });

  const pickupMint = await mintProformaInvoiceOnFirstPickup(client, {
    operatingCompanyId: stop.operating_company_id,
    loadId: ctx.loadId,
    actorUserId: ctx.actorUserId,
    stopId: stop.id,
  });
  const proformaInvoice = pickupMint.outcome === "minted" || pickupMint.outcome === "idempotent" ? pickupMint.invoice : null;

  return { ok: true, proforma_invoice: proformaInvoice };
}
