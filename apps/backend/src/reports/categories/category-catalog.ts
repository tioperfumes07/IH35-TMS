export type ReportCatalogEntry = {
  id: string;
  label: string;
  route: string;
  icon: string;
  description: string;
};

export type ReportCategoryDef = {
  id: string;
  label: string;
  reports: ReportCatalogEntry[];
};

export const REPORT_CATEGORIES: ReportCategoryDef[] = [
  {
    id: "ops-dispatch",
    label: "Operations & Dispatch",
    reports: [
      { id: "profit-per-truck", label: "Profit per truck", route: "/reports/profit-per-truck", icon: "truck", description: "Unit economics" },
      { id: "load-cancellations", label: "Load cancellations", route: "/reports/load-cancellations", icon: "x", description: "Volume by reason" },
      { id: "geofence-dwell", label: "Geofence dwell", route: "/reports/geofence-dwell", icon: "pin", description: "Yard dwell windows" },
    ],
  },
  {
    id: "driver-perf",
    label: "Driver Performance",
    reports: [
      { id: "driver-settlement", label: "Driver settlement", route: "/reports/settlement-summary", icon: "wallet", description: "Current cycle pay" },
      { id: "driver-pay-history", label: "Driver pay history", route: "/reports/run/driver-pay-history", icon: "history", description: "Historical pay" },
    ],
  },
  {
    id: "equipment",
    label: "Equipment & Maintenance",
    reports: [
      { id: "maintenance-cost-per-unit", label: "Maintenance cost per unit", route: "/reports/maintenance-cost-per-unit", icon: "wrench", description: "WO spend by unit" },
      { id: "fleet-utilization", label: "Fleet utilization", route: "/reports/run/fleet-utilization", icon: "gauge", description: "Loaded vs idle" },
    ],
  },
  {
    id: "safety",
    label: "Safety & Compliance",
    reports: [
      { id: "csa-fleet", label: "CSA fleet score", route: "/reports/run/csa-fleet", icon: "shield", description: "CSA BASIC trends" },
      { id: "hos-violations", label: "HOS violations", route: "/reports/run/hos-violations", icon: "clock", description: "Violation trend" },
    ],
  },
  {
    id: "customers",
    label: "Customers & Revenue",
    reports: [
      { id: "customer-profitability", label: "Customer profitability", route: "/reports/customer-profitability", icon: "users", description: "Margin by customer" },
      { id: "ar-aging", label: "A/R aging", route: "/reports/ar-aging", icon: "invoice", description: "Receivables buckets" },
    ],
  },
  {
    id: "vendors",
    label: "Vendors & Costs",
    reports: [
      { id: "ap-aging", label: "A/P aging", route: "/reports/ap-aging", icon: "bill", description: "Open bills by vendor" },
      { id: "fuel-reconciliation", label: "Fuel reconciliation", route: "/reports/fuel-reconciliation", icon: "fuel", description: "Card vs WO" },
    ],
  },
  {
    id: "accounting",
    label: "Accounting & Financials",
    reports: [
      { id: "trial-balance", label: "Trial balance", route: "/reports/trial-balance", icon: "scale", description: "Debits and credits" },
      { id: "profit-loss", label: "Profit & loss", route: "/reports/profit-loss", icon: "chart", description: "P&L statement" },
      { id: "balance-sheet", label: "Balance sheet", route: "/reports/balance-sheet", icon: "sheet", description: "Assets vs liabilities" },
      { id: "cash-flow-statement", label: "Cash flow statement", route: "/reports/cash-flow-statement", icon: "flow", description: "Operating/investing/financing" },
    ],
  },
  {
    id: "tax-reg",
    label: "Tax & Regulatory",
    reports: [
      { id: "ifta-quarterly", label: "IFTA quarterly prep", route: "/reports/ifta", icon: "tax", description: "Quarterly IFTA filing" },
      { id: "dot-audit-pack", label: "DOT audit packet", route: "/reports/run/dot-audit-pack", icon: "audit", description: "DOT audit exports" },
    ],
  },
  {
    id: "multi-company",
    label: "Multi-Company View",
    reports: [
      { id: "scheduled-reports", label: "Scheduled reports", route: "/reports/scheduled", icon: "mail", description: "Auto-emailed reports" },
      { id: "cash-flow-overview", label: "Cash flow overview", route: "/reports/cash-flow-overview", icon: "layers", description: "Consolidated liquidity" },
    ],
  },
];

export function allCatalogReportIds(): string[] {
  return REPORT_CATEGORIES.flatMap((c) => c.reports.map((r) => r.id));
}
