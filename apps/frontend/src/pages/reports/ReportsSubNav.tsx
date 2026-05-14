import { useLocation } from "react-router-dom";
import type { ReportCategory } from "../../api/reports";
import { REPORT_CATEGORY_FLYOUT_ITEMS } from "../../components/reports/CategoryHoverNav";
import { HoverDropdownNav, type NavChild, type NavItem } from "../../components/forms/shared/HoverDropdownNav";

const CATEGORY_ORDER: ReportCategory[] = ["all", "operations", "financial", "drivers", "fleet", "fuel", "safety", "compliance", "saved"];

function flattenReportRunLinks(): NavChild[] {
  const seen = new Set<string>();
  const out: NavChild[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const item of REPORT_CATEGORY_FLYOUT_ITEMS[cat]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const href =
        item.id === "ar-aging" ? "/reports/ar-aging" : item.id === "ap-aging" ? "/reports/ap-aging" : `/reports/run/${encodeURIComponent(item.id)}`;
      out.push({ label: item.label, href });
    }
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
  if (pathname === "/reports/ar-aging" || pathname === "/reports/ap-aging") return pathname;
  return "/reports";
}

export function ReportsSubNav() {
  const { pathname } = useLocation();
  return <HoverDropdownNav items={[...REPORTS_SUB_NAV_ITEMS]} activeHref={reportsSubNavActiveHref(pathname)} />;
}
