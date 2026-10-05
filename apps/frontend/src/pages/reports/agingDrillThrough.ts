/**
 * A/R + A/P aging drill-through URL builders.
 *
 * Contracts (server-filtered open balances — not client page slices):
 * - InvoicesListPage: ?customer_id=&has_balance=true → GET invoices has_balance before LIMIT
 * - BillsPage: ?vendor_id=&has_balance=true → GET bills has_balance before LIMIT (includes partial)
 * - Customer/vendor profile tabs preserved as additive secondary entry points.
 * - A/P "Pay now" uses the same has_balance bills list (partial balances included).
 *
 * ONE SOURCE OF TRUTH (ACCT-F410-B): the FILTER is primary and the href is derived from it through
 * resolveAmountRoute, so a row-click href and an <AmountLink> on the same row cannot drift to
 * different URLs. They did drift: the vendor/customer NAME cell had been turned into an
 * EntityLink pointing at the vendor/customer PROFILE, which (a) contradicted this page's own
 * documented design — "row drill -> bills with open balance" — (b) duplicated the separate
 * "Vendor profile" / "Customer profile" row action that already exists, and (c) on A/P also carried
 * stopPropagation, so the documented row drill became unreachable from the most natural click
 * target on the row. On A/R it carried no stopPropagation, so the name click and the row click
 * both fired and raced. Both aging drill-through tests have been red on main because of this.
 */
import { resolveAmountRoute, type AmountFilter } from "../../components/shared/AmountLink";

/** The open-balance invoice list for one customer — the A/R aging row's documented destination. */
export function arAgingInvoiceFilter(customerId: string): AmountFilter {
  return { target: "invoices", customerId, hasBalance: true };
}

/** The open-balance bill list for one vendor — the A/P aging row's documented destination. */
export function apAgingBillsFilter(vendorId: string): AmountFilter {
  return { target: "bills", vendorId, hasBalance: true };
}

export function arAgingInvoiceListHref(customerId: string): string {
  // Derived, never hand-built — see ONE SOURCE OF TRUTH above.
  return resolveAmountRoute(arAgingInvoiceFilter(customerId)) ?? "/accounting/invoices";
}

export function arAgingCustomerProfileHref(customerId: string): string {
  return `/customers/${customerId}?tab=billing`;
}

export function apAgingBillsListHref(vendorId: string): string {
  // Derived, never hand-built — see ONE SOURCE OF TRUTH above.
  return resolveAmountRoute(apAgingBillsFilter(vendorId)) ?? "/accounting/bills";
}

export function apAgingVendorProfileHref(vendorId: string): string {
  return `/vendors/${vendorId}?tab=ap`;
}
