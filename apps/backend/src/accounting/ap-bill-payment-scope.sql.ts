/**
 * Row 23 (11-03 register, R216 / ACCT-F11057) — what a "bill payment" IS on every list that shows bill payments.
 *
 * ROOT CAUSE: the driver-settlement close engine records every settlement deduction (driver escrow contribution,
 * advance recovery, other recovery) as a row in accounting.bill_payments applied to the driver's A/P bill, flagged
 * settlement_deduction_noncash = true. Those rows are correct for the bill's balance (A/P aging, the per-bill
 * payment drill, the settlement GL) but they are NOT payments: no money left a bank or card account. Each list
 * reader carried its own WHERE, and only the Accounting › Bill Payments reader excluded them (ROW-216) — the
 * vendor/driver "Bill payments" tab (GET /api/v1/vendors/:id/bill-payments) and the vendor profile activity
 * still listed every escrow movement as a bill payment (USMCA: 223 rows, 129 of them escrow).
 *
 * FIX: one predicate, used by every bill-payment LIST reader: a bill payment is a payment applied to an A/P bill
 * (bill_id set, the bill exists in the same company) that is not a settlement deduction. Escrow keeps its own
 * surfaces (Banking › Driver Escrow, Settlements › Escrow — driver_finance escrow ledger), which do not read this.
 * Balance readers (aging, per-bill drill, posting, bank-recon) deliberately do NOT use this predicate.
 */
export function apBillPaymentOnlySql(alias = "bp"): string {
  const a = /^[a-z_][a-z0-9_]*$/i.test(alias) ? alias : "bp";
  return `(${a}.settlement_deduction_noncash IS NOT TRUE
    AND ${a}.bill_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM accounting.bills ap_bill
      WHERE ap_bill.id = ${a}.bill_id
        AND ap_bill.operating_company_id = ${a}.operating_company_id
    ))`;
}
