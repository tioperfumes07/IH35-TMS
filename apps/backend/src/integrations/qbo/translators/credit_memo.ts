import type { QboInvoiceLine } from "../qbo-api-types.js";
import { omitNullish } from "./_omit.js";

/** CreditMemo Line mirrors Invoice sales lines for simple AR credits. */
export function buildQboCreditMemoPayload(input: {
  customerQboId: string;
  txnDate: string;
  docNumber: string;
  totalCents: number;
  privateNote?: string | null;
  defaultItemQboId: string;
  description?: string | null;
  remainingCreditCents?: number | null;
  qbo_credit_memo_id?: string | null;
  qbo_sync_token?: string | null;
}): Record<string, unknown> {
  const line: QboInvoiceLine = omitNullish({
    Amount: input.totalCents / 100,
    DetailType: "SalesItemLineDetail" as const,
    SalesItemLineDetail: {
      ItemRef: { value: input.defaultItemQboId },
      Qty: 1,
      UnitPrice: input.totalCents / 100,
    },
    Description: input.description ?? `Credit memo ${input.docNumber}`,
  }) as QboInvoiceLine;

  const base = omitNullish({
    TxnDate: input.txnDate.slice(0, 10),
    DocNumber: input.docNumber,
    CustomerRef: { value: input.customerQboId },
    Line: [line],
    TotalAmt: input.totalCents / 100,
    ...(input.privateNote ? { CustomerMemo: { value: input.privateNote } } : {}),
    ...(typeof input.remainingCreditCents === "number"
      ? { RemainingCredit: input.remainingCreditCents / 100 }
      : {}),
  });

  const isPatch = Boolean(input.qbo_credit_memo_id && input.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.qbo_credit_memo_id,
      SyncToken: input.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
