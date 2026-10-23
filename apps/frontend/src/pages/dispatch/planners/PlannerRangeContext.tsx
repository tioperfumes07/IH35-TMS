import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "../../../auth/useAuth";
import { DEFAULT_PLANNER_RANGE_DAYS, usePlannerRangeState, type PlannerRange, type PlannerRangeDays } from "./planner-range";

type PlannerRangeContextValue = {
  windowDays: PlannerRangeDays | null;
  setWindowDays: (days: PlannerRangeDays) => void;
  range: PlannerRange;
  setRange: (range: PlannerRange) => void;
  days: string[];
  /** LEAD 443.251 item 4 — "Show days" toggles (0 = Sun … 6 = Sat); hidden days are not drawn. */
  hiddenWeekdays: number[];
  setHiddenWeekdays: (next: number[]) => void;
  /** LEAD 443.251 item 6 — the signed-in user, so column widths persist per user. */
  storageScope: string;
};

const PlannerRangeContext = createContext<PlannerRangeContextValue | null>(null);

export function PlannerRangeProvider({ children }: { children: ReactNode }) {
  const state = usePlannerRangeState(DEFAULT_PLANNER_RANGE_DAYS);
  const auth = useAuth();
  const value = { ...state, storageScope: auth.user?.uuid ?? "anon" };
  return <PlannerRangeContext.Provider value={value}>{children}</PlannerRangeContext.Provider>;
}

/** For components that also render outside the planners shell (no provider → null). */
export function useOptionalPlannerRange() {
  return useContext(PlannerRangeContext);
}

export function usePlannerRange() {
  const ctx = useContext(PlannerRangeContext);
  if (!ctx) throw new Error("usePlannerRange must be used within PlannerRangeProvider");
  return ctx;
}
