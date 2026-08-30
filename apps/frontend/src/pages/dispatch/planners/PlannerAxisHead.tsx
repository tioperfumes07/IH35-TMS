import type { ReactNode } from "react";
import {
  plannerDayHeadClass,
  plannerMonthBands,
  plannerWeekdayShort,
  todayYmdAmericaChicago,
} from "./plannerTimeAxis";

const FROZEN =
  "sticky left-0 z-20 border-b border-r-2 border-slate-400 bg-gray-50 px-2 py-1 text-left text-[10px] font-semibold text-slate-700";

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
            className="border-b border-l border-slate-300 bg-slate-50 px-1 py-0 text-left text-[10px] font-semibold text-slate-600"
          >
            {b.label}
          </th>
        ))}
      </tr>
      <tr data-testid="planner-axis-day-row">
        {frozenDayCells}
        {days.map((d) => (
          <th key={d} className={plannerDayHeadClass(d, today)}>
            <span className="block text-[9px] leading-none">{plannerWeekdayShort(d)}</span>
            <span className="block text-[10px] leading-tight">{Number(d.slice(8, 10))}</span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function plannerFrozenThClass(sticky = false): string {
  return [
    sticky ? "sticky left-0 z-20" : "",
    "border-b border-r-2 border-slate-400 bg-gray-50 px-2 py-1 text-left text-[10px] font-semibold text-slate-700",
  ]
    .filter(Boolean)
    .join(" ");
}
