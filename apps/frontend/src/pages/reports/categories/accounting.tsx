import { Link } from "react-router-dom";
import { ReportCard } from "../../../components/reports/ReportCard";

export function UaccountingCategoryPage() {
  return (
    <div className="space-y-3 p-3" data-testid="reports-category-accounting">
      <Link to="/reports" className="text-xs font-semibold text-slate-600 hover:underline">← Reports Hub</Link>
      <h2 className="text-sm font-semibold">Accounting & Financials</h2>
      <p className="text-xs text-slate-500">Category landing — open reports from the hub hover nav.</p>
    </div>
  );
}
