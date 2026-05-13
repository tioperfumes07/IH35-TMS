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
  { label: "Payments", href: "/accounting/payments" },
  { label: "Factoring", href: "/accounting/factoring" },
  { label: "Vendor balances", href: "/accounting/vendor-balances" },
  { label: "Journal entries", href: "/accounting/journal-entries" },
] as const;

/** Map detail paths to list href so leaf tabs stay active (primitive compares exact href). */
export function accountingSubNavActiveHref(pathname: string): string {
  if (pathname.startsWith("/accounting/invoices/")) return "/accounting/invoices";
  if (pathname.startsWith("/accounting/payments/")) return "/accounting/payments";
  if (pathname.startsWith("/accounting/factoring/")) return "/accounting/factoring";
  return pathname;
}

export function AccountingSubNav() {
  const { pathname } = useLocation();
  return <HoverDropdownNav items={[...ACCOUNTING_SUB_NAV_ITEMS]} activeHref={accountingSubNavActiveHref(pathname)} />;
}
