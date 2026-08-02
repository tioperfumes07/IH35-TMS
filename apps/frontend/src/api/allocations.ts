import { apiRequest } from "./client";

/**
 * Allocations list client — FH-7 unit cost allocation (Accounting sub-nav "Allocations" tab).
 * Reads `accounting.bill_unit_allocation` rows written by the existing
 * `POST /accounting/bills/:id/allocate` engine (BillAllocationPanel). List-only; no new math here.
 */
export type AllocationListItem = {
  id: string;
  bill_id: string;
  bill_number: string | null;
  bill_date: string;
  bill_amount_cents: number;
  vendor_id: string | null;
  /** ACCT-F84 — canonical vendor uuid for drill-through; vendor_id is a legacy TEXT QBO id. */
  mdata_vendor_id: string | null;
  vendor_name: string | null;
  asset_id: string;
  unit_code: string;
  unit_id: string | null;
  coa_account_id: string | null;
  gl_account_number: string | null;
  gl_account_name: string | null;
  allocation_method: string;
  allocation_pct: number;
  allocated_amount_cents: number;
  created_at: string;
};

export type AllocationList = {
  total: number;
  limit: number;
  offset: number;
  items: AllocationListItem[];
};

export function getAllocations(input: {
  operating_company_id: string;
  bill_id?: string;
  asset_id?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: input.operating_company_id });
  if (input.bill_id) q.set("bill_id", input.bill_id);
  if (input.asset_id) q.set("asset_id", input.asset_id);
  if (input.limit != null) q.set("limit", String(input.limit));
  if (input.offset != null) q.set("offset", String(input.offset));
  return apiRequest<AllocationList>(`/api/v1/accounting/allocations?${q}`);
}
