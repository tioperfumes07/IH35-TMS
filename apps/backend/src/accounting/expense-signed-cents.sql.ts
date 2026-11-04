/**
 * Row 128 / ENG-49 (11-03, ACCT-F11070) — THE one rule for an expense document's cost on a load / settlement read model.
 *
 * ROOT CAUSE (measured prod br-fancy-credit-akjnd07a, settlement 5787 → P-0018, loads 13549 + 13555): the "non-diesel expenses"
 * read $235.01 against the signed settlement's $140.20. $235.01 − $140.20 = $94.81 = 13549-4 ($94.79) + 13549-5 ($0.02), two
 * Dreamline statement CARD-CREDIT documents (is_credit = true; their JE is Cr 5000 / Dr 2510 — the GL is right). Every per-load
 * cost read model summed accounting.expenses.total_amount_cents with no sign, so a card credit was added as a COST. And it had no
 * source fuel row of its own, so it fell into the "non-fuel" bucket even though it adjusts the DIESEL receipt 13549 (its
 * parent_expense_id). Not an expense on the wrong load, not a duplicate. Live: 241 card-credit documents, $10,744.65, on 91 loads.
 *
 * THE RULE (one place, every read model):
 *   - a credit document (is_credit) is a NEGATIVE cost;
 *   - a statement adjustment (card credit / card difference) belongs to the fuel row of the receipt it adjusts (parent_expense_id),
 *     so it lands in the same fuel / non-fuel bucket as that receipt.
 */

/** Signed cost of an expense header: −total for a credit document, +total otherwise. */
export function signedExpenseCentsSql(e: string): string {
  return `(CASE WHEN ${e}.is_credit IS TRUE THEN -${e}.total_amount_cents ELSE ${e}.total_amount_cents END)`;
}

/** Signed multiplier for an expense LINE amount (the line carries the header's sign). */
export function expenseSignSql(e: string): string {
  return `(CASE WHEN ${e}.is_credit IS TRUE THEN -1 ELSE 1 END)`;
}

/**
 * The fuel row a document belongs to: its own source fuel row; else, for a statement card credit / card difference, the source fuel
 * row of the receipt it adjusts (parent_expense_id, same company). NULL = a non-fuel document.
 */
export function expenseEffectiveFuelRowIdSql(e: string): string {
  return `COALESCE(${e}.source_fuel_transaction_id, (SELECT pe.source_fuel_transaction_id FROM accounting.expenses pe
            WHERE pe.id = ${e}.parent_expense_id AND pe.operating_company_id = ${e}.operating_company_id))`;
}

/** Pure mirror of the rule (tests / guards): signed cents and the fuel row the document belongs to. */
export function signedExpenseCents(doc: { total_amount_cents: number; is_credit?: boolean | null }): number {
  return doc.is_credit === true ? -Number(doc.total_amount_cents) : Number(doc.total_amount_cents);
}
export function effectiveFuelRowId(
  doc: { source_fuel_transaction_id?: string | null; parent_expense_id?: string | null },
  parentSourceFuelRow: (parentId: string) => string | null,
): string | null {
  if (doc.source_fuel_transaction_id) return doc.source_fuel_transaction_id;
  return doc.parent_expense_id ? parentSourceFuelRow(doc.parent_expense_id) : null;
}
