// ARCHIVE (A23-6): orphan exceptions surface — linked from HoursOfServicePage. Sunset 2026-09-01. Do not extend.
import { Link } from "react-router-dom";

export default function HosExceptionsPage() {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold text-gray-900">HOS Exceptions</h1>
      <p className="text-sm text-gray-500">
        Exception logging remains on this route. Fleet compliance clocks and near-violation monitoring live on the canonical
        dashboard.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="mb-2">Use the compliance dashboard for duty status, KPI tiles, and drill-down to driver HOS detail.</p>
        <Link to="/safety/hos" className="font-semibold text-slate-700 hover:underline" data-testid="hos-exceptions-dashboard-link">
          Open Hours of Service dashboard
        </Link>
      </div>
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Log exception type, date, and legal justification via POST <code>/api/v1/safety/hos/exceptions</code> (office workflow).
      </div>
    </main>
  );
}
