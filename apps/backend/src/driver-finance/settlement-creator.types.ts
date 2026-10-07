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
  /**
   * SETL-F438 — bookLoad() REFUSES any non-draft load carrying neither of these
   * (error customer_po_or_wo_number_required, ROUND 285.3.6 owner order 2026-09-30:
   * "W/O or PO REQUIRED at load creation. Not optional, not a warning."). The Creator
   * books with save_mode 'book_dispatch' and sent neither, so every seed attempt died.
   * The Faro matcher reads both (factoring-advances.routes.ts, i8-dispatched-load-complete).
   */
  customer_po_number?: string | null;
  customer_wo_number?: string | null;
  pickup_date?: string | null; // YYYY-MM-DD
  /** Google / Places one-line address (same field Book Load writes). */
  pickup_address?: string | null;
  pickup_city?: string | null;
  /** SETL-F438 — the REAL state. Never defaulted: the seeder used to hardcode 'TX' on both stops. */
  pickup_state?: string | null;
  pickup_zip?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  delivery_date?: string | null; // blank = not delivered yet (dispatched / in transit)
  delivery_address?: string | null;
  delivery_city?: string | null;
  /** SETL-F438 — the REAL state. A Laredo carrier does not deliver only inside Texas. */
  delivery_state?: string | null;
  delivery_zip?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  line_haul_miles?: number | null;
  line_haul_rate_cents?: number | null;
  line_haul_amount_cents?: number | null;
  accessorials?: SettlementCreatorAccessorialLine[];
  factoring: SettlementCreatorFactorOption;
  date_sent_to_factoring?: string | null;
  loaded_miles?: number | null;
  empty_miles?: number | null;
  /** Driver empty-miles rate ($/mi). When null, empty miles contribute $0 (operator types extras). */
  empty_rate_cents?: number | null;
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
  /** ROUND 363-CC2-D — picked at creation. The account wins over the item's default; load_id wins over load_number. */
  item_id?: string | null;
  account_id?: string | null;
  load_id?: string | null;
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
  /** ROUND 363-CC2-D — picked at creation. The account wins over the item's default; load_id wins over load_number. */
  item_id?: string | null;
  account_id?: string | null;
  load_id?: string | null;
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

export type SettlementCreatorAdditionalPayLine = {
  description: string;
  amount_cents: number;
  load_number?: string | null;
  pay_kind?: "detention" | "layover" | "bonus" | "stop_pay" | "other";
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
  /**
   * ROUND 190/191 (2026-09-28) — explicit acknowledgment that this settlement's signed PDF
   * genuinely carries no card-fuel purchases. Required (with fuel_purchases empty) whenever
   * period_end extends past the entity's current latest fuel.fuel_transactions row — see the
   * preview blocker in settlement-creator.service.ts. Never defaults to true; an omitted flag on
   * a period-extending settlement with no fuel lines blocks the post.
   */
  confirmed_zero_fuel_purchases?: boolean;
  expenses: SettlementCreatorExpenseLine[];
  deductions: SettlementCreatorMoneyLine[];
  reimbursements: SettlementCreatorMoneyLine[];
  /** Driver settlement additional pay (detention/layover/bonus) — settlement_lines, not reimbursements. */
  additional_pay?: SettlementCreatorAdditionalPayLine[];
  escrow: SettlementCreatorMoneyLine[];
  advances: SettlementCreatorAdvanceLine[];
  /**
   * AlwaysTrack admin fee (typically $10) → createSettlementDeduction sourceType=other →
   * other_recovery → 7200 Driver Admin Fee & Chargeback Income (existing close engine).
   */
  admin_fee_cents?: number | null;
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

/** ROUND 326 item 18 — the close engine's figures for this settlement (the ONE calculator Post writes with). */
export type SettlementCreatorCloseTotals = {
  gross_cents: number;
  /** reimbursements + detention pay */
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
  /** Present when the preview ran through the posting engine (previewSettlementCreatorThroughClose). */
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

export type SettlementCreatorPostResult = {
  /** FEED GATE result (owner law 2026-10-01): the settlement committed only because every check was green. */
  feed_gate?: { intake_id: string; status: string; checks_total: number; checks_failed: number };
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
  close_totals?: SettlementCreatorCloseTotals | null;
};
