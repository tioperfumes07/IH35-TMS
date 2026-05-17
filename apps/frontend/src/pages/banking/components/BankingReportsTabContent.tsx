import { Link } from "react-router-dom";

const BANKING_RELEVANT_REPORTS = [
  {
    id: "cash-flow-overview",
    label: "Cash Flow Overview",
    href: "/reports/cash-flow-overview",
    detail: "Cash position and projected inflow/outflow trends.",
  },
  {
    id: "ar-aging",
    label: "A/R Aging",
    href: "/reports/ar-aging",
    detail: "Outstanding receivables that drive cash collections.",
  },
  {
    id: "ap-aging",
    label: "A/P Aging",
    href: "/reports/ap-aging",
    detail: "Upcoming payables and vendor exposure timing.",
  },
  {
    id: "settlement-summary",
    label: "Settlement Summary",
    href: "/reports/settlement-summary",
    detail: "Driver settlement payouts and deduction totals impacting cash movement.",
  },
  {
    id: "scheduled-reports",
    label: "Scheduled Reports",
    href: "/reports/scheduled",
    detail: "Automation for recurring finance and reconciliation reporting.",
  },
] as const;

export function BankingReportsTabContent() {
  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">Banking-relevant reports</p>
        <p className="mt-1 text-xs text-gray-600">
          This tab surfaces existing report pages from the Reports module. No new report types were introduced in this phase.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {BANKING_RELEVANT_REPORTS.map((report) => (
          <Link
            key={report.id}
            to={report.href}
            className="rounded border border-gray-200 bg-white px-3 py-2 hover:border-blue-300 hover:bg-blue-50"
          >
            <p className="text-sm font-semibold text-gray-900">{report.label}</p>
            <p className="mt-1 text-xs text-gray-600">{report.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
