import type { BillPayment, ExpenseListRow, Invoice, Payment, VendorBill } from "../../api/accounting";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";

function money(cents: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function expenseBulkRowLabel(row: ExpenseListRow): string {
  const head = row.expense_number?.trim() || row.memo?.trim() || "Expense";
  return `${head} · ${formatDateUS(row.transaction_date)} · ${money(row.total_amount_cents)}`;
}

export function billBulkRowLabel(row: VendorBill): string {
  const display = visibleDocumentLabel(row.display_id ?? row.bill_number, row.id, "Bill");
  const vendorInv = row.bill_number?.trim();
  const vendorPart = vendorInv ? ` · Inv ${vendorInv}` : "";
  return `${display}${vendorPart} · ${formatDateUS(row.bill_date)} · ${money(row.amount_cents)}`;
}

export function invoiceBulkRowLabel(row: Invoice): string {
  const display = entityLabel(row.display_id, row.id, "Invoice");
  const customer = row.customer_name?.trim();
  const customerPart = customer ? ` · ${customer}` : "";
  return `${display}${customerPart} · ${formatDateUS(row.issue_date)} · ${money(row.total_cents)}`;
}

export function paymentBulkRowLabel(row: Payment): string {
  const display = entityLabel(row.display_id, row.id, "Payment");
  const customer = row.customer_name?.trim();
  const customerPart = customer ? ` · ${customer}` : "";
  return `${display}${customerPart} · ${formatDateUS(row.payment_date)} · ${money(row.amount_cents)}`;
}

export function billPaymentBulkRowLabel(row: BillPayment): string {
  const vendor = entityLabel(row.vendor_name, row.mdata_vendor_id ?? row.vendor_id, "Vendor");
  const billRef = visibleDocumentLabel(row.bill_number, row.bill_id, "Bill");
  return `${vendor} · ${billRef} · ${formatDateUS(row.payment_date)} · ${money(row.amount_cents)}`;
}

export function bulkRowLabelsFromRows<T extends { id: string }>(
  rows: T[],
  labelFn: (row: T) => string
): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.id, labelFn(row)]));
}
