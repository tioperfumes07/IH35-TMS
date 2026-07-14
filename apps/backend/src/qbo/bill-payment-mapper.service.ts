import { qboWriteDisabled } from "../integrations/qbo/qbo-write-disabled.js";

export type BillPaymentApplyAllocation = {
  billId: string;
  qboBillId: string;
  amountCents: number;
};

export function buildQboBillPaymentApplyPayload(input: {
  vendorQboId: string;
  paymentDate: string;
  memo?: string | null;
  allocations: BillPaymentApplyAllocation[];
}) {
  const totalCents = input.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  if (totalCents <= 0) throw new Error("bill_payment_total_must_be_positive");

  return {
    VendorRef: { value: input.vendorQboId },
    TxnDate: input.paymentDate.slice(0, 10),
    PrivateNote: input.memo ?? "",
    TotalAmt: totalCents / 100,
    Line: input.allocations.map((row) => ({
      Amount: row.amountCents / 100,
      LinkedTxn: [{ TxnId: row.qboBillId, TxnType: "Bill" }],
    })),
  };
}

// QBO-WRITE-KILL — reconcile-only architecture lock. This path POSTed a BillPayment into QuickBooks.
// Under the parallel-books, reconcile-only architecture TMS never writes to QBO, so the outbound write
// is permanently removed — the function hard-fails instead of issuing HTTP. The pure payload builder
// (buildQboBillPaymentApplyPayload) is retained for reconcile/translation use. Enforced by
// scripts/verify-no-qbo-write-path.mjs.
export async function pushBillPaymentToQuickBooksFromQueue(job: { operating_company_id: string; entity_id: string }): Promise<{ qboId: string }> {
  void job;
  return qboWriteDisabled("bill_payment");
}
