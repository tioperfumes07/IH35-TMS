// U27 / ROUND 433 — the NATURAL SIGN of a ledger amount comes from the ACCOUNT TYPE, never from the raw posting.
//
// The ledger stores balances debit − credit (accounting.fn_account_balances_as_of, closing_balance_cents). A liability
// that owes $X therefore reads −X raw. Anything that compares a ledger balance with a real-world number (a bank or card
// feed, a subledger) or shows it to a person must first present it in the account's natural direction: assets and
// expenses positive in debit, liabilities / equity / income positive in credit. Only a genuinely abnormal balance stays
// negative. The debit-normal set is the one fn_account_balances_as_of uses for normal_balance, and the frontend twin
// (apps/frontend/src/lib/naturalBalance.ts) must hold the same set — verify-no-surface-prints-a-raw-ledger-sign checks both.

export type NormalSide = "debit" | "credit";

export const DEBIT_NORMAL_ACCOUNT_TYPES: ReadonlySet<string> = new Set(["Asset", "CostOfGoodsSold", "Expense", "OtherExpense"]);

/** The account's normal side, or null for a statistical / untyped account (no money sign). */
export function normalSideOfAccountType(accountType: string | null | undefined): NormalSide | null {
  const t = String(accountType ?? "").trim();
  if (!t || t === "Statistical") return null;
  return DEBIT_NORMAL_ACCOUNT_TYPES.has(t) ? "debit" : "credit";
}

/** +1 for a debit-normal (or unknown) side, −1 for a credit-normal side: multiply a raw debit − credit amount by it. */
export function naturalSignFactor(normal: NormalSide | string | null | undefined): 1 | -1 {
  return String(normal ?? "").toLowerCase() === "credit" ? -1 : 1;
}

/** (account_type, debit_cents, credit_cents) -> the amount in the account's natural sign; null when nothing is known. */
export function naturalSignCents(
  accountType: string | null | undefined,
  debitCents: number | null | undefined,
  creditCents: number | null | undefined
): number | null {
  if (debitCents == null && creditCents == null) return null;
  const raw = Number(debitCents ?? 0) - Number(creditCents ?? 0);
  return raw * naturalSignFactor(normalSideOfAccountType(accountType));
}
