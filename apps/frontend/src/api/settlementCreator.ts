import { apiRequest } from "./client";

export type SettlementCreatorFactorOption = "faro_usmca" | "faro_transportation" | "direct";
export type SettlementCreatorFuelCard = "dreamline" | "relay";

export type SettlementCreatorDraft = {
  operating_company_id: string;
  settlement_no: string;
  driver_id: string;
  unit_id?: string | null;
  trailer_equipment_number?: string | null;
  trailer_id?: string | null;
  period_start: string;
  period_end: string;
  loads: Array<{
    load_number: string;
    customer_name?: string | null;
    customer_id?: string | null;
    pickup_date?: string | null;
    pickup_city?: string | null;
    delivery_date?: string | null;
    delivery_city?: string | null;
    line_haul_miles?: number | null;
    line_haul_rate_cents?: number | null;
    line_haul_amount_cents?: number | null;
    factoring: SettlementCreatorFactorOption;
    date_sent_to_factoring?: string | null;
    loaded_miles?: number | null;
    empty_miles?: number | null;
    picks?: number | null;
    drops?: number | null;
    trip_type?: "NB" | "TR" | "SB" | "LOCAL" | null;
    join_outbound_load_number?: string | null;
    not_yet_delivered?: boolean | null;
  }>;
  seed_dispatched_loads?: boolean;
  fuel_purchases: Array<{
    date: string;
    vendor_name?: string | null;
    location?: string | null;
    invoice?: string | null;
    gallons: number;
    cpg_cents: number;
    receipt_cents?: number | null;
    fees_cents?: number | null;
    discount_cents?: number | null;
    card: SettlementCreatorFuelCard;
    load_number?: string | null;
    fuel_type?: "diesel" | "def" | "reefer_diesel";
  }>;
  expenses: Array<{
    date: string;
    item_name: string;
    description?: string | null;
    amount_cents: number;
    load_number?: string | null;
    is_company_expense: boolean;
    is_reimbursable: boolean;
    card?: SettlementCreatorFuelCard | null;
  }>;
  deductions: Array<{ description: string; amount_cents: number; load_number?: string | null }>;
  reimbursements: Array<{ description: string; amount_cents: number; load_number?: string | null }>;
  escrow: Array<{ description: string; amount_cents: number; load_number?: string | null }>;
  advances: Array<{
    description?: string | null;
    amount_cents: number;
    load_number?: string | null;
    linked_driver_bill_id?: string | null;
  }>;
  pdf_driver_net_cents: number;
  pdf_company_expenses_cents: number;
  /** ROUND 180 §14 — confirm Edit = void and repost when Settlement No. already exists. */
  edit_void_repost?: boolean;
};

export type SettlementCreatorJeLine = {
  load_number: string | null;
  account_number: string | null;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
  memo: string;
  section: string;
};

export type SettlementCreatorPreview = {
  je_lines: SettlementCreatorJeLine[];
  debit_total_cents: number;
  credit_total_cents: number;
  balanced: boolean;
  company_expenses_cents: number;
  company_expenses_matches_pdf: boolean;
  driver_net_cents: number;
  driver_net_matches_pdf: boolean;
  can_post: boolean;
  blockers: string[];
};

export async function previewSettlementCreator(draft: SettlementCreatorDraft) {
  return apiRequest<{ preview: SettlementCreatorPreview }>(
    "/api/v1/driver-finance/settlement-creator/preview",
    { method: "POST", body: JSON.stringify(draft) },
  );
}

export async function postSettlementCreator(draft: SettlementCreatorDraft) {
  return apiRequest<{
    ok: true;
    settlement_id: string;
    source_document_ref: string;
    display_id: string;
    load_ids: string[];
    expense_ids: string[];
    fuel_transaction_ids: string[];
    advance_ids: string[];
    journal_entry_ids: string[];
    preview: SettlementCreatorPreview;
  }>("/api/v1/driver-finance/settlement-creator/post", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

/** Pure peek — next AlwaysTrack settlement document number (digits). Never writes. */
export function peekNextSettlementNumber(operatingCompanyId: string) {
  return apiRequest<{ next_number: string }>(
    `/api/v1/driver-finance/settlement-creator/next-settlement-peek?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
