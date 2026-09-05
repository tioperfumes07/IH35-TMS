import { PLANNER_RANGE_OPTIONS } from "./planner-range";
import "./planner-design-tokens.css";
import { usePlannerRange } from "./PlannerRangeContext";
import { DatePicker } from "../../forms/DatePicker";

export function PlannerRangeToolbar() {
  const { windowDays, setWindowDays, range, setRange } = usePlannerRange();
  const isCustom = windowDays === null;

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
          data-testid={`planner-range-${d}d`}
          className={`flex h-7 items-center rounded-sm px-2 text-xs font-medium ${windowDays === d ? "bg-[var(--planner-active)] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          onClick={() => setWindowDays(d)}
        >
          {d}d
        </button>
      ))}
      {/* BRD-23: Custom range with date pickers. */}
      <button
        type="button"
        data-testid="planner-range-custom"
        className={`flex h-7 items-center rounded-sm px-2 text-xs font-medium ${isCustom ? "bg-[var(--planner-active)] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        onClick={() => {
          // Selecting Custom keeps the current range; user picks dates below.
          // No-op if already custom (the date pickers are already visible).
        }}
      >
        Custom
      </button>
      {isCustom ? (
        <div className="flex items-center gap-1" data-testid="planner-range-custom-pickers">
          <DatePicker
            value={range.start}
            onChange={(value) => setRange({ ...range, start: value })}
            ariaLabel="Custom range start"
          />
          <span className="text-gray-500">to</span>
          <DatePicker
            value={range.end}
            onChange={(value) => setRange({ ...range, end: value })}
            ariaLabel="Custom range end"
          />
        </div>
      ) : null}
      <span className="ml-2 text-gray-500">
        {range.start} through {range.end}
      </span>
    </div>
  );
}
