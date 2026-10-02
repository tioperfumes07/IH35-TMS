/**
 * The ONE dispatch status transition (PATCH /api/v1/dispatch/loads/:id/transition), extracted from the route so
 * every caller runs the same graph check and the same side effects in the caller's transaction: reefer lumper gate,
 * reverse-move audit, escrow proposals, final-delivery departure stamp (never overwrites), driver-bill mint
 * (ensureDriverBillArtifactsForLoad), revenue latch + invoice (latchOnDeliveryEvidence, after COMMIT), settlement
 * ping, spine event, abandonment outbox. Callers: the office route, and (ROUND 315) the geofence-evidence
 * auto-delivery engine. Behaviour is byte-for-byte the route's; only the inputs became parameters.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { emitAutoProposedEscrowEvents } from "../driver-finance/escrow-deduction-pending.service.js";
import { pingSettlementOnLoadEvent } from "../driver-finance/settlements-load-bookended.service.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { emitDispatchSpineEvent } from "./dispatch-spine-emit.js";
import { latchOnDeliveryEvidence } from "./delivery-evidence-latch.js";
import { fromMdataStatus, isReverseTransition, toMdataStatus, validateLoadStatusTransition } from "./load-state-machine.js";
import { loadStatusRequiresDeliveryDepartureStamp, stampFinalActiveDeliveryDeparture } from "./stamp-final-delivery-departure.js";
import { ensureDriverBillArtifactsForLoad, type DriverBillMintOutcome } from "./book-load.service.js";

export type DispatchTransitionInput = {
  new_status: Parameters<typeof validateLoadStatusTransition>[1];
  reason?: string | null;
  delivered_at?: string | null;
};

/** The transaction client of withCompanyScope / withLuciaBypass (after-commit queue keyed on it). */
export type TransitionClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

