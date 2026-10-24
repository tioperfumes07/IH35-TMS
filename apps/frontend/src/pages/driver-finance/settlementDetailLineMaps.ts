import type { DeductionRow } from "./components/DeductionsSection";

export function toDeductionRows(lines: Array<Record<string, unknown>>): DeductionRow[] {
  return lines
    .filter((line) => ["deduction", "escrow_contribution"].includes(String(line.line_type)))
    .map((line) => ({
      id: String(line.id),
      description: String(line.description ?? "Deduction"),
      line_date: typeof line.line_date === "string" ? line.line_date : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      deduction_type: typeof line.deduction_type === "string" ? line.deduction_type : null,
      posting_account_number: typeof line.posting_account_number === "string" ? line.posting_account_number : null,
      posting_account_name: typeof line.posting_account_name === "string" ? line.posting_account_name : null,
      balance_left: Number(line.balance_left ?? line.amount ?? 0),
      this_period_amount: Number(line.amount ?? 0),
      is_held: Boolean(line.deduction_is_held),
      held_by_user: line.deduction_held_by_user_email ? String(line.deduction_held_by_user_email) : null,
      held_by_user_id: line.deduction_held_by_user_id ? String(line.deduction_held_by_user_id) : null,
      pending_ack: Boolean(line.pending_ack),
      source_deduction_id: line.source_deduction_id ? String(line.source_deduction_id) : null,
    }));
}

export function buildSettlementLineViews(
  activeLines: Array<Record<string, unknown>>,
  settlementDisplayId: string | null
) {
  const earnings = activeLines
    .filter((line) => String(line.line_type) === "earnings")
    .map((line) => ({
      id: String(line.id),
      load_id: typeof line.load_id === "string" ? line.load_id : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      line_date: typeof line.line_date === "string" ? line.line_date : null,
      origin_city: typeof line.origin_city === "string" ? line.origin_city : null,
      origin_state: typeof line.origin_state === "string" ? line.origin_state : null,
      dest_city: typeof line.dest_city === "string" ? line.dest_city : null,
      dest_state: typeof line.dest_state === "string" ? line.dest_state : null,
      source_driver_bill_id:
        typeof line.source_driver_bill_id === "string" ? line.source_driver_bill_id : null,
      source_label:
        typeof line.source_driver_bill_number === "string" && line.source_driver_bill_number
          ? line.source_driver_bill_number
          : typeof line.source_table === "string" && line.source_table
            ? line.source_table.replace(/^driver_finance\./, "")
            : null,
      description: String(line.description ?? ""),
      miles: line.miles == null ? undefined : Number(line.miles),
      rate: line.rate_cents == null ? undefined : Number(line.rate_cents) / 100,
      rate_source: typeof line.rate_source === "string" ? line.rate_source : null,
      amount: Number(line.amount ?? 0),
    }));

  const deadhead = activeLines
    .filter((line) => String(line.line_type) === "deadhead_pay")
    .map((line) => ({
      id: String(line.id),
      load_id: typeof line.load_id === "string" ? line.load_id : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      line_date: typeof line.line_date === "string" ? line.line_date : null,
      origin_city: typeof line.origin_city === "string" ? line.origin_city : null,
      origin_state: typeof line.origin_state === "string" ? line.origin_state : null,
      dest_city: typeof line.dest_city === "string" ? line.dest_city : null,
      dest_state: typeof line.dest_state === "string" ? line.dest_state : null,
      source_driver_bill_id:
        typeof line.source_driver_bill_id === "string" ? line.source_driver_bill_id : null,
      source_label:
        typeof line.source_driver_bill_number === "string" && line.source_driver_bill_number
          ? line.source_driver_bill_number
          : typeof line.source_table === "string" && line.source_table
            ? line.source_table.replace(/^driver_finance\./, "")
            : null,
      description: String(line.description ?? ""),
      miles: line.miles == null ? undefined : Number(line.miles),
      rate: line.rate_cents == null ? undefined : Number(line.rate_cents) / 100,
      rate_source: typeof line.rate_source === "string" ? line.rate_source : null,
      amount: Number(line.amount ?? 0),
    }));

  const extra = activeLines
    .filter((line) => String(line.line_type) === "extra_pay")
    .map((line) => ({
      id: String(line.id),
      load_id: typeof line.load_id === "string" ? line.load_id : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      line_date: typeof line.line_date === "string" ? line.line_date : null,
      approval_status: typeof line.approval_status === "string" ? line.approval_status : null,
      code: String(line.code ?? "EXTRA"),
      description: String(line.description ?? ""),
      amount: Number(line.amount ?? 0),
    }));

  const reimbursements = activeLines
    .filter((line) => String(line.line_type) === "reimbursement")
    .map((line) => ({
      id: String(line.id),
      load_id: typeof line.load_id === "string" ? line.load_id : null,
      load_number: typeof line.load_number === "string" ? line.load_number : null,
      line_date: typeof line.line_date === "string" ? line.line_date : null,
      description: String(line.description ?? ""),
      reimbursement_type: typeof line.reimbursement_type === "string" ? line.reimbursement_type : null,
      vendor_name: typeof line.vendor_name === "string" ? line.vendor_name : null,
      vendor_invoice_number:
        typeof line.vendor_invoice_number === "string" ? line.vendor_invoice_number : null,
      receipt_number: typeof line.receipt_number === "string" ? line.receipt_number : null,
      amount: Number(line.amount ?? 0),
    }));

  const deductions = toDeductionRows(activeLines);

  let seqCounter = 0;
  const seqLabel = (): string => {
    seqCounter += 1;
    return settlementDisplayId ? `${settlementDisplayId}-${seqCounter}` : String(seqCounter);
  };
  const extraWithSeq = extra.map((row) => ({ ...row, seq_label: seqLabel() }));
  const reimbursementsWithSeq = reimbursements.map((row) => ({ ...row, seq_label: seqLabel() }));
  const deductionsWithSeq = deductions.map((row) => ({ ...row, seq_label: seqLabel() }));

  return { earnings, deadhead, extraWithSeq, reimbursementsWithSeq, deductionsWithSeq };
}
