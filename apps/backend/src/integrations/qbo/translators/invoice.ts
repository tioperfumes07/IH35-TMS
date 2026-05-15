import type { QboInvoiceLine } from "../qbo-api-types.js";
import { omitNullish } from "./_omit.js";

export type ResolvedInvoiceLineInput = {
  qboLineId?: string;
  amountCents: number;
  quantity: number;
  unitPriceCents: number;
  itemQboId: string;
  description: string;
  classQboId?: string;
  taxCodeQboId?: string;
};

export type InvoiceHeaderInput = {
  display_id: string;
  issue_date: string;
  due_date: string;
  internal_notes: string | null;
  customer_facing_memo: string | null;
  total_cents: number;
  qbo_invoice_id?: string | null;
  qbo_sync_token?: string | null;
};

export function buildQboInvoicePayload(input: {
  header: InvoiceHeaderInput;
  customerQboId: string;
  billEmail?: string | null;
  lines: ResolvedInvoiceLineInput[];
}): Record<string, unknown> {
  const lines: QboInvoiceLine[] = input.lines.map((l) =>
    omitNullish({
      ...(l.qboLineId ? { Id: l.qboLineId } : {}),
      Amount: l.amountCents / 100,
      DetailType: "SalesItemLineDetail" as const,
      SalesItemLineDetail: omitNullish({
        ItemRef: { value: l.itemQboId },
        Qty: l.quantity,
        UnitPrice: l.unitPriceCents / 100,
        ...(l.classQboId ? { ClassRef: { value: l.classQboId } } : {}),
        ...(l.taxCodeQboId ? { TaxCodeRef: { value: l.taxCodeQboId } } : {}),
      }) as QboInvoiceLine["SalesItemLineDetail"],
      Description: l.description,
    }) as QboInvoiceLine
  );

  const base = omitNullish({
    DocNumber: input.header.display_id,
    TxnDate: input.header.issue_date.slice(0, 10),
    DueDate: input.header.due_date.slice(0, 10),
    CustomerRef: { value: input.customerQboId },
    ...(input.billEmail ? { BillEmail: { Address: input.billEmail } } : {}),
    Line: lines,
    PrivateNote: input.header.internal_notes ?? undefined,
    ...(input.header.customer_facing_memo
      ? { CustomerMemo: { value: input.header.customer_facing_memo } }
      : {}),
    TotalAmt: input.header.total_cents / 100,
  });

  const isPatch = Boolean(input.header.qbo_invoice_id && input.header.qbo_sync_token);
  if (isPatch) {
    return omitNullish({
      ...base,
      Id: input.header.qbo_invoice_id,
      SyncToken: input.header.qbo_sync_token,
      sparse: true,
    });
  }
  return base;
}
