import { useMemo, useState } from "react";

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

export function buildPlannerRange(windowDays: number, startIso?: string): PlannerRange {
  const start = startIso ?? new Date().toISOString().slice(0, 10);
  return { start, end: addDaysIso(start, windowDays - 1) };
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
  const [windowDays, setWindowDays] = useState<PlannerRangeDays>(initialDays);
  const range = useMemo(() => buildPlannerRange(windowDays), [windowDays]);
  const days = useMemo(() => listPlannerDays(range), [range.start, range.end]);
  return { windowDays, setWindowDays, range, days };
}
