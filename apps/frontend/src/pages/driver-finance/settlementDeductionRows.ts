import type { DeductionRow } from "./components/DeductionsSection";

/** Map settlement_lines → deduction table rows (includes escrow_contribution). */
export function toDeductionRows(lines: Array<Record<string, unknown>>): DeductionRow[] {
  return lines
    .filter((line) => ["deduction", "escrow_contribution"].includes(String(line.line_type)))
    .map((line) => ({
      id: String(line.id),
      description: String(line.description ?? "Deduction"),
      line_date: typeof line.line_date === "string" ? line.line_date : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      deduction_type: typeof line.deduction_type === "string" ? line.deduction_type : null,
      posting_account_number:
        typeof line.posting_account_number === "string" ? line.posting_account_number : null,
      posting_account_name:
        typeof line.posting_account_name === "string" ? line.posting_account_name : null,
      balance_left: Number(line.balance_left ?? line.amount ?? 0),
      this_period_amount: Number(line.amount ?? 0),
      is_held: Boolean(line.deduction_is_held),
      held_by_user: line.deduction_held_by_user_email ? String(line.deduction_held_by_user_email) : null,
      held_by_user_id: line.deduction_held_by_user_id ? String(line.deduction_held_by_user_id) : null,
      pending_ack: Boolean(line.pending_ack),
      source_deduction_id: line.source_deduction_id ? String(line.source_deduction_id) : null,
    }));
}
