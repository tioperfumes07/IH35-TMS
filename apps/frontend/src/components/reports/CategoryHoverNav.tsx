import { HoverDropdown } from "../shared/HoverDropdown";
import type { ReportCategory } from "../../api/reports";
import { ReportFlyoutPanel } from "./ReportFlyoutPanel";

const CATEGORY_LABELS: Array<{ id: ReportCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "operations", label: "Operations" },
  { id: "financial", label: "Financial" },
  { id: "drivers", label: "Drivers" },
  { id: "fleet", label: "Fleet" },
  { id: "fuel", label: "Fuel" },
  { id: "safety", label: "Safety" },
  { id: "compliance", label: "Compliance" },
  { id: "saved", label: "Saved" },
];

const FLYOUT_ITEMS: Record<ReportCategory, Array<{ id: string; label: string; hint?: string }>> = {
  all: [
    { id: "profit-truck-mtd", label: "Profit per truck · MTD", hint: "Margin by unit" },
    { id: "driver-settlement", label: "Driver settlement summary", hint: "Current cycle" },
    { id: "ar-aging", label: "A/R aging", hint: "Current / 30 / 60 / 90+" },
  ],
  operations: [
    { id: "dispatch-board", label: "Dispatch board health", hint: "Live load movement" },
    { id: "detention-claims", label: "Detention claims", hint: "Billed vs collected" },
  ],
  financial: [
    { id: "cash-position", label: "Cash position + AR", hint: "Daily liquidity" },
    { id: "profit-truck-mtd", label: "Profit per truck · MTD" },
  ],
  drivers: [
    { id: "driver-pay-history", label: "Driver pay history" },
    { id: "driver-settlement", label: "Driver settlement summary" },
  ],
  fleet: [
    { id: "maint-cost-unit", label: "Maintenance cost per unit" },
    { id: "fleet-utilization", label: "Fleet utilization", hint: "Idle vs loaded time" },
  ],
  fuel: [
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
                onSelect={() => onCategoryChange(category.id)}
                footer="Click any report to run"
              />
            </HoverDropdown>
          );
        })}
      </div>
    </div>
  );
}
