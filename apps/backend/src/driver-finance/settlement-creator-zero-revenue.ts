/**
 * ROUND 443.3 b — the ONE owner-authorized $0 customer invoice in a USMCA settlement.
 *
 * A load factored to Faro under Transportation (faro_transportation) inside a mixed settlement is booked in USMCA so
 * its driver bill, fuel, expenses and deductions stay attributable — but its customer revenue belongs to
 * Transportation, so the USMCA invoice is $0 (CC-1 ROUND 443.1: buildInvoiceFromLoad authorizedZeroRevenue — one
 * line, quantity 1, unit 0, no journal entry, never factorable).
 *
 * Authorized only when the load is faro_transportation AND carries no customer revenue: line haul blank or 0 and no
 * positive accessorial. Any other $0 load keeps refusing ("cannot mint invoice — rate is $0").
 */
type ZeroRevenueLoad = {
  factoring: string;
  line_haul_amount_cents?: number | null;
  accessorials?: Array<{ amount_cents: number }> | null;
};

export function isAuthorizedZeroRevenueLoad(load: ZeroRevenueLoad): boolean {
  if (load.factoring !== "faro_transportation") return false;
  if (Number(load.line_haul_amount_cents ?? 0) !== 0) return false;
  return !(load.accessorials ?? []).some((a) => Number(a.amount_cents) > 0);
}
