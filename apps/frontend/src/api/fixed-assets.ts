import { apiRequest } from "./client";

export type FixedAssetListItem = {
  id: string;
  asset_number: string | null;
  name: string;
  owner_operating_company_id: string;
  owner_company_name: string | null;
  is_owner_operated: boolean;
  class_id: string;
  class_name: string | null;
  purchase_price_cents: number;
  salvage_value_cents: number;
  purchase_date: string;
  in_service_date: string;
  method: string;
  useful_life_months: number;
  convention: string;
  status: string;
  created_at: string;
  depreciation_to_date_cents: number;
  net_book_value_cents: number;
};

export type DepreciationScheduleRow = {
  period_number: number;
  period_date: string;
  depreciation_amount_cents: number;
  accumulated_to_date_cents: number;
  book_value_end_cents: number;
  method_snapshot: string;
  /** ACCT-F5302: whether the already-built poster (postDepreciation, "FIN-21") has actually posted
   * this period's JE — as opposed to this row being only a computed, unposted preview. */
  posted: boolean;
  posted_journal_entry_id: string | null;
};

export type FixedAssetDisposal = {
  id: string;
  disposal_date: string;
  disposal_type: string;
  proceeds_cents: number;
  book_value_at_disposal_cents: number;
  gain_loss_cents: number;
  posting_status: string;
  notes: string | null;
};

export type FixedAssetJeLine = { account_id: string; debit_cents: number; credit_cents: number; memo: string };

export type FixedAssetDetail = FixedAssetListItem & {
  unit_uuid: string | null;
  vin_serial: string | null;
  prior_accumulated_depr_cents: number;
  total_expected_units: number | null;
  schedule: DepreciationScheduleRow[];
  schedule_note: string | null;
  disposal: FixedAssetDisposal | null;
  last_posted_journal_entry_id: string | null;
  last_posted_period_number: number | null;
  je_preview: {
    /** @deprecated ambiguous — kept for back-compat, equals autopost_enabled. Use manual_posting_enabled. */
    posting_enabled: boolean;
    autopost_enabled: boolean;
    manual_posting_enabled: boolean;
    depreciation_je_template: { lines: FixedAssetJeLine[]; balanced: boolean } | null;
  };
};

export type FixedAssetList = { total: number; limit: number; offset: number; items: FixedAssetListItem[] };

export type RegisterFixedAssetUnitInput = {
  operating_company_id: string;
  owner_operating_company_id: string;
  unit_uuid: string;
  purchase_price_cents: number;
  salvage_value_cents?: number;
  purchase_date?: string;
  in_service_date?: string;
};

export type RegisterFixedAssetUnitResult = {
  created: boolean;
  reason?: "already_registered" | "unit_not_found" | "class_missing" | "invalid_price";
  fixed_asset_id?: string;
  asset_number?: string | null;
  schedule_periods?: number;
  accum_depr_source?: string;
};

export type RegisterTrkUnitsInput = {
  operating_company_id: string;
  owner_operating_company_id: string;
  pricesByUnitNumber: Record<string, number>;
};

export type RegisterTrkUnitsResult = {
  registered: number;
  skipped_already: number;
  missing_price: string[];
  errors: Array<{ unit_number: string; reason: string }>;
  accum_depr_unresolved: string[];
};

export function getFixedAssets(input: {
  operating_company_id: string;
  status?: string;
  class_id?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: input.operating_company_id });
  if (input.status) q.set("status", input.status);
  if (input.class_id) q.set("class_id", input.class_id);
  if (input.limit != null) q.set("limit", String(input.limit));
  if (input.offset != null) q.set("offset", String(input.offset));
  return apiRequest<FixedAssetList>(`/api/v1/accounting/fixed-assets?${q}`);
}

export function getFixedAssetDetail(id: string, operating_company_id: string) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<FixedAssetDetail>(`/api/v1/accounting/fixed-assets/${id}?${q}`);
}

/** ND-FA-01 — register one owned unit (purchase_price_cents required; no invented $). */
export function registerFixedAssetUnit(body: RegisterFixedAssetUnitInput) {
  return apiRequest<RegisterFixedAssetUnitResult>("/api/v1/accounting/fixed-assets/register-unit", {
    method: "POST",
    body,
  });
}

/** ND-FA-01 — bulk register TRK-owned units; pricesByUnitNumber required (fail closed). */
export function registerTrkOwnedUnits(body: RegisterTrkUnitsInput) {
  return apiRequest<RegisterTrkUnitsResult>("/api/v1/accounting/fixed-assets/register-trk-units", {
    method: "POST",
    body,
  });
}
