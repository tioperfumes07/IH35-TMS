/**
 * V3 — Timeline Planner (additive tab in Dispatch Planners).
 * Read-only timeline view of scheduled loads / driver assignments.
 * Non-financial: dispatch display only, no GL writes.
 */
import { usePlannerRange } from "./PlannerRangeContext";

export function TimelinePlanner() {
  const { range } = usePlannerRange();
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <p className="text-sm font-medium text-gray-700">Timeline Planner</p>
      <p className="mt-1 text-xs text-gray-500">
        {range.start} → {range.end}
      </p>
      <p className="mt-4 text-sm text-gray-400">
        Gantt-style timeline visualization — V3 additive tab.
      </p>
    </div>
  );
}
