import { useLocation } from "react-router-dom";
import type { ReportCategory } from "../../api/reports";
import { REPORT_CATEGORY_FLYOUT_ITEMS } from "../../components/reports/CategoryHoverNav";
import { phase6ReportHref } from "../../components/reports/phase6ReportLinks";
import { HoverDropdownNav, type NavChild, type NavItem } from "../../components/forms/shared/HoverDropdownNav";

const CATEGORY_ORDER: ReportCategory[] = ["all", "operations", "financial", "drivers", "fleet", "fuel", "safety", "compliance", "saved"];

/** Phase 6 report ids — hrefs from phase6ReportLinks (Block U, P6-T11198). */
const PHASE_6_RUNNER_ITEMS: Array<{ id: string; label: string }> = [
  { id: "cash-flow-overview", label: "Cash flow overview" },
  { id: "settlement-summary", label: "Settlement summary" },
  { id: "customer-profitability", label: "Customer profitability" },
  { id: "profit-per-truck", label: "Profit per truck" },
];

function flattenReportRunLinks(): NavChild[] {
  const seen = new Set<string>();
  const out: NavChild[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const item of REPORT_CATEGORY_FLYOUT_ITEMS[cat]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const dedicated = phase6ReportHref(item.id);
      const href =
        dedicated ??
        (item.id === "ar-aging" ? "/reports/ar-aging" : item.id === "ap-aging" ? "/reports/ap-aging" : `/reports/run/${encodeURIComponent(item.id)}`);
      out.push({ label: item.label, href });
    }
  }
  for (const p of PHASE_6_RUNNER_ITEMS) {
    if (seen.has(p.id)) continue;
    const href = phase6ReportHref(p.id);
    if (!href) continue;
    seen.add(p.id);
    out.push({ label: p.label, href });
  }
  return out;
}

/** Top /reports sub-nav (invariant #20). Runner links deduped in same order as CategoryHoverNav flyouts. */
export const REPORTS_SUB_NAV_ITEMS: NavItem[] = [
  { label: "Reports", href: "/reports" },
  { label: "Run report", children: flattenReportRunLinks() },
];

export function reportsSubNavActiveHref(pathname: string): string {
  if (pathname.startsWith("/reports/run/")) return pathname;
  if (
    pathname === "/reports/ar-aging" ||
    pathname === "/reports/ap-aging" ||
    pathname === "/reports/cash-flow-overview" ||
    pathname === "/reports/settlement-summary" ||
    pathname === "/reports/customer-profitability" ||
    pathname === "/reports/profit-per-truck"
  ) {
    return pathname;
  }
  return "/reports";
}

export function ReportsSubNav() {
  const { pathname } = useLocation();
  return <HoverDropdownNav items={[...REPORTS_SUB_NAV_ITEMS]} activeHref={reportsSubNavActiveHref(pathname)} />;
}
