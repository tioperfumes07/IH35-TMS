/**
 * A/R + A/P aging drill-through URL builders.
 *
 * Contracts (server-filtered open balances — not client page slices):
 * - InvoicesListPage: ?customer_id=&has_balance=true → GET invoices has_balance before LIMIT
 * - BillsPage: ?vendor_id=&has_balance=true → GET bills has_balance before LIMIT (includes partial)
 * - Customer/vendor profile tabs preserved as additive secondary entry points.
 * - A/P "Pay now" uses the same has_balance bills list (partial balances included).
 */

export function arAgingInvoiceListHref(customerId: string): string {
  const qs = new URLSearchParams({
    customer_id: customerId,
    has_balance: "true",
  });
  return `/accounting/invoices?${qs.toString()}`;
}

export function arAgingCustomerProfileHref(customerId: string): string {
  return `/customers/${customerId}?tab=billing`;
}

export function apAgingBillsListHref(vendorId: string): string {
  const qs = new URLSearchParams({
    vendor_id: vendorId,
    has_balance: "true",
  });
  return `/accounting/bills?${qs.toString()}`;
}

export function apAgingVendorProfileHref(vendorId: string): string {
  return `/vendors/${vendorId}?tab=ap`;
}
