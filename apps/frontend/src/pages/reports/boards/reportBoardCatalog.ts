/**
 * Rows 79-84 (11-03 register; 443.281 boards docs/design/v3/V3-Reports-*.dc.html) — the five report boards.
 * One list feeds the Reports home catalog, the report tab strip and the Reports sub-nav; each entry names the
 * EXISTING endpoint the board reads (scripts/verify-reports-five-pages-wired.mjs asserts page ↔ endpoint).
 */
export type ReportBoardId = "loads-report" | "driver-settlements-report" | "company-settlements-report" | "customer-report" | "vendor-report";

export type ReportBoardEntry = {
  id: ReportBoardId;
  label: string;
  tab: string;
  href: string;
  shows: string;
  endpoint: string;
};

export const REPORT_BOARDS: readonly ReportBoardEntry[] = [
  {
    id: "loads-report",
    label: "Loads report",
    tab: "Loads",
    href: "/reports/loads",
    shows: "Revenue, miles and driver pay by week · month · customer · driver · truck · lane · trip type",
    endpoint: "/api/v1/reports/loads",
  },
  {
    id: "driver-settlements-report",
    label: "Driver settlement report",
    tab: "Driver settlements",
    href: "/reports/driver-settlements",
    shows: "Every driver statement — gross, deductions, reimbursements, net, paid",
    endpoint: "/api/v1/reports/driver-settlements",
  },
  {
    id: "company-settlements-report",
    label: "Company settlement report",
    tab: "Company settlements",
    href: "/reports/company-settlements",
    shows: "Profit per closed trip — revenue − costs − driver pay",
    endpoint: "/api/v1/driver-finance/tours",
  },
  {
    id: "customer-report",
    label: "Customer report",
    tab: "Customers",
    href: "/reports/customers",
    shows: "Sales, open balances, aging and statement by customer",
    endpoint: "/api/v1/mdata/boards/customers",
  },
  {
    id: "vendor-report",
    label: "Vendor report",
    tab: "Vendors",
    href: "/reports/vendors",
    shows: "Spend, open bills, category and 1099 by vendor",
    endpoint: "/api/v1/mdata/boards/vendors",
  },
] as const;

export const REPORT_BOARD_HREFS: Record<ReportBoardId, string> = Object.fromEntries(
  REPORT_BOARDS.map((b) => [b.id, b.href])
) as Record<ReportBoardId, string>;
