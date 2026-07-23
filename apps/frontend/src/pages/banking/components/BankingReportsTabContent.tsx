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
      <div
        className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
        data-testid="banking-reports-not-recon-proof-banner"
      >
        <p className="font-semibold">Reports are drill-through surfaces — not bank reconciliation proof.</p>
        <p className="mt-1">
          Opening Cash Flow / Aging / Settlements does not clear the for-review bank feed or create reconciliation
          matches. Until Match/Categorize and period reconcile are proven live, treat this tab as navigation only.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link to="/banking/transactions?type=uncategorized" className="font-medium text-slate-800 underline">
            For-review Match/Categorize
          </Link>
          <Link to="/banking/reconciliation" className="font-medium text-slate-800 underline">
            Reconciliation
          </Link>
        </div>
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-3">
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
            className="rounded-sm border border-gray-200 bg-white px-3 py-2 hover:border-slate-300 hover:bg-slate-100"
          >
            <p className="text-sm font-semibold text-gray-900">{report.label}</p>
            <p className="mt-1 text-xs text-gray-600">{report.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
