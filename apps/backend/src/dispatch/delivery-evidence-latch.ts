/**
 * CLS-DISP-WIRE-07 — every path that moves a load INTO a delivery-evidence status must fire the
 * two-event revenue latch, not just the office one.
 *
 * THE DEFECT THIS EXISTS FOR: `PATCH /api/v1/dispatch/loads/:id/transition` (office) calls
 * postLoadRevenueLatch() when the target status is `delivered_pending_docs` /
 * `completed_docs_received`. The two DRIVER capture paths set that SAME status with a bare
 * `UPDATE mdata.loads SET status = $2` and never latched. So the only party who actually performs a
 * delivery — the driver, in the PWA — could not trigger revenue recognition, and hops 4→9
 * (deliver → revenue → invoice → GL → bank) could not flow from real field activity. Delivery
 * evidence existed in `mdata.load_stops` while the ledger never heard about it.
 *
 * ONE HELPER, NOT THREE COPIES (§9.0.17): the trigger condition and the swallow-and-log policy live
 * here once. A fourth delivery path added later calls this and is correct by construction; the guard
 * `verify-delivery-evidence-latch-wired` fails if it forgets.
 *
 * SWALLOW-AND-LOG IS DELIBERATE, and matches the office path exactly: a latch failure must never
 * 500 the driver's "I departed the delivery" tap. Losing the stop capture is worse than deferring
 * recognition, which the twice-daily reconcile and the scenario tracker both surface.
 *
 * ★ AFTER-COMMIT (LV-REVREC-NOT-FIRING, live-proven on prod 2026-08-07 — the reason this helper now
 * takes the transaction client). Every caller invokes this from INSIDE an open `withCurrentUser()`
 * transaction, immediately after stamping the delivery departure — which reads correctly and was
 * wrong. `postLoadRevenueLatch` opens its OWN connection through `withLuciaBypass`, and under READ
 * COMMITTED that second connection cannot see the caller's uncommitted stamp. The poster's evidence
 * gate re-read `actual_departure_at`, found NULL, returned `missing_delivery_evidence` and posted
 * NOTHING — a gate is a return value, not a throw, so even the deliberate swallow-and-log above
 * never fired. Then the caller committed, the row appeared, and nothing retried. Every path was
 * dark and every static guard was green.
 *
 * The fix is ordering, and it lives HERE rather than in five route files: the latch is enqueued on
 * the transaction's after-commit queue (lib/after-commit.ts) and runs once the write it depends on
 * is durable. Callers keep the call where it belongs in the code. A caller outside a managed
 * transaction (none today) still fires inline, because there is nothing to wait for — never dropped.
 */
import { postLoadRevenueLatch } from "../accounting/revrec-delivery-posting/poster.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { enqueueAfterCommit } from "../lib/after-commit.js";

/**
 * Load statuses that constitute delivery evidence. Kept in ONE place so the driver paths and the
 * office path cannot drift apart on what "delivered" means.
 */
const DELIVERY_EVIDENCE_STATUSES = new Set(["delivered_pending_docs", "completed_docs_received"]);

export function isDeliveryEvidenceStatus(status: string): boolean {
  return DELIVERY_EVIDENCE_STATUSES.has(status);
}

export type DeliveryEvidenceLatchInput = {
  operatingCompanyId: string;
  loadId: string;
  targetStatus: string;
  actorUserId: string;
  /** Defaults to the COMPANY business date (America/Chicago), never UTC. */
  entryDateIso?: string;
};

async function firePostLoadRevenueLatch(input: DeliveryEvidenceLatchInput): Promise<void> {
  try {
    await postLoadRevenueLatch({
      operating_company_id: input.operatingCompanyId,
      load_id: input.loadId,
      target_status: input.targetStatus,
      // Resolved at FIRE time, not enqueue time: the business date the entry belongs to is the date
      // the write became durable.
      entry_date_iso: input.entryDateIso ?? companyBusinessDate(),
      actor_user_id: input.actorUserId,
    });
  } catch (err) {
    console.warn(
      { err, load_id: input.loadId, target_status: input.targetStatus },
      "disp_wire_07_revrec_latch_failed"
    );
  }
}

/**
 * Fire the revenue latch for a load that just reached a delivery-evidence status.
 * No-op for any other status. Never throws — see the swallow-and-log note above.
 *
 * @param client the transaction client the caller is writing on. Used ONLY as the after-commit
 *        queue key — this helper issues no SQL on it. Required, not optional: an optional client
 *        would make the pre-commit ordering bug re-introducible by omission, which is exactly how
 *        it got here.
 * @returns "deferred" when queued to run after the caller's COMMIT (the normal path),
 *          "fired" when run inline because the client is not inside a managed transaction,
 *          "skipped" when the status is not delivery evidence.
 */
export async function latchOnDeliveryEvidence(
  client: object,
  input: DeliveryEvidenceLatchInput
): Promise<"deferred" | "fired" | "skipped"> {
  if (!isDeliveryEvidenceStatus(input.targetStatus)) return "skipped";
  const queued = enqueueAfterCommit(client, {
    label: `revrec-latch:${input.loadId}:${input.targetStatus}`,
    run: () => firePostLoadRevenueLatch(input),
  });
  if (queued) return "deferred";
  await firePostLoadRevenueLatch(input);
  return "fired";
}
