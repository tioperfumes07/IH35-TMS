import { useLocation } from "react-router-dom";
import { HoverDropdownNav } from "../../components/forms/shared/HoverDropdownNav";
import { ACCOUNTING_SUB_NAV_ITEMS } from "./subnav-manifest";

const BILL_CATEGORY_PATHS: Record<string, string> = {
  maintenance: "/accounting/bills/maintenance",
  repair: "/accounting/bills/repair",
  fuel: "/accounting/bills/fuel",
  driver: "/accounting/bills/driver",
};

/** Map detail paths to list href so leaf tabs stay active (primitive compares exact href). */
export function accountingSubNavActiveHref(pathname: string, search: string): string {
  if (pathname === "/accounting/bills") {
    const category = new URLSearchParams(search).get("category");
    if (category && BILL_CATEGORY_PATHS[category]) return BILL_CATEGORY_PATHS[category];
  }
  if (pathname.startsWith("/accounting/invoices/")) return "/accounting/invoices";
  if (pathname.startsWith("/accounting/multi-entity")) return "/accounting/multi-entity";
  if (pathname.startsWith("/accounting/payments/")) return "/accounting/payments";
  if (pathname.startsWith("/accounting/factoring/")) return "/accounting/factoring";
  if (pathname.startsWith("/accounting/factor-reconciliation")) return "/accounting/factor-reconciliation";
  if (pathname.startsWith("/accounting/sales-tax")) return "/accounting/sales-tax";
  if (pathname.startsWith("/accounting/month-close")) return "/accounting/month-close";
  if (pathname.startsWith("/accounting/audit-trail")) return "/accounting/audit-trail";
  if (pathname.startsWith("/accounting/posting-lineage")) return "/accounting/posting-lineage";
  if (pathname.startsWith("/accounting/escrow")) return "/accounting/escrow";
  if (pathname.startsWith("/accounting/cash-forecast")) return "/accounting/cash-forecast";
  if (pathname.startsWith("/accounting/collections")) return "/accounting/collections";
  if (pathname.startsWith("/accounting/period-comparison")) return "/accounting/period-comparison";
  if (pathname.startsWith("/accounting/pre-settlements")) return "/accounting/pre-settlements";
  if (pathname.startsWith("/accounting/dispute-queue")) return "/accounting/dispute-queue";
  if (pathname.startsWith("/accounting/abandonment-queue")) return "/accounting/abandonment-queue";
  if (pathname.startsWith("/reports/ar-aging")) return "/reports/ar-aging";
  if (pathname.startsWith("/reports/ap-aging")) return "/reports/ap-aging";
  if (pathname.startsWith("/accounting/settings/expense-category-map")) return "/accounting/settings/expense-category-map";
  if (pathname.startsWith("/accounting/settings/coa-roles")) return "/accounting/settings/coa-roles";
  return pathname;
}

export function AccountingSubNav() {
  const { pathname, search } = useLocation();
  return (
    <HoverDropdownNav
      items={ACCOUNTING_SUB_NAV_ITEMS.map((item) => item)}
      activeHref={accountingSubNavActiveHref(pathname, search)}
    />
  );
}
