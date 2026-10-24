/**
 * ROUND 443.293-B — Dispatch opens the one Settlement Close wizard, pre-filled
 * for that driver's open tour. Same route Settlements › Settlement Close already uses.
 */

const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "void", "voided"]);

const DELIVERED_STATUSES = new Set([
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
]);

export type CloseSettlementLeg = {
  load_id: string;
  status?: string | null;
  is_delivered?: boolean;
  is_cancelled?: boolean;
};

export function closeSettlementHref(driverId: string, settlementId?: string | null): string {
  const params = new URLSearchParams();
  params.set("driver_id", driverId.trim());
  const settlement = settlementId?.trim();
  if (settlement) params.set("settlement_id", settlement);
  return `/driver-finance/settlement-close?${params.toString()}`;
}

/** Last delivered leg in the order given. Cancelled legs are skipped. Null when none have delivered. */
export function lastDeliveredLoadId(legs: readonly CloseSettlementLeg[]): string | null {
  let last: string | null = null;
  for (const leg of legs) {
    if (!leg.load_id || leg.is_cancelled) continue;
    const status = String(leg.status ?? "").toLowerCase();
    if (CANCELLED_STATUSES.has(status)) continue;
    const delivered = leg.is_delivered === true || DELIVERED_STATUSES.has(status);
    if (delivered) last = leg.load_id;
  }
  return last;
}
