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
 */
import { postLoadRevenueLatch } from "../accounting/revrec-delivery-posting/poster.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

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

/**
 * Fire the revenue latch for a load that just reached a delivery-evidence status.
 * No-op for any other status. Never throws — see the swallow-and-log note above.
 *
 * @returns true when the latch was invoked (not that it posted — the flag may be OFF, which is a
 *          legitimate no-op inside the poster).
 */
export async function latchOnDeliveryEvidence(input: DeliveryEvidenceLatchInput): Promise<boolean> {
  if (!isDeliveryEvidenceStatus(input.targetStatus)) return false;
  try {
    await postLoadRevenueLatch({
      operating_company_id: input.operatingCompanyId,
      load_id: input.loadId,
      target_status: input.targetStatus,
      entry_date_iso: input.entryDateIso ?? companyBusinessDate(),
      actor_user_id: input.actorUserId,
    });
    return true;
  } catch (err) {
    console.warn(
      { err, load_id: input.loadId, target_status: input.targetStatus },
      "disp_wire_07_revrec_latch_failed"
    );
    return false;
  }
}
