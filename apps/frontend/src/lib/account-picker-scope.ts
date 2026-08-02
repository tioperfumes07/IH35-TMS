/**
 * ACCOUNT-PICKER SCOPE — the single definition of which chart-of-accounts rows may appear in which
 * kind of picker.
 *
 * WHY THIS FILE EXISTS (ACCT-F92, live finding 2026-08-02). The Record-Expense form's "Payment
 * account *" field is labelled "Select bank/cash account…" but filtered only on
 * `account_type === "Asset"`. On prod that type contains far more than cash: Accumulated Depreciation,
 * Trucks & Tractors, Trailers, Prepaid Expenses, Inventory Asset, Accounts Receivable, Unbilled
 * Revenue, Factoring Reserves, Driver Cash Advances and the three Inter-company accounts are ALL
 * `Asset`. A user could therefore record an expense as paid FROM Accumulated Depreciation or from
 * Unbilled Revenue — a misposting a CPA or auditor flags immediately, and one the ledger will happily
 * accept because the entry still balances.
 *
 * THE STANDARD. QuickBooks scopes its Expense "Payment account" dropdown to accounts that represent
 * actual movement of funds — Bank, Credit Card and cash-like accounts — and excludes fixed assets,
 * receivables and depreciation contras by design. NetSuite does the same through account-type
 * restrictions on the payment field. We mirror that intent. Note the public QBO documentation is not
 * perfectly explicit about whether every "Other Current Asset" is offered; where the sources are
 * ambiguous this module takes the CONSERVATIVE reading (cash-like detail types + credit cards) rather
 * than guessing wider, because the cost of a wrong inclusion here is a misposted payment.
 *
 * TWO LIVE DATA TRAPS THIS HANDLES — both verified on prod, neither assumed:
 *
 *  1. THE SUBTYPE VOCABULARY IS NOT CONSISTENT. The same concept exists under several spellings
 *     because rows arrived from different sources (QBO mirror vs TMS-native seeds):
 *       "UndepositedFunds"  and  "Undeposited Funds"
 *       "OtherCurrentAssets" and "Other Current Assets" and "OtherCurrentAsset"
 *       "EmployeeCashAdvances" and "Employee Cash Advances"
 *       "AccountsReceivable" and "Accounts Receivable (A/R)"
 *     A hardcoded allowlist of exact strings would silently miss accounts depending on which spelling
 *     a row happens to carry. Everything here is compared through `normalizeSubtype`.
 *
 *  2. SOME NON-SPENDABLE ACCOUNTS ARE CLASSIFIED AS CASH. On prod, subtype `Savings` includes "Faro
 *     Escrow Account", "Faro Factoring Reserves" and "RTS-Factoring Reserves"; `CashOnHand` includes
 *     "Factoring Reserves Love's Solution". Those are not spendable operating cash. They are
 *     deliberately NOT excluded here: filtering them out would require matching on account NAME, which
 *     is exactly the guessed mapping this codebase forbids, and QuickBooks would offer them too given
 *     the same classification. This is a chart-of-accounts CLASSIFICATION question for the owner, not
 *     something a picker should silently override. Recorded rather than papered over.
 */

export type PickerAccount = {
  account_type?: string | null;
  account_subtype?: string | null;
  is_postable?: boolean | null;
  deactivated_at?: string | null;
};

/** Collapse spelling/spacing/case variance so "Undeposited Funds" === "UndepositedFunds". */
export function normalizeSubtype(value: string | null | undefined): string {
  return String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Cash-like DETAIL types. These are QBO's Bank-type detail types, which this repo's mirror flattens
 * into `account_subtype` while collapsing the type itself to `Asset`. Stored normalized.
 */
export const CASH_LIKE_SUBTYPES: ReadonlySet<string> = new Set(
  ["Checking", "Savings", "CashOnHand", "MoneyMarket", "UndepositedFunds", "Bank", "TrustAccounts"].map(
    normalizeSubtype
  )
);

/** Account TYPES that are themselves a means of payment regardless of detail type. */
export const PAYMENT_ACCOUNT_TYPES: ReadonlySet<string> = new Set(["Bank", "CreditCard"]);

/** Expense-side types for a cost/category line. Income, assets and liabilities are never valid here. */
export const EXPENSE_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  "Expense",
  "CostOfGoodsSold",
  "OtherExpense",
]);

function isSelectable(a: PickerAccount): boolean {
  return Boolean(a.is_postable) && !a.deactivated_at;
}

/**
 * May this account be the account an expense/bill was paid FROM?
 * Bank + Credit Card by type, or an Asset carrying a cash-like detail type.
 */
export function isPaymentAccount(a: PickerAccount): boolean {
  if (!isSelectable(a)) return false;
  const type = String(a.account_type ?? "");
  if (PAYMENT_ACCOUNT_TYPES.has(type)) return true;
  return type === "Asset" && CASH_LIKE_SUBTYPES.has(normalizeSubtype(a.account_subtype));
}

/**
 * May this account be a cost/category line on an expense, bill or work order?
 * Deliberately excludes Income (4xxx), assets and inter-company — booking a repair part to
 * "Detention Income" or to an inter-company lease account is the misposting this prevents.
 */
export function isExpenseAccount(a: PickerAccount): boolean {
  if (!isSelectable(a)) return false;
  return EXPENSE_ACCOUNT_TYPES.has(String(a.account_type ?? ""));
}
