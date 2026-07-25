// STMT-2 — TRANSP opening-balance SOURCE DATA: QuickBooks Online Balance Sheet as of 2024-12-31
// (IH 35 Transportation LLC), pulled 2026-07-06 (docs/OPENING-BALANCES-TRANSP-2024-12-31.md).
//
// Values are QBO's own signed-actual figures (per the CPA-locked opening-balance decision: "opening = QBO
// BS 12/31/2024 signed-actual, NOT natural-side" — skill `ih35-accounting-decisions` §2 /
// docs/lockdown/00_LOCKED_DECISIONS.md). "Signed-actual" means each leaf account's reported sign is taken
// AS-IS (an asset can be negative/overdrawn, a liability can be negative/debit-balance) — never forced
// into a "assets are always debits" natural-side assumption. See `signedCentsToDebitCredit` in
// opening-balance-import.service.ts for the exact conversion this implies.
//
// QBO BALANCES ARE PROVISIONAL (embezzlement reclass in-flux — memory `qbo-balance-in-flux-embezzlement`;
// the internal accountant, Martin, is still finalizing the 2024 close — memory
// `opening-balance-and-recon-decisions-2026-07-02`). This file is re-runnable/idempotent so a later refresh
// of these figures is a simple data edit + re-generate, never a manual re-derivation.
//
// Every subtotal below has been hand-verified against docs/OPENING-BALANCES-TRANSP-2024-12-31.md — see
// scripts/verify-opening-balance-source-ties-to-doc.mjs, which re-proves the same arithmetic as a CI guard
// so this data can never silently drift from the doc without the build going red.

export type OpeningBalanceCategory = "cash_bank" | "accounts_receivable" | "other_current_assets" | "accounts_payable" | "credit_cards" | "other_current_liabilities" | "long_term_liabilities" | "equity";

export type OpeningBalanceSourceLine = {
  /** The QBO account name/label as it appears on the 12/31/2024 Balance Sheet. */
  qbo_account_label: string;
  /** Signed-actual amount in CENTS (QBO's own sign — see file header). */
  amount_cents: number;
  account_type: "Asset" | "Liability" | "Equity";
  category: OpeningBalanceCategory;
};

export const TRANSP_OPENING_BALANCE_AS_OF = "2024-12-31";
export const TRANSP_OPENING_JE_ENTRY_DATE = "2025-01-01"; // TMS parallel books open 2025-01-01 (locked).

