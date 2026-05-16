import { omitNullish } from "./_omit.js";

export type ResolvedPaymentAllocation = {
  invoiceQboId: string;
  amountCents: number;
};

export function buildQboPaymentPayload(input: {
  customerQboId: string;
  totalCents: number;
  paymentDate: string;
  depositToAccountQboId?: string | null;
  paymentMethodQboId?: string | null;
  privateNote?: string | null;
  qbo_payment_id?: string | null;
  qbo_sync_token?: string | null;
  allocations: ResolvedPaymentAllocation[];
}): Record<string, unknown> {
  const lines = input.allocations.map((a) =>
    omitNullish({
      Amount: a.amountCents / 100,
      LinkedTxn: [{ TxnId: a.invoiceQboId, TxnType: "Invoice" }],
    })
  );

  const base = omitNullish({
    CustomerRef: { value: input.customerQboId },
    TotalAmt: input.totalCents / 100,
    TxnDate: input.paymentDate.slice(0, 10),
    ...(input.depositToAccountQboId ? { DepositToAccountRef: { value: input.depositToAccountQboId } } : {}),
    ...(input.paymentMethodQboId ? { PaymentMethodRef: { value: input.paymentMethodQboId } } : {}),
    ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
    Line: lines,
  });

  const isPatch = Boolean(input.qbo_payment_id && input.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.qbo_payment_id,
      SyncToken: input.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
