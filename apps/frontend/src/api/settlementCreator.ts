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
    /** SETL-F438 — bookLoad refuses a load carrying neither; Faro matches the invoice on them. */
    customer_po_number?: string | null;
    customer_wo_number?: string | null;
    pickup_date?: string | null;
    pickup_address?: string | null;
    pickup_city?: string | null;
    /** SETL-F438 — the real state. The seeder used to hardcode TX on both stops. */
    pickup_state?: string | null;
    pickup_zip?: string | null;
    pickup_lat?: number | null;
    pickup_lng?: number | null;
    delivery_date?: string | null;
    delivery_address?: string | null;
    delivery_city?: string | null;
    delivery_state?: string | null;
    delivery_zip?: string | null;
    delivery_lat?: number | null;
    delivery_lng?: number | null;
    line_haul_miles?: number | null;
    line_haul_rate_cents?: number | null;
    line_haul_amount_cents?: number | null;
    accessorials?: Array<{
      item_name: string;
      description?: string | null;
      amount_cents: number;
    }>;
    factoring: SettlementCreatorFactorOption;
    date_sent_to_factoring?: string | null;
    loaded_miles?: number | null;
    empty_miles?: number | null;
    empty_rate_cents?: number | null;
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
    /** ROUND 363-CC2-D — picked at creation; the account wins over the item's default, load_id over load_number. */
    item_id?: string | null;
    account_id?: string | null;
    load_id?: string | null;
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
    /** ROUND 363-CC2-D — picked at creation; the account wins over the item's default, load_id over load_number. */
    item_id?: string | null;
    account_id?: string | null;
    load_id?: string | null;
  }>;
  deductions: Array<{ description: string; amount_cents: number; load_number?: string | null }>;
  reimbursements: Array<{ description: string; amount_cents: number; load_number?: string | null }>;
  additional_pay?: Array<{
    description: string;
    amount_cents: number;
    load_number?: string | null;
    pay_kind?: "detention" | "layover" | "bonus" | "stop_pay" | "other";
  }>;
  escrow: Array<{ description: string; amount_cents: number; load_number?: string | null }>;
  advances: Array<{
    description?: string | null;
    amount_cents: number;
    load_number?: string | null;
    linked_driver_bill_id?: string | null;
  }>;
  /** AlwaysTrack admin fee → 7200 income via createSettlementDeduction(other). */
  admin_fee_cents?: number | null;
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

/** ROUND 326 item 18 — the posting engine's figures (the close engine Post writes with). */
export type SettlementCreatorCloseTotals = {
  gross_cents: number;
  additions_cents: number;
  reimbursements_cents: number;
  detention_pay_cents: number;
  deductions_cents: number;
  escrow_cents: number;
  advances_cents: number;
  chargebacks_cents: number;
  net_cents: number;
  je_preview: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }>;
};

export type SettlementCreatorPreview = {
  close_totals?: SettlementCreatorCloseTotals | null;
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
    { method: "POST", body: draft },
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
    body: draft,
  });
}

/** Pure peek — next AlwaysTrack settlement document number (digits). Never writes. */
export function peekNextSettlementNumber(operatingCompanyId: string) {
  return apiRequest<{ next_number: string }>(
    `/api/v1/driver-finance/settlement-creator/next-settlement-peek?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
