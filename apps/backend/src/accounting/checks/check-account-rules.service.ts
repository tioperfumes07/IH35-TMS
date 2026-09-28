// R-154.1 §B — chart-of-accounts rules for the check engine.
//
// Credit side: the check's OWN bank account only (banking.bank_accounts.ledger_account_id).
// Debit side: Category line -> accounting.expense_category_account_map (the same B1 map bills use,
// via the one canonical resolver in expense-category-map/resolver.service.ts -- no second resolver);
// Item line -> catalogs.items.default_expense_account_id. Either way the resolved account must be a
// postable, non-deactivated account of an ALLOWED type -- A/R, Undeposited Funds, and revenue
// (Income/OtherIncome) are refused outright; accessorial income accounts are NEVER a check's debit
// side (spec: "accessorials 4200/4210-4240 are revenue and NEVER on a check").
//
// §A closed law (R-154.1): a driver check whose category is a cash-advance concept is refused here
// as an expense -- cash advances are bill payments, not expenses, full stop.

import { withLuciaBypass } from "../../auth/db.js";
import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
  EXPENSE_CATEGORY_MAP_KIND_VALUES,
  type ExpenseCategoryMapKind,
} from "../expense-category-map/resolver.service.js";

export type CheckAccountErrorCode =
  | "BANK_ACCOUNT_NOT_FOUND"
  | "BANK_ACCOUNT_NOT_DEPOSITORY"
  | "BANK_ACCOUNT_INACTIVE"
  | "BANK_ACCOUNT_UNMAPPED"
  | "CATEGORY_INCOMPLETE"
  | "CATEGORY_KIND_INVALID"
  | "CATEGORY_UNMAPPED"
  | "ITEM_NOT_FOUND"
  | "ITEM_ACCOUNT_UNMAPPED"
  | "LINE_KIND_INVALID"
  | "FORBIDDEN_ACCOUNT_TYPE"
  | "ACCOUNT_NOT_POSTABLE"
  | "ACCOUNT_NOT_FOUND"
  | "DRIVER_ADVANCE_IS_A_BILL_PAYMENT"
  | "CHECK_NUMBER_REQUIRED"
  | "TOTAL_MUST_BE_POSITIVE"
  | "ITEM_QTY_RATE_REQUIRED";

export class CheckAccountError extends Error {
  code: CheckAccountErrorCode;
  constructor(code: CheckAccountErrorCode, message: string) {
    super(message);
    this.name = "CheckAccountError";
    this.code = code;
  }
}

// Spec §B allowed debit types: Expense / CostOfGoodsSold / Other Expense / Fixed Asset / Liability
// (loan/card payoff) / Equity (owner draw). This schema has no separate "FixedAsset" account_type --
// a fixed asset is account_type='Asset' (live-verified: distinct account_type values on
// catalogs.accounts are Asset/CostOfGoodsSold/Equity/Expense/Income/Liability/OtherExpense/
// OtherIncome, no FixedAsset). Income/OtherIncome are never allowed (accessorials are revenue).
const ALLOWED_DEBIT_ACCOUNT_TYPES = new Set(["Expense", "CostOfGoodsSold", "OtherExpense", "Asset", "Liability", "Equity"]);

// system_purpose values that are structurally never a check's debit side even though their
// account_type falls inside the allowed set above (both Asset-typed in this schema).
const FORBIDDEN_DEBIT_SYSTEM_PURPOSES = new Set(["accounts_receivable", "ar_control", "undeposited_funds"]);

export type ResolvedBankAccount = {
  bank_account_id: string;
  ledger_account_id: string;
  display_name: string;
};

export async function resolveCheckBankAccount(
  operating_company_id: string,
  bank_account_id: string
): Promise<ResolvedBankAccount> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const res = await client.query<{
      account_class: string | null;
      is_active: boolean;
      ledger_account_id: string | null;
      display_name: string | null;
      account_name: string;
    }>(
      `SELECT account_class, is_active, ledger_account_id::text AS ledger_account_id, display_name, account_name
         FROM banking.bank_accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [bank_account_id, operating_company_id]
    );
    const row = res.rows[0];
    if (!row) throw new CheckAccountError("BANK_ACCOUNT_NOT_FOUND", "Bank account not found, or deactivated, in this company.");
    if (!row.is_active) throw new CheckAccountError("BANK_ACCOUNT_INACTIVE", "This bank account is not active.");
    // Credit cards and card-class accounts are never a check's bank -- a check is drawn on a
    // depository account only (spec §B).
    if (row.account_class !== "depository") {
      throw new CheckAccountError(
        "BANK_ACCOUNT_NOT_DEPOSITORY",
        `A check must be drawn on a depository/checking account, not a "${row.account_class ?? "unknown"}" account.`
      );
    }
    if (!row.ledger_account_id) {
      throw new CheckAccountError(
        "BANK_ACCOUNT_UNMAPPED",
        "This bank account has no ledger_account_id -- it cannot be credited on a journal entry."
      );
    }
    return {
      bank_account_id,
      ledger_account_id: row.ledger_account_id,
      display_name: row.display_name?.trim() || row.account_name,
    };
  });
}

async function assertAllowedDebitAccount(operating_company_id: string, account_id: string): Promise<void> {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const res = await client.query<{ account_type: string; is_postable: boolean; system_purpose: string | null }>(
      `SELECT account_type, is_postable, system_purpose
         FROM catalogs.accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
        LIMIT 1`,
      [account_id, operating_company_id]
    );
    const row = res.rows[0];
    if (!row) throw new CheckAccountError("ACCOUNT_NOT_FOUND", "Resolved debit account does not exist, or is deactivated, in this company.");
    if (!row.is_postable) throw new CheckAccountError("ACCOUNT_NOT_POSTABLE", "Resolved debit account is not postable.");
    if (row.system_purpose && FORBIDDEN_DEBIT_SYSTEM_PURPOSES.has(row.system_purpose)) {
      throw new CheckAccountError(
        "FORBIDDEN_ACCOUNT_TYPE",
        `Account is system-purpose "${row.system_purpose}" -- A/R and Undeposited Funds can never be a check's debit side.`
      );
    }
    if (!ALLOWED_DEBIT_ACCOUNT_TYPES.has(row.account_type)) {
      throw new CheckAccountError(
        "FORBIDDEN_ACCOUNT_TYPE",
        `Account type "${row.account_type}" is not allowed on a check line (allowed: Expense, CostOfGoodsSold, ` +
          `OtherExpense, Asset [capitalize threshold applies], Liability, Equity).`
      );
    }
  });
}

