/**
 * A/R + A/P aging drill-through URL builders.
 *
 * Contracts verified against existing list pages (no invented query params):
 * - InvoicesListPage: ?customer_id= (deep-link) + status filter values including
 *   client-side "with_balance" (open balance — correct aging context).
 * - BillsPage: ?vendor_id=&status=unpaid (already used by A/P Aging "Pay now").
 * - Customer/vendor profile tabs preserved as additive secondary entry points.
 */

export function arAgingInvoiceListHref(customerId: string): string {
  const qs = new URLSearchParams({
    customer_id: customerId,
    status: "with_balance",
  });
  return `/accounting/invoices?${qs.toString()}`;
}

export function arAgingCustomerProfileHref(customerId: string): string {
  return `/customers/${customerId}?tab=billing`;
}

export function apAgingBillsListHref(vendorId: string): string {
  const qs = new URLSearchParams({
    vendor_id: vendorId,
    status: "unpaid",
  });
  return `/accounting/bills?${qs.toString()}`;
}

export function apAgingVendorProfileHref(vendorId: string): string {
  return `/vendors/${vendorId}?tab=ap`;
}
