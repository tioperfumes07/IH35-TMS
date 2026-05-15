import { omitNullish } from "./_omit.js";

export type ResolvedBillPaymentAllocation = {
  billQboId: string;
  amountCents: number;
};

export type BillPaymentPayKind = "Check" | "CreditCard" | "Cash";

export function buildQboBillPaymentPayload(input: {
  vendorQboId: string;
  txnDate: string;
  memo?: string | null;
  totalCents: number;
  payType: BillPaymentPayKind;
  bankAccountQboId?: string | null;
  ccAccountQboId?: string | null;
  qbo_bill_payment_id?: string | null;
  qbo_sync_token?: string | null;
  allocations: ResolvedBillPaymentAllocation[];
}): Record<string, unknown> {
  const lines = input.allocations.map((row) =>
    omitNullish({
      Amount: row.amountCents / 100,
      LinkedTxn: [{ TxnId: row.billQboId, TxnType: "Bill" }],
    })
  );

  const paymentBlock =
    input.payType === "CreditCard" && input.ccAccountQboId
      ? { CreditCardPayment: { CCAccountRef: { value: input.ccAccountQboId } } }
      : input.bankAccountQboId
        ? { CheckPayment: { BankAccountRef: { value: input.bankAccountQboId } } }
        : {};

  const base = omitNullish({
    VendorRef: { value: input.vendorQboId },
    TxnDate: input.txnDate.slice(0, 10),
    PayType: input.payType,
    ...paymentBlock,
    PrivateNote: input.memo ?? "",
    TotalAmt: input.totalCents / 100,
    Line: lines,
  });

  const isPatch = Boolean(input.qbo_bill_payment_id && input.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.qbo_bill_payment_id,
      SyncToken: input.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