export type CheckCategoryLine = {
  line_kind: "category";
  category_kind: string | null;
  category_code: string | null;
};
export type CheckItemLine = { line_kind: "item"; item_id: string };
export type CheckDebitLineInput = CheckCategoryLine | CheckItemLine;

export type ResolvedCheckDebitLine = { account_id: string; method: "expense_category_map" | "item_expense_account" };

let validCategoryKinds: Set<string> | null = null;
function isValidCategoryKind(kind: string): boolean {
  if (!validCategoryKinds) validCategoryKinds = new Set<string>(EXPENSE_CATEGORY_MAP_KIND_VALUES);
  return validCategoryKinds.has(kind);
}

export async function resolveCheckLineDebitAccount(
  operating_company_id: string,
  line: CheckDebitLineInput
): Promise<ResolvedCheckDebitLine> {
  if (line.line_kind === "category") {
    const kind = line.category_kind?.trim() || null;
    const code = line.category_code?.trim() || null;
    if (!kind || !code) {
      throw new CheckAccountError(
        "CATEGORY_INCOMPLETE",
        `Check category line has an incomplete category (kind=${kind ?? "∅"}, code=${code ?? "∅"}) -- both are required.`
      );
    }
    if (!isValidCategoryKind(kind)) {
      throw new CheckAccountError("CATEGORY_KIND_INVALID", `"${kind}" is not a valid expense category kind.`);
    }
    try {
      const mapped = await resolveAccountForCategory(operating_company_id, kind as ExpenseCategoryMapKind, code);
      await assertAllowedDebitAccount(operating_company_id, mapped.account_id);
      return { account_id: mapped.account_id, method: "expense_category_map" };
    } catch (err) {
      if (err instanceof ExpenseCategoryMapResolutionError) {
        throw new CheckAccountError(
          "CATEGORY_UNMAPPED",
          `Category ${kind}/${code} has no active expense_category_account_map entry -- no free-typed or ` +
            `guessed account. Map it first.`
        );
      }
      throw err;
    }
  }

  if (line.line_kind === "item") {
    const itemAccount = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
      const res = await client.query<{ default_expense_account_id: string | null }>(
        `SELECT default_expense_account_id::text AS default_expense_account_id
           FROM catalogs.items
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
          LIMIT 1`,
        [line.item_id, operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!itemAccount) throw new CheckAccountError("ITEM_NOT_FOUND", "Item not found, or deactivated, in this company.");
    if (!itemAccount.default_expense_account_id) {
      throw new CheckAccountError(
        "ITEM_ACCOUNT_UNMAPPED",
        "This item has no default_expense_account_id -- it cannot be used as a check purchase line."
      );
    }
    await assertAllowedDebitAccount(operating_company_id, itemAccount.default_expense_account_id);
    return { account_id: itemAccount.default_expense_account_id, method: "item_expense_account" };
  }

  throw new CheckAccountError("LINE_KIND_INVALID", `line_kind "${(line as { line_kind: string }).line_kind}" is not "category" or "item".`);
}

/**
 * §A closed law: a driver check whose line is the cash-advance concept is refused as an expense --
 * it must be routed to the driver_finance advance/bill-payment path instead (with the check number
 * recorded in banking.check_number_registry under source_kind='driver_settlement_payment'). This
 * function only asserts the refusal; the alternate routing itself is a later PR's wiring, not this
 * validation module's job.
 */
export function assertNotDriverAdvanceCheck(payeeKind: string, categoryKind: string | null | undefined): void {
  if (payeeKind === "driver" && categoryKind === "cash_advance") {
    throw new CheckAccountError(
      "DRIVER_ADVANCE_IS_A_BILL_PAYMENT",
      "A driver cash advance is a bill payment, not an expense -- use the driver advance / bill-payment " +
        "flow instead of a category-line check. (R-154.1 §A closed law.)"
    );
  }
}
