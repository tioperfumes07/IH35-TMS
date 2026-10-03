import { apiRequest } from "./client";

/** ROUND 316 lease engine — contracts (owner-only create / sign / close) and monthly lease bills. */
export type LeaseType = "truck_lease" | "trailer_lease" | "lease_to_own";
export type BillingMode = "one_bill_per_unit" | "one_bill_all_units";
export type LeaseListRow = {
  id: string;
  display_id: string | null;
  lease_type: LeaseType | null;
  billing_mode: BillingMode | null;
  status: string;
  commencement_date: string;
  end_date: string;
  payment_amount_cents: number;
  deposit_cents: number | null;
  election: string;
  signed_at: string | null;
  closed_at: string | null;
  lessor_operating_company_id: string;
  lessor_company: string | null;
  lessor_vendor_id: string | null;
  lessor_vendor: string | null;
  asset_count: number;
  bill_count: number;
};
export type LeaseAssetRow = { id: string; unit_id: string | null; unit_number: string | null; equipment_id: string | null; equipment_number: string | null; monthly_amount_cents: number | null; start_date: string | null; end_date: string | null };
export type LeaseBillRow = { id: string; display_id: string | null; bill_number: string | null; bill_date: string; lease_period_start: string | null; amount_cents: number; paid_cents: number; status: string; last_payment_id: string | null };
export type LeaseDetail = { lease: Record<string, unknown> & { id: string; status: string; lease_type: LeaseType | null; billing_mode: BillingMode | null; lessor_vendor_id: string | null; lessor_vendor: string | null; lessor_company: string | null; commencement_date: string; end_date: string; signed_at: string | null; contract_instance_id: string | null; expense_account_id: string | null; expense_account_name: string | null; deposit_cents: number | null; escalation_pct_bps: number | null; escalation_every_months: number | null; election: string; display_id: string | null; close_reason: string | null; discount_rate_bps?: number | null; purchase_option_kind?: string | null; purchase_option_price_cents?: number | null; lessee_classification?: "operating" | "finance" | null; lessee_commencement_je_id?: string | null; lessee_liability_initial_cents?: number | null; bought_out_at?: string | null; buyout_bill_id?: string | null; buyout_je_id?: string | null }; assets: LeaseAssetRow[]; bills: LeaseBillRow[]; schedule?: LesseeSchedulePeriodRow[]; schedule_unavailable_reason?: string | null };
export type CreateLeaseBody = {
  operating_company_id: string;
  lease_type: LeaseType;
  billing_mode: BillingMode;
  lessor_operating_company_id: string;
  lessor_vendor_id: string;
  commencement_date: string;
  end_date: string;
  deposit_cents?: number | null;
  escalation_pct_bps?: number | null;
  escalation_every_months?: number | null;
  election?: "operating" | "sales_type";
  expense_account_id?: string | null;
  display_id?: string | null;
  /** ROUND 321 lease-to-own (ASC 842 lessee). */
  discount_rate_bps?: number | null;
  purchase_option_kind?: "none" | "fmv" | "fixed" | null;
  purchase_option_price_cents?: number | null;
  assets: Array<{ unit_id?: string | null; equipment_id?: string | null; monthly_amount_cents: number }>;
};
export type LesseeSchedulePeriodRow = {
  id: string; lease_asset_line_id: string; period_no: number; period_start: string; payment_cents: number; interest_cents: number;
  principal_cents: number; liability_open_cents: number; liability_close_cents: number; rou_amortization_cents: number; rou_close_cents: number;
  lease_cost_cents: number; bill_id: string | null; bill_display_id: string | null; accretion_je_id: string | null; posted_at: string | null;
};
export type AssetLeases = {
  contracts: Array<{ id: string; display_id: string | null; lease_type: string | null; status: string; commencement_date: string; end_date: string; signed_at: string | null; asset_line_id: string; monthly_amount_cents: number | null; lessor_vendor_id: string | null; lessor_vendor: string | null; lessor_company: string | null }>;
  bills: Array<{ bill_id: string; display_id: string | null; bill_date: string; lease_period_start: string | null; line_amount: string; status: string; paid_cents: number; amount_cents: number; last_payment_id: string | null }>;
};
const q = (c: string, extra: Record<string, string> = {}) => new URLSearchParams({ operating_company_id: c, ...extra }).toString();

export const leasesApi = {
  list: (c: string) => apiRequest<{ leases: LeaseListRow[] }>(`/api/v1/leases?${q(c)}`),
  get: (c: string, id: string) => apiRequest<LeaseDetail>(`/api/v1/leases/${id}?${q(c)}`),
  byAsset: (c: string, a: { unit_id?: string; equipment_id?: string }) =>
    apiRequest<AssetLeases>(`/api/v1/leases/by-asset?${q(c, a.unit_id ? { unit_id: a.unit_id } : { equipment_id: String(a.equipment_id) })}`),
  create: (body: CreateLeaseBody) => apiRequest<{ id: string }>(`/api/v1/leases`, { method: "POST", body: body }),
  sign: (c: string, id: string, signed_at: string) =>
    apiRequest<{ signed: string; bills: Array<{ period_start: string; created: unknown[]; refused: Array<{ key: string; reason: string }> }> }>(`/api/v1/leases/${id}/sign`, { method: "POST", body: { operating_company_id: c, signed_at } }),
  close: (c: string, id: string, closed_on: string, reason: string) =>
    apiRequest<{ closed: string }>(`/api/v1/leases/${id}/close`, { method: "POST", body: { operating_company_id: c, closed_on, reason } }),
  buyout: (c: string, id: string, buyout_date: string, price_cents?: number | null) =>
    apiRequest<{ lease_id: string; bill_id: string | null; je_id: string | null; price_cents: number; assets: Array<{ label: string; fixed_asset_id: string | null; reason?: string }> }>(`/api/v1/leases/${id}/buyout`, { method: "POST", body: { operating_company_id: c, buyout_date, price_cents: price_cents ?? null } }),
  generateBills: (c: string, period_start?: string, lease_id?: string) =>
    apiRequest<{ created: unknown[]; skipped_existing: string[]; refused: Array<{ key: string; reason: string }> }>(`/api/v1/leases/bills/generate`, { method: "POST", body: { operating_company_id: c, period_start, lease_id } }),
};
