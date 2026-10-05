/**
 * ACCT-F413 — WHICH SECTION OF THE P&L AN ACCOUNT BELONGS TO. One definition, both renderings.
 *
 * THE DEFECT THIS FIXES
 *   `profit-loss.service.ts` classified each account with three `Set.has` checks and then, as a
 *   ROUND 384 safety net, pushed ANYTHING ELSE WITH ACTIVITY into an `unclassified` section so no
 *   money could fall off the statement in silence. The net was right. What it caught was wrong.
 *
 *   That query has no `account_type` filter at all, so it returns every account that carries a
 *   posting — Assets, Liabilities and Equity included. Those five `Set`s claim Income, OtherIncome,
 *   CostOfGoodsSold, Expense and OtherExpense; the other three types match nothing and land in the
 *   net. ROUND 384's own comment, measured on production 2026-10-03, lists the chart's eight types
 *   as CostOfGoodsSold, Asset, Liability, Income, Expense, OtherExpense, Equity and Statistical, and
 *   then states that "Asset, Liability and Equity belong on the Balance Sheet and are correctly
 *   absent here." Nothing in the code makes them absent. With $415,871.09 of assets and $217,330.49
 *   of liabilities carrying postings, the P&L's `unclassified` block is not an empty safety net —
 *   it is the Balance Sheet, printed under a heading that tells the owner his P&L is incomplete.
 *
 *   A safety net that always fires is the same defect as a guard that cries wolf: it stops being
 *   read, and the day something genuinely unmapped appears, nobody notices it among the noise.
 *
 * THE RULE
 *   Three outcomes, not two. An account type is either claimed by a P&L section, or claimed by the
 *   BALANCE SHEET and therefore deliberately not on this statement, or claimed by NOTHING — and only
 *   that third case is a question for a human. QuickBooks' own account-type taxonomy splits exactly
 *   this way, which is why the balance-sheet types are named here rather than detected.
 *
 * WHY IT LIVES IN ITS OWN FILE
 *   The accrual P&L and the cash-basis P&L are two renderings of one statement. The aging ladder was
 *   written twice and the two copies disagreed about the day a bill ages off (ACCT-F411). This is the
 *   same shape of risk: if each P&L carried its own section table, one could start claiming a type
 *   the other dropped, and the two bases would stop being comparable while both still footed.
 *   Both renderings import this. There is one table.
 */

export type ProfitLossSectionId = "revenue" | "cogs" | "operating_expenses";

/** What a statement does with an account type: show it here, show it on the other statement, or ask. */
export type AccountTypePlacement =
  | { kind: "profit_loss"; section: ProfitLossSectionId; /** true when a credit increases the figure */ creditPositive: boolean }
  | { kind: "balance_sheet" }
  | { kind: "unclaimed" };

/**
 * Every account type the chart is known to carry, and where it goes. Measured on production
 * 2026-10-03: the chart holds eight types. `Statistical` is QuickBooks' non-posting type and
 * currently carries zero postings; it is named anyway, as a P&L-irrelevant type, so that the day
 * something posts to it the statement says "Balance Sheet / not on this report" rather than
 * "unclassified — your P&L may be wrong".
 */
const PLACEMENTS: Record<string, AccountTypePlacement> = {
  // Revenue — a credit increases income.
  Income: { kind: "profit_loss", section: "revenue", creditPositive: true },
  OtherIncome: { kind: "profit_loss", section: "revenue", creditPositive: true },

  // Cost of sales and expense — a debit increases the cost.
  CostOfGoodsSold: { kind: "profit_loss", section: "cogs", creditPositive: false },
  Expense: { kind: "profit_loss", section: "operating_expenses", creditPositive: false },
  OtherExpense: { kind: "profit_loss", section: "operating_expenses", creditPositive: false },

  // Belongs on the Balance Sheet. Absent from the P&L BY NAME, not by falling through.
  Asset: { kind: "balance_sheet" },
  Bank: { kind: "balance_sheet" },
  AccountsReceivable: { kind: "balance_sheet" },
  OtherCurrentAsset: { kind: "balance_sheet" },
  FixedAsset: { kind: "balance_sheet" },
  OtherAsset: { kind: "balance_sheet" },
  Liability: { kind: "balance_sheet" },
  AccountsPayable: { kind: "balance_sheet" },
  CreditCard: { kind: "balance_sheet" },
  OtherCurrentLiability: { kind: "balance_sheet" },
  LongTermLiability: { kind: "balance_sheet" },
  Equity: { kind: "balance_sheet" },

  // Non-posting. Not a P&L line and not a question.
  Statistical: { kind: "balance_sheet" },
};

/**
 * Where this account type goes. An unrecognised type returns `unclaimed` — the genuine ROUND 384
 * case, and now the ONLY thing that reaches the P&L's unclassified block.
 *
 * An empty or missing type is `unclaimed` too, and deliberately so: a posting whose account could
 * not be joined at all is exactly the kind of hole the safety net exists for.
 */
export function placeAccountType(accountType: string | null | undefined): AccountTypePlacement {
  const key = String(accountType ?? "").trim();
  if (key === "") return { kind: "unclaimed" };
  return PLACEMENTS[key] ?? { kind: "unclaimed" };
}

/**
 * The signed P&L amount for one account's debit and credit totals, in that section's own direction:
 * revenue reads credit-positive, cost and expense read debit-positive. An unclaimed type has no
 * agreed direction, so it is reported debit-positive and labelled, never folded into a total.
 */
export function signedSectionAmount(placement: AccountTypePlacement, totalDebits: number, totalCredits: number): number {
  const creditPositive = placement.kind === "profit_loss" ? placement.creditPositive : false;
  return creditPositive ? totalCredits - totalDebits : totalDebits - totalCredits;
}

/** The signed amount of a SINGLE posting, used by the cash-basis rendering, which never groups. */
export function signedPostingAmount(
  placement: AccountTypePlacement,
  debitOrCredit: string,
  amountCents: number
): number {
  const isDebit = String(debitOrCredit).toLowerCase() === "debit";
  return signedSectionAmount(placement, isDebit ? amountCents : 0, isDebit ? 0 : amountCents);
}

/** Named for guards and tests: the types this statement shows. */
export const PROFIT_LOSS_ACCOUNT_TYPES: readonly string[] = Object.entries(PLACEMENTS)
  .filter(([, placement]) => placement.kind === "profit_loss")
  .map(([type]) => type);

/** Named for guards and tests: the types this statement deliberately omits. */
export const BALANCE_SHEET_ACCOUNT_TYPES: readonly string[] = Object.entries(PLACEMENTS)
  .filter(([, placement]) => placement.kind === "balance_sheet")
  .map(([type]) => type);
