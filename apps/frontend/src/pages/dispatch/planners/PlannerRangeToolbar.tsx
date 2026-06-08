import { PLANNER_RANGE_OPTIONS } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";

export function PlannerRangeToolbar() {
  const { windowDays, setWindowDays, range } = usePlannerRange();

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2 text-xs"
      data-testid="dispatch-planner-range-toolbar"
    >
      <span className="font-semibold text-gray-600">Range</span>
      {PLANNER_RANGE_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          className={`rounded px-2 py-1 ${windowDays === d ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-700"}`}
          onClick={() => setWindowDays(d)}
        >
          {d}d
        </button>
      ))}
      <span className="ml-2 text-gray-500">
        {range.start} through {range.end}
      </span>
    </div>
  );
}
