// U27 (owner, 2026-10-03) — balances render like QuickBooks: by the account's NATURAL sign.
//
// The ledger stores every balance as debit − credit, so a raw income or liability balance is negative. A screen that
// prints the raw number shows "negative income". Present it natural: income, liabilities and equity positive when they
// hold a credit balance; assets and expenses positive when they hold a debit balance. Only a genuinely abnormal balance
// (a contra account, a liability in debit) renders negative — which is exactly what it should say.
//
// The debit-normal set is the one accounting.fn_account_balances_as_of uses for normal_balance, so the screen and the
// ledger function can never disagree about which side an account lives on. Statistical accounts carry no money sign
// and are shown as stored.

export type NormalBalance = "debit" | "credit";

const DEBIT_NORMAL = new Set(["Asset", "CostOfGoodsSold", "Expense", "OtherExpense"]);

/** The account's normal side, or null for a statistical / untyped account (shown as stored). */
export function normalBalanceOf(accountType: string | null | undefined): NormalBalance | null {
  const t = String(accountType ?? "").trim();
  if (!t || t === "Statistical") return null;
  return DEBIT_NORMAL.has(t) ? "debit" : "credit";
}

/** A raw debit − credit amount, presented in the account's natural sign. */
export function naturalCents(rawDebitMinusCreditCents: number, normal: NormalBalance | null): number {
  return normal === "credit" ? -rawDebitMinusCreditCents : rawDebitMinusCreditCents;
}

/** Same, from the account type. */
export function naturalCentsForType(rawDebitMinusCreditCents: number, accountType: string | null | undefined): number {
  return naturalCents(rawDebitMinusCreditCents, normalBalanceOf(accountType));
}

/**
 * ROUND 433 — (account_type, debit_cents, credit_cents) -> the amount in the account's natural sign.
 * null when neither side is known: a missing amount renders as an em dash, never as 0 (law 368.3).
 */
export function naturalSign(
  accountType: string | null | undefined,
  debitCents: number | null | undefined,
  creditCents: number | null | undefined
): number | null {
  if (debitCents == null && creditCents == null) return null;
  return naturalCentsForType(Number(debitCents ?? 0) - Number(creditCents ?? 0), accountType);
}

/** Display a natural-sign amount: em dash for missing, never 0 and never -$0.00. */
export function formatNaturalCents(cents: number | null | undefined, format: (cents: number) => string): string {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  const c = Number(cents);
  return format(c === 0 ? 0 : c); // collapses -0 so it can never print -$0.00
}
