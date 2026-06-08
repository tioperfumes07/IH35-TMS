import { Link } from "react-router-dom";
import { ReportCard } from "../../../components/reports/ReportCard";

const REPORTS = [
  { id: "profit-per-truck", label: "Profit per truck", route: "/reports/profit-per-truck", description: "Unit economics" },
  { id: "load-cancellations", label: "Load cancellations", route: "/reports/load-cancellations", description: "Cancellation analytics" },
];

export function OpsDispatchCategoryPage() {
  return (
    <div className="space-y-3 p-3" data-testid="reports-category-ops-dispatch">
      <Link to="/reports" className="text-xs font-semibold text-slate-600 hover:underline">
        ← Reports Hub
      </Link>
      <h2 className="text-sm font-semibold">Operations & Dispatch</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <ReportCard key={r.id} id={r.id} label={r.label} description={r.description} route={r.route} />
        ))}
      </div>
    </div>
  );
}
