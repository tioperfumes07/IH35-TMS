import { Link } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { usePlannerRange } from "./PlannerRangeContext";
import { SafetyDriverSchedulerGrid } from "./SafetyDriverSchedulerGrid";

export function DriverPlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range } = usePlannerRange();

  return (
    <div data-testid="dispatch-driver-planner-page" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link to="/safety/scheduler/pending-requests" className="rounded border border-gray-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-gray-50">
          + Request time off
        </Link>
        <Link to="/safety/leave-balances" className="rounded border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50">
          Leave Balances
        </Link>
      </div>
      <SafetyDriverSchedulerGrid operatingCompanyId={operatingCompanyId} range={range} testId="dispatch-driver-planner-grid" />
    </div>
  );
}
