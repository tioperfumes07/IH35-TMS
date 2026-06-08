import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PLANNER_RANGE_DAYS, usePlannerRangeState, type PlannerRange, type PlannerRangeDays } from "./planner-range";

type PlannerRangeContextValue = {
  windowDays: PlannerRangeDays;
  setWindowDays: (days: PlannerRangeDays) => void;
  range: PlannerRange;
  days: string[];
};

const PlannerRangeContext = createContext<PlannerRangeContextValue | null>(null);

export function PlannerRangeProvider({ children }: { children: ReactNode }) {
  const value = usePlannerRangeState(DEFAULT_PLANNER_RANGE_DAYS);
  return <PlannerRangeContext.Provider value={value}>{children}</PlannerRangeContext.Provider>;
}

export function usePlannerRange() {
  const ctx = useContext(PlannerRangeContext);
  if (!ctx) throw new Error("usePlannerRange must be used within PlannerRangeProvider");
  return ctx;
}
