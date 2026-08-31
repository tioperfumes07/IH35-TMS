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
 *
 * Recognition trigger (locked): DISPATCH-STATUS-STOP-COUPLING-SCOPE-2026-08-01 §0(a) — final active
 * delivery-stop completion / actual_departure_at. Canonical statuses written by driver + office paths.
 */

/** Load statuses that constitute delivery evidence — the product definition of "delivered". */
export const DELIVERY_EVIDENCE_MDATA_STATUSES = ["delivered_pending_docs", "completed_docs_received"] as const;

const DELIVERY_EVIDENCE_STATUSES = new Set<string>(DELIVERY_EVIDENCE_MDATA_STATUSES);

/** Billing progression after delivery evidence — still on factoring/revenue path. */
export const POST_EVIDENCE_BILLING_MDATA_STATUSES = ["invoiced", "paid", "closed"] as const;

/** All load statuses on the factoring queue / packet / attribution path (import this, never inline). */
export const FACTORING_PATH_LOAD_MDATA_STATUSES = [
  ...DELIVERY_EVIDENCE_MDATA_STATUSES,
  ...POST_EVIDENCE_BILLING_MDATA_STATUSES,
] as const;

export function isDeliveryEvidenceStatus(status: string): boolean {
  return DELIVERY_EVIDENCE_STATUSES.has(status);
}

export function isFactoringPathLoadStatus(status: string): boolean {
  return isDeliveryEvidenceStatus(status) || (POST_EVIDENCE_BILLING_MDATA_STATUSES as readonly string[]).includes(status);
}

/** @deprecated alias — stamp helper name kept for call-site clarity */
export function loadStatusRequiresDeliveryDepartureStamp(status: string): boolean {
  return isDeliveryEvidenceStatus(status);
}
