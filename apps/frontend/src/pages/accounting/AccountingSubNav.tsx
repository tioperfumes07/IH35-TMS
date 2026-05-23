import { useLocation } from "react-router-dom";
import { HoverDropdownNav } from "../../components/forms/shared/HoverDropdownNav";

/**
 * Pilot /accounting module sub-nav (invariant #20).
 * Includes directive-listed items plus Invoices, Payments, Factoring (IH35 §F invariant #24 — shipped ACCTG sidebar destinations).
 */
export const ACCOUNTING_SUB_NAV_ITEMS = [
  {
    label: "Bills",
    children: [
      { label: "Bill", href: "/accounting/bills" },
      { label: "Maintenance bill", href: "/accounting/bills/maintenance" },
      { label: "Repair bill", href: "/accounting/bills/repair" },
      { label: "Fuel bill", href: "/accounting/bills/fuel" },
      { label: "Driver bill", href: "/accounting/bills/driver" },
      { label: "Vendor bill", href: "/accounting/bills/vendor" },
      { label: "Multiple bills", href: "/accounting/bills/multiple" },
    ],
  },
  { label: "Expenses", href: "/accounting/expenses" },
  /** Registered in App.tsx as `/accounting/bill-payments` (plural). */
  { label: "Bill payment", href: "/accounting/bill-payments" },
  { label: "Maintenance & shop", href: "/accounting/maintenance-shop" },
  { label: "Vendors", href: "/accounting/vendors" },
  { label: "Customers", href: "/accounting/customers" },
  { label: "Reports", href: "/accounting/reports" },
  { label: "Invoices", href: "/accounting/invoices" },
  { label: "Multi-entity", href: "/accounting/multi-entity" },
  { label: "Receive Payment", href: "/accounting/payments" },
  { label: "Factoring", href: "/accounting/factoring" },
  { label: "Factor reconciliation", href: "/accounting/factor-reconciliation" },
  { label: "Sales tax", href: "/accounting/sales-tax" },
  { label: "Audit trail", href: "/accounting/audit-trail" },
  { label: "Posting lineage", href: "/accounting/posting-lineage" },
  { label: "Pre-settlements", href: "/accounting/pre-settlements" },
  { label: "Vendor balances", href: "/accounting/vendor-balances" },
  { label: "Journal entries", href: "/accounting/journal-entries" },
  {
    label: "Settings",
    children: [
      { label: "Expense category map", href: "/accounting/settings/expense-category-map" },
      { label: "CoA roles", href: "/accounting/settings/coa-roles" },
    ],
  },
] as const;

/** Map detail paths to list href so leaf tabs stay active (primitive compares exact href). */
export function accountingSubNavActiveHref(pathname: string): string {
  if (pathname.startsWith("/accounting/invoices/")) return "/accounting/invoices";
  if (pathname.startsWith("/accounting/multi-entity")) return "/accounting/multi-entity";
  if (pathname.startsWith("/accounting/payments/")) return "/accounting/payments";
  if (pathname.startsWith("/accounting/factoring/")) return "/accounting/factoring";
  if (pathname.startsWith("/accounting/factor-reconciliation")) return "/accounting/factor-reconciliation";
  if (pathname.startsWith("/accounting/sales-tax")) return "/accounting/sales-tax";
  if (pathname.startsWith("/accounting/audit-trail")) return "/accounting/audit-trail";
  if (pathname.startsWith("/accounting/posting-lineage")) return "/accounting/posting-lineage";
  if (pathname.startsWith("/accounting/pre-settlements")) return "/accounting/pre-settlements";
  if (pathname.startsWith("/accounting/settings/expense-category-map")) return "/accounting/settings/expense-category-map";
  if (pathname.startsWith("/accounting/settings/coa-roles")) return "/accounting/settings/coa-roles";
  return pathname;
}

export function AccountingSubNav() {
  const { pathname } = useLocation();
  return <HoverDropdownNav items={[...ACCOUNTING_SUB_NAV_ITEMS]} activeHref={accountingSubNavActiveHref(pathname)} />;
}
