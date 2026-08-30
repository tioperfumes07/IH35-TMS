import { useMemo, useState } from "react";
import { companyToday } from "../../../lib/businessDate";

export const PLANNER_RANGE_OPTIONS = [7, 14, 30, 40] as const;
export type PlannerRangeDays = (typeof PLANNER_RANGE_OPTIONS)[number];
export const DEFAULT_PLANNER_RANGE_DAYS: PlannerRangeDays = 30;

export type PlannerRange = {
  start: string;
  end: string;
};

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** End-anchored window ending today (or endIso) so operators can see last week, not only forward. */
export function buildPlannerRange(windowDays: number, endIso?: string): PlannerRange {
  const end = endIso ?? companyToday();
  return { start: addDaysIso(end, -(windowDays - 1)), end };
}

export function listPlannerDays(range: PlannerRange): string[] {
  const out: string[] = [];
  let cur = range.start;
  while (cur <= range.end) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

export function usePlannerRangeState(initialDays: PlannerRangeDays = DEFAULT_PLANNER_RANGE_DAYS) {
  const [range, setRangeState] = useState<PlannerRange>(() => buildPlannerRange(initialDays));
  const rangeLength = useMemo(() => {
    const start = Date.parse(`${range.start}T00:00:00Z`);
    const end = Date.parse(`${range.end}T00:00:00Z`);
    return Math.round((end - start) / 86_400_000) + 1;
  }, [range.end, range.start]);
  const windowDays = PLANNER_RANGE_OPTIONS.includes(rangeLength as PlannerRangeDays)
    ? (rangeLength as PlannerRangeDays)
    : null;
  const setWindowDays = (days: PlannerRangeDays) => {
    // Keep the end anchor (usually today); widen/narrow backward.
    setRangeState(buildPlannerRange(days, range.end));
  };
  const setRange = (next: PlannerRange) => {
    if (next.start > next.end) return;
    setRangeState(next);
  };
  const days = useMemo(() => listPlannerDays(range), [range.start, range.end]);
  return { windowDays, setWindowDays, setRange, range, days };
}
