import { apiRequest } from "./client";
import type { SettlementListRow } from "./driverFinance";

/** Full open register, distinct from the short payment-ready preview on Drivers home. */
export async function listOpenPreSettlements(companyId: string): Promise<SettlementListRow[]> {
  const rows: SettlementListRow[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({ operating_company_id: companyId, limit: "200", offset: String(offset) });
    const page = await apiRequest<{ settlements: SettlementListRow[]; total_count: number }>(
      `/api/v1/driver-finance/settlements?${params.toString()}`,
    );
    rows.push(...page.settlements);
    offset += page.settlements.length;
    if (offset >= page.total_count) break;
    if (page.settlements.length === 0) throw new Error("The settlement list is incomplete. Refresh to try again.");
  }
  return rows.filter((row) => !row.trip_closed_at &&
    !["closed", "approved", "paid", "final", "cancelled", "canceled", "void", "voided"].includes(String(row.status).toLowerCase()) &&
    !["cleared", "manual_paid"].includes(String(row.payment_state ?? "").toLowerCase()));
}
