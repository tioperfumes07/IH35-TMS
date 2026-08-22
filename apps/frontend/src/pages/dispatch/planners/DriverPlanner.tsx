import { Link } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { usePlannerRange } from "./PlannerRangeContext";
import { SafetyDriverSchedulerGrid } from "./SafetyDriverSchedulerGrid";

export function DriverPlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range } = usePlannerRange();

  if (!operatingCompanyId) {
    return (
      <div
        data-testid="dispatch-driver-planner-need-company"
        className="rounded-sm border bg-white p-4 text-sm text-slate-600"
      >
        Select an operating company to load the driver planner.
      </div>
    );
  }

  return (
    <div data-testid="dispatch-driver-planner-page" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* CHROME-HONESTY: this is a review/approve inbox for driver-submitted requests, not a
            creator — office has no path to originate a leave request on a driver's behalf
            (the only creating route, POST /api/v1/driver/scheduler/request, is driver-app-only).
            Label matches the destination page's own title ("Leave Requests"); dropped the "+"
            prefix this app reserves for real creators. */}
        <Link to="/safety/scheduler/pending-requests" className="rounded-sm border border-gray-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-gray-50">
          Leave Requests
        </Link>
        <Link to="/safety/leave-balances" className="rounded-sm border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50">
          Leave Balances
        </Link>
      </div>
      <SafetyDriverSchedulerGrid operatingCompanyId={operatingCompanyId} range={range} testId="dispatch-driver-planner-grid" />
    </div>
  );
}
