import type { QboBillLine } from "../qbo-api-types.js";
import { omitNullish } from "./_omit.js";

export type ResolvedBillLineInput = {
  qboLineId?: string;
  amountCents: number;
  description: string | null;
  accountQboId: string;
  classQboId?: string;
  taxCodeQboId?: string;
};

export function buildQboBillPayload(input: {
  vendorQboId: string;
  apAccountQboId: string;
  txnDate: string;
  dueDate?: string | null;
  docNumber?: string | null;
  privateNote?: string | null;
  totalCents: number;
  qbo_bill_id?: string | null;
  qbo_sync_token?: string | null;
  lines: ResolvedBillLineInput[];
}): Record<string, unknown> {
  const qLines: QboBillLine[] = input.lines.map((l) =>
    omitNullish({
      ...(l.qboLineId ? { Id: l.qboLineId } : {}),
      Amount: l.amountCents / 100,
      DetailType: "AccountBasedExpenseLineDetail" as const,
      AccountBasedExpenseLineDetail: omitNullish({
        AccountRef: { value: l.accountQboId },
        ...(l.classQboId ? { ClassRef: { value: l.classQboId } } : {}),
        ...(l.taxCodeQboId ? { TaxCodeRef: { value: l.taxCodeQboId } } : {}),
      }) as QboBillLine["AccountBasedExpenseLineDetail"],
      Description: l.description ?? undefined,
    }) as QboBillLine
  );

  const base = omitNullish({
    VendorRef: { value: input.vendorQboId },
    APAccountRef: { value: input.apAccountQboId },
    TxnDate: input.txnDate.slice(0, 10),
    ...(input.dueDate ? { DueDate: input.dueDate.slice(0, 10) } : {}),
    ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
    ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
    Line: qLines,
    TotalAmt: input.totalCents / 100,
  });

  const isPatch = Boolean(input.qbo_bill_id && input.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.qbo_bill_id,
      SyncToken: input.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
