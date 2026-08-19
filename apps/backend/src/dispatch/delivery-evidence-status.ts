/**
 * SYS-F5509 — extracted from delivery-evidence-latch.ts to break an import cycle:
 * accounting/invoice-gl.service.ts -> accounting/posting-engine.service.ts ->
 * dispatch/delivery-evidence-latch.ts -> accounting/invoice-send.service.ts ->
 * accounting/invoice-gl.service.ts.
 *
 * posting-engine.service.ts only ever needed this one predicate from delivery-evidence-latch.ts (see
 * CLS-DISP-WIRE-07's comment there: "Reuses `isDeliveryEvidenceStatus` rather than re-listing the
 * statuses"), never the after-commit latch machinery itself. Giving the predicate its own leaf module
 * lets posting-engine depend on the STATUS DEFINITION without depending on the whole dispatch latch —
 * same single source of truth, zero behavior change, cycle broken by construction.
 */

/**
 * Load statuses that constitute delivery evidence. Kept in ONE place so the driver paths and the
 * office path cannot drift apart on what "delivered" means.
 */
const DELIVERY_EVIDENCE_STATUSES = new Set(["delivered_pending_docs", "completed_docs_received"]);

export function isDeliveryEvidenceStatus(status: string): boolean {
  return DELIVERY_EVIDENCE_STATUSES.has(status);
}
