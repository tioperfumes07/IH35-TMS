/**
 * LEAD 443.105 #2 — stamp the load_exemption_reason on an existing expense line that has neither a load nor a reason.
 *
 * Metadata only: the line's amount, account, item and the expense's journal entry are untouched (a posted line's money and
 * account cannot move here anyway — refuse_posted_expense_line_money_edit / ..._account_moves_with_its_entry). The line
 * must still have no load and no reason (a line already linked or explained is refused by name, never overwritten), the
 * reason must meet the DB's 20-character floor, and every stamp writes one audit row naming the line, the expense and the
 * reason. Used by the owner-authorized runner for the 5 historical USMCA lines (EXP-2026-00001..00005); every live writer
 * now records the reason when it writes the line.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = { query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }> };

export class ExpenseLineExemptionStampError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ExpenseLineExemptionStampError";
  }
}

export const EXEMPTION_REASON_MIN_CHARS = 20;

export type ExpenseLineExemptionStamp = {
  operatingCompanyId: string;
  expenseLineId: string;
  reason: string;
  actorUserId: string;
  /** Owner authorization the stamp runs under (named in the audit row). */
  authorization: string;
};

export async function stampExpenseLineLoadExemption(
  client: Queryable,
  input: ExpenseLineExemptionStamp
): Promise<{ expense_line_id: string; expense_number: string | null; reason: string }> {
  const reason = input.reason.trim();
  if (reason.length < EXEMPTION_REASON_MIN_CHARS) {
    throw new ExpenseLineExemptionStampError("REASON_TOO_SHORT", `load_exemption_reason must be at least ${EXEMPTION_REASON_MIN_CHARS} characters`);
  }
  const line = (
    await client.query<{ id: string; expense_id: string; load_id: string | null; load_exemption_reason: string | null; expense_number: string | null; voided: boolean }>(
      `SELECT l.id::text, l.expense_id::text, l.load_id::text, l.load_exemption_reason, e.expense_number, (e.voided_at IS NOT NULL) AS voided
         FROM accounting.expense_lines l JOIN accounting.expenses e ON e.id = l.expense_id
        WHERE l.id = $1::uuid AND e.operating_company_id = $2::uuid
        FOR UPDATE OF l`,
      [input.expenseLineId, input.operatingCompanyId]
    )
  ).rows[0];
  if (!line) throw new ExpenseLineExemptionStampError("LINE_NOT_FOUND", `expense line ${input.expenseLineId} not found in this company`);
  if (line.voided) throw new ExpenseLineExemptionStampError("EXPENSE_VOIDED", `expense ${line.expense_number ?? line.expense_id} is voided`);
  if (line.load_id) throw new ExpenseLineExemptionStampError("LINE_HAS_LOAD", `expense ${line.expense_number ?? line.expense_id} line is linked to a load — nothing to exempt`);
  if (line.load_exemption_reason) {
    throw new ExpenseLineExemptionStampError("LINE_HAS_REASON", `expense ${line.expense_number ?? line.expense_id} line already carries a reason — never overwritten`);
  }

  const updated = await client.query(
    `UPDATE accounting.expense_lines SET load_exemption_reason = $3
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND load_id IS NULL AND load_exemption_reason IS NULL`,
    [input.expenseLineId, input.operatingCompanyId, reason]
  );
  if (updated.rowCount !== 1) throw new ExpenseLineExemptionStampError("STAMP_RACED", "the line changed while it was being stamped");

  await appendCrudAudit(client as never, input.actorUserId, "accounting.expense_line.load_exemption_stamped", {
    operating_company_id: input.operatingCompanyId,
    expense_id: line.expense_id,
    expense_number: line.expense_number,
    expense_line_id: input.expenseLineId,
    load_exemption_reason: reason,
    authorization: input.authorization,
  });
  return { expense_line_id: input.expenseLineId, expense_number: line.expense_number, reason };
}
