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
import { resolveAmountRoute, type AgingBucketId, type AmountFilter } from "../../components/shared/AmountLink";

/** The open-balance invoice list for one customer — the A/R aging row's documented destination. */
export function arAgingInvoiceFilter(customerId: string): AmountFilter {
  return { target: "invoices", customerId, hasBalance: true };
}

/**
 * ACCT-F411 — ONE aging BUCKET for one customer. The destination carries the bucket's NAME, never
 * day numbers: the server resolves it against the single ladder in
 * apps/backend/src/accounting/aging/buckets.ts, which is the same module ar-aging.service.ts
 * classifies with, so the drilled list is exactly the rows the bucket counted. The as-of date rides
 * along because "31-60 days overdue" is only meaningful relative to one.
 */
export function arAgingBucketFilter(
  customerId: string,
  bucket: AgingBucketId | readonly AgingBucketId[],
  asOfDate: string
): AmountFilter {
  return { target: "invoices", customerId, hasBalance: true, agingBucket: bucket, agingAsOf: asOfDate };
}

/** ACCT-F411 — one aging BUCKET for one vendor. See arAgingBucketFilter. */
export function apAgingBucketFilter(
  vendorId: string,
  bucket: AgingBucketId | readonly AgingBucketId[],
  asOfDate: string
): AmountFilter {
  return { target: "bills", vendorId, hasBalance: true, agingBucket: bucket, agingAsOf: asOfDate };
}

/**
 * ACCT-F411 — the A/P aging table's "0–30" column is TWO buckets, not one: the report builds it as
 * `current + b1_30` (reports/ap-aging.routes.ts: `bucket_0_30_cents: current + b1_30`). Naming the
 * span here, once, keeps every caller from guessing which ids that column covers — guessing one of
 * them would drill to half the money the cell shows.
 */
export const AP_BUCKET_0_30: readonly AgingBucketId[] = ["current", "d1_30"];

/** ACCT-F411 — the A/R table's "0–30" column is the same merge (reports/ar-aging.routes.ts). */
export const AR_BUCKET_0_30: readonly AgingBucketId[] = ["current", "d1_30"];

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