export async function transitionDispatchLoadInClientTx(client: TransitionClient, actorUserId: string, operatingCompanyId: string, loadId: string, input: DispatchTransitionInput) {
  // ROUND 315: a status transition never waits minutes on a lock nor sits idle holding one. Every caller runs this
  // in a managed transaction (after-commit queue), so the money side effects run after COMMIT; these bound the
  // window if anything inside still blocks. SET LOCAL -> ends with the transaction.
  await client.query(`SET LOCAL lock_timeout = '10s'`);
  await client.query(`SET LOCAL idle_in_transaction_session_timeout = '60s'`);
  // MILES-ON-BOOK — set on delivery mint; returned so the board can toast a skip.
  let driverBillOutcome: DriverBillMintOutcome | null = null;
  const currentRes = await client.query<{
    status: string;
    load_number: string | null;
    assigned_primary_driver_id: string | null;
    trailer_type: string | null;
    lumper_payer: string | null;
    lumper_will_invoice_customer: boolean | null;
    lumper_late_penalty_applies: boolean | null;
  }>(
    `
      SELECT status, load_number, assigned_primary_driver_id::text,
             trailer_type, lumper_payer, lumper_will_invoice_customer, lumper_late_penalty_applies
      FROM mdata.loads
      WHERE id = $1
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
    [loadId, operatingCompanyId]
  );
  const current = currentRes.rows[0] ?? null;
  if (!current) return { error: "not_found" as const };
  const currentStatus = fromMdataStatus(current.status);
  const targetStatus = input.new_status;
  const transition = validateLoadStatusTransition(current.status, targetStatus);
  if (!transition.ok) {
    return { error: "invalid_transition" as const, from: transition.from, to: transition.to };
  }

  // ZONE 1 REVERSE TRANSITION (owner ruling 2026-09-12 "a draggable column should be able to be
  // sent back etc."). A backward move within the operational zone (in_transit→dispatched,
  // dispatched→assigned_not_dispatched, assigned_not_dispatched→unassigned) is now a legal edge
  // (see REVERSIBLE_BACK_EDGES). It REQUIRES a reason so the undo is as traceable as the forward
  // move, and it posts nothing — none of its targets stamp stop actuals, mint driver bills, emit
  // escrow events, or fire the revenue latch, so every forward-only side effect below is skipped.
  const isReverse = isReverseTransition(current.status, targetStatus);
  if (isReverse && !input.reason) {
    return { error: "reversal_reason_required" as const, from: currentStatus, to: targetStatus };
  }

  const mdataStatus = toMdataStatus(targetStatus);
  // REEFER-LUMPER-CONFIRMATION (migration 202614010000, owner spec 2026-09-08) — a reefer load
  // (trailer_type='refrigerated_van', the SAME signal BookLoadEquipmentSection.tsx's isReefer
  // uses to show the reefer panel) must not reach 'dispatched' without all 3 lumper-confirmation
  // fields set. Booking itself is never DB-blocked on this (frontend enforces it there); this is
  // the real backstop against a bypass (API caller, legacy form, etc.). Skipped on a REVERSE move:
  // a load reversing in_transit→dispatched already cleared this gate on its way forward, and
  // re-blocking it would strand the very mis-drag the reversal exists to undo.
  if (!isReverse && mdataStatus === "dispatched" && current.trailer_type === "refrigerated_van") {
    const missing =
      current.lumper_payer == null ||
      current.lumper_will_invoice_customer == null ||
      current.lumper_late_penalty_applies == null;
    if (missing) {
      return { error: "reefer_lumper_confirmation_required" as const };
    }
  }
  // Compare-and-set (CC-3 queue 2b): the row is locked above and the UPDATE only lands while the status is still the
  // one this transition validated — a concurrent writer (GPS auto-status, driver PWA stamp, bulk) can never be
  // overwritten by a stale decision.
  const transitionUpdate = await client.query<{ id: string }>(
    `UPDATE mdata.loads
     SET status = $2
     WHERE id = $1
       AND operating_company_id = $3::uuid
       AND status::text = $4
     RETURNING id`,
    [loadId, mdataStatus, operatingCompanyId, current.status]
  );
  if (!transitionUpdate.rows[0]?.id) return { error: "status_changed" as const, from: currentStatus, to: targetStatus };

  // ZONE 1 REVERSE audit — record the undo with its reason so it is exactly as traceable as any
  // forward transition (the row-mutation trigger already captures who/when; this names WHY and
  // that it was a deliberate reversal). No GL, no posting — an operational correction only.
  if (isReverse) {
    await appendCrudAudit(
      client,
      actorUserId,
      "dispatch.load.status_reversed",
      {
        load_uuid: loadId,
        operating_company_id: operatingCompanyId,
        load_number: current.load_number ?? null,
        from_status: currentStatus,
        to_status: targetStatus,
        reason: input.reason,
      },
      "warning",
      "REVERSE-TRANSITIONS-ZONE1"
    );
  }

  if (mdataStatus === "abandoned" || mdataStatus === "driver_walkoff" || mdataStatus === "driver_no_show") {
    await emitAutoProposedEscrowEvents({
      client,
      actor_user_id: actorUserId,
      operating_company_id: operatingCompanyId,
      load_id: loadId,
      load_status: mdataStatus,
    });
  }

  // ACCT-F81 — OFFICE-DELIVERS COUPLING. Delivery evidence must exist whether the DRIVER or the
  // OFFICE confirmed the delivery. Owner ruling 2026-08-01: invoicing must NOT depend on the
  // driver — dispatch/accounting confirming a delivery is an equally valid path.
  //
  // THE DEFECT THIS CLOSES. This endpoint validated only the status graph
  // (validateLoadStatusTransition above) and never touched mdata.load_stops. So an office user
  // could move a load to delivered_pending_docs — which fires the proforma → draft conversion
  // directly below, unblocking send / A/R / factoring — while every stop stayed `pending` with
  // actual_departure_at NULL. Verified on prod 2026-08-01: 20 stop rows, 0 with actual_arrival_at,
  // 0 with actual_departure_at, and one LIVE load sitting at completed_docs_received (the terminal
  // billing status) with both of its stops still pending. Meanwhile the recognition gate in
  // revrec-delivery-posting/poster.service.ts reads exactly that timestamp off the final active
  // delivery stop, so office-confirmed loads could bill while never being recognizable — the
  // evidence the money path asks for was structurally unreachable by the office path.
  //
  // The coupling mirrors driver/loads.routes.ts (the one path that already derives status FROM the
  // stop event) and writes in the SAME transaction as the load status, so the two can never
  // disagree. Three deliberate constraints:
  //
  //   1. NEVER OVERWRITE. `AND s.actual_departure_at IS NULL` — if the driver already captured a
  //      real departure, that observation wins. The office confirmation must not clobber first-hand
  //      evidence with a later, weaker timestamp.
  //   2. FINAL ACTIVE DELIVERY STOP ONLY — highest sequence_number among delivery stops that are
  //      neither cancelled nor soft-deleted, identical to the driver handler and to the poster's
  //      own evidence query. On a multi-drop load an earlier drop must not complete the load.
  //   3. actual_arrival_at IS LEFT NULL. We have no evidence of when the truck arrived, and the
  //      office is not asserting one. Stamping an arrival to make the row look complete would be
  //      inventing an observation that never happened — the precise thing the scope doc forbids.
  //      Departure is set because that IS what the office is attesting to.
  //
  // Attribution comes from withCompanyScope(actorUserId, …) via the audit trigger, so every
  // office-stamped departure carries who asserted it. NOT a backfill: this fires only on a live
  // office action, never over historical rows (see DISPATCH-STATUS-STOP-COUPLING-SCOPE §3 — loads
  // already past the gate stay flagged and unrecognized until a human supplies real evidence).
  if (loadStatusRequiresDeliveryDepartureStamp(targetStatus)) {
    // CLS-DISP-WIRE-07 — shared stamp (also used by bulk + mdata status paths).
    await stampFinalActiveDeliveryDeparture(
      client,
      operatingCompanyId,
      loadId,
      input.delivered_at ?? null
    );

    // ACCT-F277 — delivery cannot recognize freight revenue while silently carrying no driver
    // cost record. Re-enter the canonical idempotent pay path: an existing Book bill is a no-op;
    // a secondary-created load mints from configured pay inputs or records the honest
    // skipped_no_pay_rate audit. Missing mileage is never converted into a $0 payable.
    // MILES-ON-BOOK: capture the OUTCOME. The refusal to price a per-mile driver with no
    // shortest miles is correct, but until now it was written only to audit.audit_events, which
    // no dispatcher reads — so delivery succeeded and the missing driver bill was silent.
    // Measured on prod 2026-08-09: 24 of 25 USMCA loads have no miles_shortest, 18 skip events,
    // 2 driver bills. The warning below is how that stops being invisible.
    driverBillOutcome = await ensureDriverBillArtifactsForLoad(client, {
      loadId: loadId,
      operatingCompanyId,
      actorUserId: actorUserId,
    });
  }

  // ND-INV-01 — at delivery evidence, convert proforma → draft and auto-send so A/R + factoring can
  // proceed. ACCT-F351 MOVED THIS INTO latchOnDeliveryEvidence (below): it lived here inline, gated on
  // the single status `delivered_pending_docs`, and had exactly ONE caller while the revenue latch had
  // five. Every other delivery path — including both driver-PWA capture paths, where a delivery is
  // actually performed — recognized revenue and never raised the receivable. Recognizing revenue and
  // invoicing the customer are two halves of one event, so they are now ONE call (§9.0.17).

  // DISP-01 — two-event revenue latch (flag OFF → no-op). Earn at delivery; bill at POD.
  //
  // LV-REVREC-NOT-FIRING (live-proven on prod 2026-08-07): this used to call
  // postLoadRevenueLatch() DIRECTLY, from inside this open transaction. The poster opens its own
  // connection via withLuciaBypass, so it could not see the delivery departure this very handler
  // stamps ~40 lines above (still uncommitted). Its evidence gate returned
  // missing_delivery_evidence and posted nothing — silently, because a gate is a return value,
  // not a throw. Now routed through the shared helper, which defers the poster to after COMMIT
  // and owns the trigger condition + swallow-and-log in ONE place (§9.0.17), so this route and
  // the four other delivery paths cannot drift on what "delivered" means.
  await latchOnDeliveryEvidence(client, {
    operatingCompanyId,
    loadId: loadId,
    targetStatus,
    actorUserId: actorUserId,
  });

  try {
    await pingSettlementOnLoadEvent(client, {
      loadId: loadId,
      operatingCompanyId,
      dispatchTargetStatus: targetStatus,
      actorUserId: actorUserId,
    });
  } catch (err) {
    console.warn({ err }, "dispatch_load_settlement_ping_failed");
  }
  await emitDispatchSpineEvent(client, {
    operating_company_id: operatingCompanyId,
    actor_user_id: actorUserId,
    event_type: "load.status_changed",
    load_id: loadId,
    payload: { from_status: currentStatus, to_status: targetStatus },
  });
  if (targetStatus === "abandoned") {
    // The abandonment alert is part of the status transition. Persist it before this scoped
    // transaction commits; the direct multi-channel notification below remains supplemental.
    await enqueueOutboxEvent(
      client,
      "load.abandoned",
      { aggregate_type: "load", aggregate_id: loadId },
      {
        operating_company_id: operatingCompanyId,
        load_id: loadId,
        load_number: current.load_number,
        driver_id: current.assigned_primary_driver_id,
        actor_user_id: actorUserId,
      }
    );
  }
  return {
    ok: true as const,
    status: targetStatus,
    driver_bill_mint: driverBillOutcome,
  };
}
