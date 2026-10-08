import type { ReactNode } from "react";
import {
  plannerDayHeadClass,
  plannerMonthBands,
  plannerWeekdayShort,
  todayYmdAmericaChicago,
} from "./plannerTimeAxis";
import { formatPlannerDayLabel } from "./plannerDayLabel";

const FROZEN =
  "sticky left-0 z-20 border-b border-r-2 border-[#6B7280] bg-gray-50 px-2 py-1 text-left text-xs font-semibold text-[#1F2A44]";

type PlannerAxisHeadProps = {
  days: string[];
  frozenColSpan: number;
  frozenDayCells: ReactNode;
};

export function PlannerAxisHead({ days, frozenColSpan, frozenDayCells }: PlannerAxisHeadProps) {
  const today = todayYmdAmericaChicago();
  const bands = plannerMonthBands(days);
  return (
    <thead data-testid="planner-time-axis">
      <tr data-testid="planner-axis-month-row">
        <th colSpan={frozenColSpan} className={FROZEN} />
        {bands.map((b) => (
          <th
            key={b.key}
            colSpan={b.span}
            className="border-b border-l border-[#E5E7EB] bg-[#F7F8FA] px-1 py-0 text-left text-xs font-semibold text-[#4B5563]"
          >
            {b.label}
          </th>
        ))}
      </tr>
      <tr data-testid="planner-axis-day-row">
        {frozenDayCells}
        {days.map((d) => (
          <th key={d} className={plannerDayHeadClass(d, today)}>
            <span className="block text-xs leading-none text-[#6B7280]">{plannerWeekdayShort(d)}</span>
            <span className="block text-xs font-semibold leading-tight text-[#1F2A44]">{formatPlannerDayLabel(d)}</span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function plannerFrozenThClass(sticky = false): string {
  return [
    sticky ? "sticky left-0 z-20" : "",
    "border-b border-r-2 border-[#6B7280] bg-gray-50 px-2 py-1 text-left text-xs font-semibold text-[#1F2A44]",
  ]
    .filter(Boolean)
    .join(" ");
}
