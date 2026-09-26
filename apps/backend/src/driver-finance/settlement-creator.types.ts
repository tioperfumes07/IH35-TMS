/**
 * ROUND 180 / R-186 — Settlement Creator payload types.
 * Company + Driver settlement typed from AlwaysTrack PDFs. Existing engines only.
 */

export type SettlementCreatorFactorOption = "faro_usmca" | "faro_transportation" | "direct";

export type SettlementCreatorFuelCard = "dreamline" | "relay";

export type SettlementCreatorAccessorialLine = {
  item_name: string;
  description?: string | null;
  amount_cents: number;
};

export type SettlementCreatorLoadBlock = {
  load_number: string;
  customer_name?: string | null;
  customer_id?: string | null;
  pickup_date?: string | null; // YYYY-MM-DD
  pickup_city?: string | null;
  delivery_date?: string | null; // blank = not delivered yet (dispatched / in transit)
  delivery_city?: string | null;
  line_haul_miles?: number | null;
  line_haul_rate_cents?: number | null;
  line_haul_amount_cents?: number | null;
  accessorials?: SettlementCreatorAccessorialLine[];
  factoring: SettlementCreatorFactorOption;
  date_sent_to_factoring?: string | null;
  loaded_miles?: number | null;
  empty_miles?: number | null;
  picks?: number | null;
  drops?: number | null;
  /** R-186.1 — NB/TR/SB/LOCAL. SB joins the outbound tour. */
  trip_type?: "NB" | "TR" | "SB" | "LOCAL" | null;
  /** R-186.1 — SB return joins this outbound load's tour (e.g. 13609 → 13614). */
  join_outbound_load_number?: string | null;
  /**
   * R-186.1 — not-yet-delivered load is first-class: status dispatched (or in_transit),
   * NO invoice, pre-invoice exposure in Cash Flow, joins open pre-settlement.
   */
  not_yet_delivered?: boolean | null;
};

export type SettlementCreatorFuelLine = {
  date: string; // YYYY-MM-DD — PDF date stamped on fuel.fuel_transactions
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
};

export type SettlementCreatorExpenseLine = {
  date: string;
  item_name: string;
  description?: string | null;
  amount_cents: number;
  load_number?: string | null;
  /** PDF flag Comp. Exp. (Y) — credit the card rail, never A/P. */
  is_company_expense: boolean;
  /** PDF flag Reimb. (Drv) — paid back on driver settlement; never Cr 1000 cash. */
  is_reimbursable: boolean;
  card?: SettlementCreatorFuelCard | null;
};

export type SettlementCreatorMoneyLine = {
  description: string;
  amount_cents: number;
  load_number?: string | null;
};

export type SettlementCreatorAdvanceLine = {
  description?: string | null;
  amount_cents: number;
  load_number?: string | null;
  /** When set, advance links as a bill payment against that load's driver bill. */
  linked_driver_bill_id?: string | null;
};

export type SettlementCreatorDraft = {
  operating_company_id: string;
  /**
   * R-186.1 + owner 2026-09-26 — Creator creates NEW only.
   * P-NNNN = our pre-settlement display_id (must not already exist).
   * Bare digits = AlwaysTrack → source_document_ref (must not already exist).
   * Empty = mint next P-series on post (never attach to driver's open).
   */
  settlement_no: string;
  driver_id: string;
  unit_id?: string | null;
  trailer_equipment_number?: string | null;
  trailer_id?: string | null;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  loads: SettlementCreatorLoadBlock[];
  customer_charges_cents?: number | null;
  fuel_purchases: SettlementCreatorFuelLine[];
  expenses: SettlementCreatorExpenseLine[];
  deductions: SettlementCreatorMoneyLine[];
  reimbursements: SettlementCreatorMoneyLine[];
  escrow: SettlementCreatorMoneyLine[];
  advances: SettlementCreatorAdvanceLine[];
  /** Driver PDF control total — Post disabled until draft net equals this (0 OK for dispatched-only seed). */
  pdf_driver_net_cents: number;
  /** Company PDF EXPENSES control total. */
  pdf_company_expenses_cents: number;
  /**
   * R-186.1 — when true, missing loads are booked as dispatched via bookLoad (app path) with
   * automatic Owner medical/HOS/CDL override attestation. No invoice is minted.
   */
  seed_dispatched_loads?: boolean;
  /**
   * ROUND 180 §14 — when true and Settlement No. already exists (non-void), void the prior
   * Creator settlement + companion docs then repost. FE confirms; never silent.
   */
  edit_void_repost?: boolean;
  /** Optional uploaded AT PDF (docs.files id). */
  source_pdf_file_id?: string | null;
};

export type SettlementCreatorJeLine = {
  load_number: string | null;
  account_number: string | null;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
  memo: string;
  section: "fuel" | "expense" | "mileage" | "accessorial" | "advance" | "escrow" | "deduction" | "reimbursement" | "invoice" | "factoring" | "admin_fee" | "other";
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

export type SettlementCreatorPostResult = {
  settlement_id: string;
  source_document_ref: string;
  display_id: string;
  load_ids: string[];
  expense_ids: string[];
  fuel_transaction_ids: string[];
  advance_ids: string[];
  journal_entry_ids: string[];
  /** Customer invoices minted+sent for delivered loads (empty when all not_yet_delivered). */
  invoice_ids: string[];
  /** Faro submitted advance ids (filled by route after commit — never inside the Creator tx). */
  factoring_advance_ids?: string[];
  preview: SettlementCreatorPreview;
};
