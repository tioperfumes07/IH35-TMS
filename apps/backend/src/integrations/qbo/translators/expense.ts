import { omitNullish } from "./_omit.js";

/** Maps TMS expense rows to QBO Purchase payloads (vendor purchases). */
export function buildQboExpensePurchasePayload(input: {
  txnDate: string;
  totalAmount: number;
  memo?: string | null;
  vendorQboId?: string | null;
  expenseAccountQboId: string;
  qbo_purchase_id?: string | null;
  qbo_sync_token?: string | null;
}): Record<string, unknown> {
  const detail = omitNullish({
    AccountRef: { value: input.expenseAccountQboId },
  });

  const line = omitNullish({
    Amount: input.totalAmount,
    DetailType: "AccountBasedExpenseLineDetail" as const,
    AccountBasedExpenseLineDetail: detail,
    Description: input.memo ?? "Expense",
  });

  const base = omitNullish({
    TxnDate: input.txnDate.slice(0, 10),
    PaymentType: "Cash",
    PrivateNote: input.memo ?? "Expense",
    ...(input.vendorQboId ? { EntityRef: { value: input.vendorQboId, type: "Vendor" } } : {}),
    Line: [line],
  });

  const isPatch = Boolean(input.qbo_purchase_id && input.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.qbo_purchase_id,
      SyncToken: input.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
