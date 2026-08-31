import type { ReportCategory } from "../../api/reports";
import { REPORT_CATEGORY_FLYOUT_ITEMS } from "../../components/reports/CategoryHoverNav";
import { phase6ReportHref } from "../../components/reports/phase6ReportLinks";
import { NavyPageSubNav, type NavyPageSubNavItem, type NavySubNavChild } from "../../components/layout/NavyPageSubNav";

const CATEGORY_ORDER: ReportCategory[] = [
  "all",
  "operations",
  "financial",
  "drivers",
  "fleet",
  "fuel",
  "safety",
  "compliance",
  "automation",
  "saved",
];

/** Phase 6 report ids — hrefs from phase6ReportLinks (Block U + W). */
const PHASE_6_RUNNER_ITEMS: Array<{ id: string; label: string }> = [
  { id: "trial-balance", label: "Trial balance" },
  { id: "profit-loss", label: "Profit & loss" },
  { id: "balance-sheet", label: "Balance sheet" },
  { id: "cash-flow-statement", label: "Cash flow statement" },
  { id: "cash-flow-overview", label: "Cash flow overview" },
  { id: "settlement-summary", label: "Settlement summary" },
  { id: "customer-profitability", label: "Customer profitability" },
  { id: "profit-per-truck", label: "Per-truck CPM dashboard" },
  { id: "lane-profitability", label: "Lane profitability" },
  { id: "fuel-reconciliation", label: "Fuel reconciliation" },
  { id: "maintenance-cost-per-unit", label: "Maintenance cost per unit" },
  { id: "geofence-dwell", label: "Geofence dwell report" },
  { id: "deadhead", label: "Deadhead optimization" },
  { id: "scheduled-reports", label: "Default subscriptions" },
];

function flattenReportRunLinks(): NavySubNavChild[] {
  const seen = new Set<string>();
  const out: NavySubNavChild[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const item of REPORT_CATEGORY_FLYOUT_ITEMS[cat]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const dedicated = phase6ReportHref(item.id);
      const href =
        dedicated ??
        (item.id === "ar-aging"
          ? "/reports/ar-aging"
          : item.id === "ap-aging"
            ? "/reports/ap-aging"
            : `/reports/run/${encodeURIComponent(item.id)}`);
      out.push({ label: item.label, to: href });
    }
  }
  for (const p of PHASE_6_RUNNER_ITEMS) {
    if (seen.has(p.id)) continue;
    const href = phase6ReportHref(p.id);
    if (!href) continue;
    seen.add(p.id);
    out.push({ label: p.label, to: href });
  }
  return out;
}

/** Top /reports sub-nav (invariant #20). Runner links deduped in same order as CategoryHoverNav flyouts. */
const AUDIT_REPORT_CHILDREN: NavySubNavChild[] = [
  { label: "Activity by user", to: "/reports/audit/activity-by-user" },
  { label: "Activity by module", to: "/reports/audit/activity-by-module" },
  {
    label: "Financial change log",
    to: "/reports/audit/financial-change-log",
  },
  {
    label: "Maintenance decision log",
    to: "/reports/audit/maintenance-decision-log",
  },
  { label: "Deduction trail", to: "/reports/audit/deduction-trail" },
  { label: "Void & reversal", to: "/reports/audit/void-reversal" },
  {
    label: "Period close history",
    to: "/reports/audit/period-close-history",
  },
];

export const REPORTS_SUB_NAV_ITEMS: NavyPageSubNavItem[] = [
  { label: "Reports", to: "/reports" },
  { label: "Category hub", to: "/reports/hub" },
  // Label navigates to hub; chevron lists every runner (nav-split — same class as Accounting).
  {
    label: "Run report",
    to: "/reports/hub",
    children: flattenReportRunLinks(),
  },
  { label: "Cancellations", to: "/reports/cancellations" },
  { label: "Scheduled (custom)", to: "/reports/scheduled-custom" },
  {
    label: "Audit",
    to: "/reports/audit/activity-by-user",
    children: AUDIT_REPORT_CHILDREN,
  },
];

export function reportsSubNavActiveHref(pathname: string): string {
  if (pathname.startsWith("/reports/audit/")) return pathname;
  if (pathname.startsWith("/reports/run/")) return pathname;
  if (pathname.startsWith("/reports/categories/")) return "/reports/hub";
  if (pathname === "/reports/hub") return pathname;
  if (pathname === "/reports/scheduled-custom") return pathname;
  if (
    pathname === "/reports/ar-aging" ||
    pathname === "/reports/ap-aging" ||
    pathname === "/reports/trial-balance" ||
    pathname === "/reports/profit-loss" ||
    pathname === "/reports/balance-sheet" ||
    pathname === "/reports/cash-flow-statement" ||
    pathname === "/reports/cash-flow-overview" ||
    pathname === "/reports/settlement-summary" ||
    pathname === "/reports/customer-profitability" ||
    pathname === "/reports/profit-per-truck" ||
    pathname === "/reports/lane-profitability" ||
    pathname === "/reports/fuel-reconciliation" ||
    pathname === "/reports/maintenance-cost-per-unit" ||
    pathname === "/reports/geofence-dwell" ||
    pathname === "/reports/deadhead" ||
    pathname === "/reports/cancellations" ||
    pathname === "/reports/scheduled"
  ) {
    return pathname;
  }
  return "/reports";
}

export function ReportsSubNav() {
  return (
    <NavyPageSubNav items={REPORTS_SUB_NAV_ITEMS} />
  );
}
