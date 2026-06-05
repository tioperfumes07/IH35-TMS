export function buildQboCcBillPaymentPayload(input: {
  vendorQboId: string;
  ccLiabilityQboAccountId: string;
  paymentDate: string;
  memo?: string | null;
  allocations: Array<{ billId: string; qboBillId: string; amountCents: number }>;
}) {
  const totalCents = input.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  if (totalCents <= 0) throw new Error("cc_bill_payment_total_must_be_positive");
  return {
    VendorRef: { value: input.vendorQboId },
    PayType: "CreditCard",
    AccountRef: { value: input.ccLiabilityQboAccountId },
    TxnDate: input.paymentDate.slice(0, 10),
    PrivateNote: input.memo ?? "",
    TotalAmt: totalCents / 100,
    Line: input.allocations.map((row) => ({
      Amount: row.amountCents / 100,
      LinkedTxn: [{ TxnId: row.qboBillId, TxnType: "Bill" }],
    })),
  };
}
