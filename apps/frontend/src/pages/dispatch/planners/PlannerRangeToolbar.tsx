import { PLANNER_RANGE_OPTIONS } from "./planner-range";
import "./planner-design-tokens.css";
import { usePlannerRange } from "./PlannerRangeContext";

export function PlannerRangeToolbar() {
  const { windowDays, setWindowDays, range } = usePlannerRange();

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white p-2 text-xs"
      data-testid="dispatch-planner-range-toolbar"
    >
      <span className="font-semibold text-gray-600">Range</span>
      {PLANNER_RANGE_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          className={`flex h-7 items-center rounded-sm px-2 text-xs font-medium ${windowDays === d ? "bg-[var(--planner-active)] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
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