export const TRANSP_OPENING_BALANCE_SOURCE_LINES: readonly OpeningBalanceSourceLine[] = [
  // ── Assets — Cash/Bank (total $911,923.22) ──────────────────────────────────────────────────────
  { qbo_account_label: "BOA-CHECKING-1135", amount_cents: 10_000, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "BOA-SAVINGS-1148", amount_cents: -7_649_908, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "Comdata-Prepay", amount_cents: 71_600, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "Factoring Reserves Love's", amount_cents: 1_299_499, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "Faro Factoring Reserves", amount_cents: -12_984_674, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "IBC-5231", amount_cents: 34_761_328, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "IBC-AHORROS-6089", amount_cents: -43_869_143, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "Petty Cash", amount_cents: 100_000, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "PNC-2786", amount_cents: -4_286, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "PNC-2954", amount_cents: 162_926_465, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "PNC-2962", amount_cents: -48_102, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "RTS-Factoring Reserves", amount_cents: -44_925_901, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "VANTAGE-6107", amount_cents: -81_531, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "VANTAGE-6224", amount_cents: 1_586_975, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "Cash on hand", amount_cents: 0, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "Transp-Trucking Loan", amount_cents: 0, account_type: "Asset", category: "cash_bank" },
  { qbo_account_label: "VANTAGE-6071", amount_cents: 0, account_type: "Asset", category: "cash_bank" },

  // ── Assets — Accounts Receivable (total -$538,278.66) ───────────────────────────────────────────
  // "Unauthorized Expenses" lines are receivables pursued in bankruptcy court — NEVER written off /
  // reclassed to expense (locked decision, memory `ih35-accounting-decisions` §6).
  { qbo_account_label: "A/R (A/R)", amount_cents: -96_198_352, account_type: "Asset", category: "accounts_receivable" },
  { qbo_account_label: "Unauthorized Expenses Anarely Alcazar", amount_cents: 7_325_348, account_type: "Asset", category: "accounts_receivable" },
  { qbo_account_label: "Unauthorized Expenses Ignacio Muñoz", amount_cents: 35_045_138, account_type: "Asset", category: "accounts_receivable" },

  // ── Assets — Other Current Assets (total -$8,668,828.51) ────────────────────────────────────────
  { qbo_account_label: "eCapital", amount_cents: 49_720, account_type: "Asset", category: "other_current_assets" },
  { qbo_account_label: "Loans to Others/IH 35 Trucking", amount_cents: -13_524_227, account_type: "Asset", category: "other_current_assets" },
  { qbo_account_label: "LOVES SOLUTIONS LLC", amount_cents: -579_344, account_type: "Asset", category: "other_current_assets" },
  { qbo_account_label: "RTS FINANCIAL-VIRTUAL ACCT", amount_cents: -852_835_732, account_type: "Asset", category: "other_current_assets" },
  { qbo_account_label: "Uncategorized Asset", amount_cents: 6_732, account_type: "Asset", category: "other_current_assets" },

  // ── Liabilities — Accounts Payable (-$290,120.05) ───────────────────────────────────────────────
  { qbo_account_label: "A/P (A/P)", amount_cents: -29_012_005, account_type: "Liability", category: "accounts_payable" },

  // ── Liabilities — Credit Cards ($5,000.00) ──────────────────────────────────────────────────────
  { qbo_account_label: "Amex Card", amount_cents: 500_000, account_type: "Liability", category: "credit_cards" },

  // ── Liabilities — Other Current Liabilities (-$41,261.66) ───────────────────────────────────────
  { qbo_account_label: "Loan-Scentsx", amount_cents: 10_363_576, account_type: "Liability", category: "other_current_liabilities" },
  { qbo_account_label: "Owner Loan-4019", amount_cents: 4_807_876, account_type: "Liability", category: "other_current_liabilities" },
  { qbo_account_label: "Owner Loan-9745", amount_cents: -19_292_598, account_type: "Liability", category: "other_current_liabilities" },
  { qbo_account_label: "RTS-Loans", amount_cents: 0, account_type: "Liability", category: "other_current_liabilities" },
  { qbo_account_label: "RTS-NEWCO LOAN", amount_cents: 0, account_type: "Liability", category: "other_current_liabilities" },
  { qbo_account_label: "Sent Payments to trucking", amount_cents: -5_020, account_type: "Liability", category: "other_current_liabilities" },

  // ── Liabilities — Long-term Liabilities (-$6,576.09) ────────────────────────────────────────────
  { qbo_account_label: "Independence Bank-Credit Line", amount_cents: -657_609, account_type: "Liability", category: "long_term_liabilities" },

  // ── Equity (-$7,962,226.15) ──────────────────────────────────────────────────────────────────────
  // Opening Balance Equity is already $0 in the QBO source — the doc's own headline confirms it, so
  // there is no OBE-plug needed at import; each equity leaf posts at its own reported figure exactly
  // like every asset/liability leaf (the JE balances by construction — see the service header comment).
  { qbo_account_label: "Opening Balance Equity", amount_cents: 0, account_type: "Equity", category: "equity" },
  { qbo_account_label: "Retained Earnings", amount_cents: -838_493_937, account_type: "Equity", category: "equity" },
  { qbo_account_label: "Net Income", amount_cents: 42_271_322, account_type: "Equity", category: "equity" },
] as const;

// Headline totals from the doc — the guard/service re-derive these from the lines above and assert an
// exact match to the penny (regression lock against a future silently-wrong data edit).
export const TRANSP_OPENING_BALANCE_HEADLINE_CENTS = {
  total_assets_cents: -829_518_395,
  total_liabilities_cents: -33_295_780,
  total_equity_cents: -796_222_615,
} as const;
