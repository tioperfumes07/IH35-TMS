import { HoverDropdown } from "../shared/HoverDropdown";
import type { ReportCategory } from "../../api/reports";
import { ReportFlyoutPanel } from "./ReportFlyoutPanel";
import { useNavigate } from "react-router-dom";
import { phase6ReportHref } from "./phase6ReportLinks";

const CATEGORY_LABELS: Array<{ id: ReportCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "operations", label: "Operations" },
  { id: "financial", label: "Financial" },
  { id: "drivers", label: "Drivers" },
  { id: "fleet", label: "Fleet" },
  { id: "fuel", label: "Fuel" },
  { id: "safety", label: "Safety" },
  { id: "compliance", label: "Compliance" },
  { id: "automation", label: "Automation" },
  { id: "saved", label: "Saved" },
];

const FLYOUT_ITEMS: Record<ReportCategory, Array<{ id: string; label: string; hint?: string }>> = {
  all: [
    { id: "trial-balance", label: "Trial balance", hint: "Debits, credits, and balance check" },
    { id: "profit-loss", label: "Profit & loss", hint: "Revenue, COGS, and net income" },
    { id: "balance-sheet", label: "Balance sheet", hint: "Assets vs liabilities + equity" },
    { id: "cash-flow-statement", label: "Cash flow statement", hint: "Operating, investing, financing" },
    { id: "cash-flow-overview", label: "Cash flow overview", hint: "Liquidity + 30-day projection" },
    { id: "settlement-summary", label: "Settlement summary", hint: "Driver pay + deductions" },
    { id: "customer-profitability", label: "Customer profitability", hint: "Revenue, cost, margin" },
    { id: "profit-per-truck", label: "Profit per truck", hint: "Unit economics" },
    { id: "fuel-reconciliation", label: "Fuel reconciliation", hint: "Card vs WO (Block V)" },
    { id: "maintenance-cost-per-unit", label: "Maintenance cost per unit" },
    { id: "geofence-dwell", label: "Geofence dwell report", hint: "Customer/yard dwell windows" },
    { id: "scheduled-reports", label: "Scheduled reports", hint: "Email automation" },
    { id: "profit-truck-mtd", label: "Profit per truck · MTD", hint: "Margin by unit" },
    { id: "driver-settlement", label: "Driver settlement summary", hint: "Current cycle" },
    { id: "ar-aging", label: "A/R aging", hint: "Current / 30 / 60 / 90+" },
    { id: "ap-aging", label: "A/P aging", hint: "Open bills by vendor" },
  ],
  operations: [
    { id: "profit-per-truck", label: "Profit per truck", hint: "Revenue & cost by unit" },
    { id: "dispatch-board", label: "Dispatch board health", hint: "Live load movement" },
    { id: "load-cancellations", label: "Load cancellations", hint: "Volume by reason, driver, customer" },
    { id: "detention-claims", label: "Detention claims", hint: "Billed vs collected" },
    { id: "fuel-reconciliation", label: "Fuel reconciliation", hint: "Card vs WO" },
    { id: "maintenance-cost-per-unit", label: "Maintenance cost per unit", hint: "WO spend by unit" },
    { id: "geofence-dwell", label: "Geofence dwell report", hint: "Entry/exit duration by site" },
  ],
  financial: [
    { id: "trial-balance", label: "Trial balance", hint: "Debits, credits, and balance check" },
    { id: "profit-loss", label: "Profit & loss", hint: "Revenue, COGS, and net income" },
    { id: "balance-sheet", label: "Balance sheet", hint: "Assets vs liabilities + equity" },
    { id: "cash-flow-statement", label: "Cash flow statement", hint: "Operating, investing, financing" },
    { id: "cash-flow-overview", label: "Cash flow overview", hint: "Operating + DIP + payroll buckets" },
    { id: "settlement-summary", label: "Settlement summary", hint: "Driver pay breakdown" },
    { id: "customer-profitability", label: "Customer profitability", hint: "Margin by customer" },
    { id: "cash-position", label: "Cash position + AR", hint: "Daily liquidity" },
    { id: "profit-truck-mtd", label: "Profit per truck · MTD" },
    { id: "ar-aging", label: "A/R aging", hint: "Current / 30 / 60 / 90+" },
    { id: "ap-aging", label: "A/P aging", hint: "Open bills by vendor" },
  ],
  drivers: [
    { id: "driver-pay-history", label: "Driver pay history" },
    { id: "driver-settlement", label: "Driver settlement summary" },
  ],
  fleet: [
    { id: "maintenance-cost-per-unit", label: "Maintenance cost per unit" },
    { id: "fleet-utilization", label: "Fleet utilization", hint: "Idle vs loaded time" },
  ],
  fuel: [
    { id: "fuel-reconciliation", label: "Fuel reconciliation", hint: "Card vs WO" },
    { id: "fuel-savings", label: "Fuel savings · rec vs actual" },
    { id: "fuel-price-variance", label: "Fuel price variance" },
  ],
  safety: [
    { id: "csa-fleet", label: "CSA fleet score" },
    { id: "hos-violations", label: "HOS violations trend" },
  ],
  compliance: [
    { id: "ifta-quarterly", label: "IFTA quarterly prep" },
    { id: "dot-audit-pack", label: "DOT audit packet" },
  ],
  automation: [{ id: "scheduled-reports", label: "Scheduled reports", hint: "Cron + email queue" }],
  saved: [
    { id: "saved-owner-pack", label: "Owner weekly pack" },
    { id: "saved-quarter-close", label: "Quarter close package" },
  ],
};

/** Shared with ReportsSubNav (invariant #20) so top-row runner links match category flyouts. */
export const REPORT_CATEGORY_FLYOUT_ITEMS = FLYOUT_ITEMS;

type Props = {
  activeCategory: ReportCategory;
  onCategoryChange: (category: ReportCategory) => void;
};

export function CategoryHoverNav({ activeCategory, onCategoryChange }: Props) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto border-b border-slate-200 bg-white px-2 py-1">
      <div className="flex min-w-max gap-3">
        {CATEGORY_LABELS.map((category) => {
          const active = category.id === activeCategory;
          return (
            <HoverDropdown
              key={category.id}
              trigger={
                <span
                  className={`inline-flex items-center border-b-2 px-1 py-1 text-xs font-semibold ${
                    active ? "border-b-[#1f2a44] text-[#1f2a44]" : "border-b-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {category.label}
                </span>
              }
            >
              <ReportFlyoutPanel
                title={`${category.label} reports`}
                items={FLYOUT_ITEMS[category.id]}
                onSelect={(itemId) => {
                  onCategoryChange(category.id);
                  const phase6 = phase6ReportHref(itemId);
                  if (phase6) {
                    navigate(phase6);
                    return;
                  }
                  if (itemId === "ar-aging") {
                    navigate("/reports/ar-aging");
                    return;
                  }
                  if (itemId === "ap-aging") {
                    navigate("/reports/ap-aging");
                    return;
                  }
                  navigate(`/reports/run/${encodeURIComponent(itemId)}`);
                }}
                footer="Click any report to run"
              />
            </HoverDropdown>
          );
        })}
      </div>
    </div>
  );
}
