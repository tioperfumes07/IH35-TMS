import { useMemo, useState } from "react";
import { companyToday } from "../../../lib/businessDate";

// BRD-23: calendar ranges are 7d / 14d / 30d / custom. The old 40d preset is removed —
// operators who need a custom span pick Custom and use the date pickers.
export const PLANNER_RANGE_OPTIONS = [7, 14, 30] as const;
export type PlannerRangeDays = (typeof PLANNER_RANGE_OPTIONS)[number];
// ROUND 20.6 S6 (owner-live 2026-09-12): 30d put every real bar in the last two columns on all
// four tabs -- 28 of 30 day columns empty every time, because most planner data clusters near
// "today" (an end-anchored window). 7d actually matches where the data lives.
export const DEFAULT_PLANNER_RANGE_DAYS: PlannerRangeDays = 7;

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

/** B-3: widen the planner range to include the given min/max YMD dates.
 *  Only expands — never shrinks the existing range. Returns the new range
 *  so the caller can pass it to setRange(). */
export function widenPlannerRange(range: PlannerRange, minYmd: string, maxYmd: string): PlannerRange {
  return {
    start: minYmd < range.start ? minYmd : range.start,
    end: maxYmd > range.end ? maxYmd : range.end,
  };
}

/** 0 = Sunday … 6 = Saturday (UTC weekday of a YYYY-MM-DD calendar day). */
export function plannerWeekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** LEAD 443.251 item 5: only the selected weekdays are drawn — a hidden day is not an empty column, it is gone. */
export function visiblePlannerDays(range: PlannerRange, hiddenWeekdays: readonly number[]): string[] {
  const all = listPlannerDays(range);
  if (hiddenWeekdays.length === 0) return all;
  const shown = all.filter((d) => !hiddenWeekdays.includes(plannerWeekdayIndex(d)));
  // Hiding every day of a range is never an empty board — fall back to the full range.
  return shown.length > 0 ? shown : all;
}

export type PlannerPresetKey = "today" | "this_week" | "next_7" | "next_14";

/** LEAD 443.251 item 4 presets (Filters popover): Today, This week (Mon–Sun), Next 7 days, 14 days. */
export function plannerPresetRange(key: PlannerPresetKey, todayIso: string = companyToday()): PlannerRange {
  if (key === "today") return { start: todayIso, end: todayIso };
  if (key === "this_week") {
    const back = (plannerWeekdayIndex(todayIso) + 6) % 7; // Monday-start week
    const start = addDaysIso(todayIso, -back);
    return { start, end: addDaysIso(start, 6) };
  }
  if (key === "next_7") return { start: todayIso, end: addDaysIso(todayIso, 6) };
  return { start: todayIso, end: addDaysIso(todayIso, 13) };
}

const HIDDEN_WEEKDAYS_KEY = "ih35.planner.hiddenWeekdays";

function readHiddenWeekdays(): number[] {
  try {
    const raw = localStorage.getItem(HIDDEN_WEEKDAYS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  } catch {
    return [];
  }
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
  const [hiddenWeekdays, setHiddenWeekdaysState] = useState<number[]>(readHiddenWeekdays);
  const setHiddenWeekdays = (next: number[]) => {
    const clean = [...new Set(next)].filter((n) => n >= 0 && n <= 6).sort();
    setHiddenWeekdaysState(clean);
    try {
      localStorage.setItem(HIDDEN_WEEKDAYS_KEY, JSON.stringify(clean));
    } catch {
      /* private mode — the toggle still applies for this session */
    }
  };
  const days = useMemo(() => visiblePlannerDays(range, hiddenWeekdays), [range, hiddenWeekdays]);
  return { windowDays, setWindowDays, setRange, range, days, hiddenWeekdays, setHiddenWeekdays };
}
