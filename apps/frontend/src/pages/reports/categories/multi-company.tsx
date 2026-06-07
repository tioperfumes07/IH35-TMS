import { Link } from "react-router-dom";
import { ReportCard } from "../../../components/reports/ReportCard";

export function UmultiUcompanyCategoryPage() {
  return (
    <div className="space-y-3 p-3" data-testid="reports-category-multi-company">
      <Link to="/reports" className="text-xs font-semibold text-slate-600 hover:underline">← Reports Hub</Link>
      <h2 className="text-sm font-semibold">Multi-Company View</h2>
      <p className="text-xs text-slate-500">Category landing — open reports from the hub hover nav.</p>
    </div>
  );
}
