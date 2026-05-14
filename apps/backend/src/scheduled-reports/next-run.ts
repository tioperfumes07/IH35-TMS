import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";

export type ScheduleFrequency = "daily" | "weekly" | "monthly" | "cron";

export type ScheduleInput = {
  frequency: ScheduleFrequency;
  /** HH:mm in `timezone` */
  run_time: string | null | undefined;
  /** 0–6 Sunday=0 when weekly */
  run_day_of_week: number | null | undefined;
  /** 1–31 when monthly */
  run_day_of_month: number | null | undefined;
  cron_expression: string | null | undefined;
  timezone: string;
};

function parseRunParts(runTime: string | null | undefined): { hour: number; minute: number } {
  const raw = runTime && /^\d{1,2}:\d{2}$/.test(runTime.trim()) ? runTime.trim() : "06:00";
  const [h, m] = raw.split(":").map((v) => Number(v));
  const hour = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 6;
  const minute = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0;
  return { hour, minute };
}

function luxonWeekdayFromSundayZero(dow: number): number {
  // Frontend / ticket: Sunday = 0 … Saturday = 6. Luxon: Monday = 1 … Sunday = 7.
  if (dow === 0) return 7;
  return dow;
}

export function computeNextRunAt(input: ScheduleInput, from: Date = new Date()): Date | null {
  const zone = input.timezone && input.timezone.trim() ? input.timezone.trim() : "America/Chicago";
  const { hour, minute } = parseRunParts(input.run_time);

  if (input.frequency === "cron") {
    const expr = String(input.cron_expression ?? "").trim();
    if (!expr) return null;
    try {
      const interval = CronExpressionParser.parse(expr, {
        tz: zone,
        currentDate: from,
      });
      return interval.next().toDate();
    } catch {
      return null;
    }
  }

  const nowZ = DateTime.fromJSDate(from, { zone: "utc" }).setZone(zone);
  if (!nowZ.isValid) return null;

  if (input.frequency === "daily") {
    let cand = nowZ.set({ hour, minute, second: 0, millisecond: 0 });
    if (cand <= nowZ) cand = cand.plus({ days: 1 });
    return cand.toUTC().toJSDate();
  }

  if (input.frequency === "weekly") {
    const dow = luxonWeekdayFromSundayZero(typeof input.run_day_of_week === "number" ? input.run_day_of_week : 1);
    let cand = nowZ.set({ weekday: dow as 1 | 2 | 3 | 4 | 5 | 6 | 7, hour, minute, second: 0, millisecond: 0 });
    if (cand <= nowZ) cand = cand.plus({ weeks: 1 });
    return cand.toUTC().toJSDate();
  }

  if (input.frequency === "monthly") {
    const dom = typeof input.run_day_of_month === "number" ? input.run_day_of_month : 1;
    const clampDay = (dt: DateTime, day: number) => {
      const dim = dt.daysInMonth ?? day;
      const safe = Math.min(Math.max(1, day), dim);
      return dt.set({ day: safe });
    };

    let cand = clampDay(nowZ.set({ hour, minute, second: 0, millisecond: 0 }), dom);
    if (cand <= nowZ) cand = clampDay(nowZ.plus({ months: 1 }).startOf("month").set({ hour, minute, second: 0, millisecond: 0 }), dom);
    return cand.toUTC().toJSDate();
  }

  return null;
}

export type PeriodRange = {
  label: string;
  startIso: string;
  endIso: string;
};

export function computeDeliveryPeriod(frequency: ScheduleFrequency, timezone: string, from: Date = new Date()): PeriodRange {
  const zone = timezone && timezone.trim() ? timezone.trim() : "America/Chicago";
  const nowZ = DateTime.fromJSDate(from, { zone: "utc" }).setZone(zone);
  if (!nowZ.isValid) {
    const iso = new Date().toISOString();
    return { label: "Current period", startIso: iso, endIso: iso };
  }

  if (frequency === "daily") {
    const day = nowZ.minus({ days: 1 }).startOf("day");
    const start = day;
    const end = day.endOf("day");
    return {
      label: `${start.toFormat("MMM d, yyyy")} (daily)`,
      startIso: start.toUTC().toISO() ?? start.toISO() ?? "",
      endIso: end.toUTC().toISO() ?? end.toISO() ?? "",
    };
  }

  if (frequency === "weekly") {
    const anchor = nowZ.startOf("day");
    const prevWeekStart = anchor.minus({ weeks: 1 }).startOf("week");
    const prevWeekEnd = anchor.minus({ weeks: 1 }).endOf("week");
    return {
      label: `${prevWeekStart.toFormat("MMM d")} – ${prevWeekEnd.toFormat("MMM d, yyyy")} (weekly)`,
      startIso: prevWeekStart.toUTC().toISO() ?? prevWeekStart.toISO() ?? "",
      endIso: prevWeekEnd.toUTC().toISO() ?? prevWeekEnd.toISO() ?? "",
    };
  }

  if (frequency === "monthly") {
    const lastMonth = nowZ.minus({ months: 1 });
    const start = lastMonth.startOf("month");
    const end = lastMonth.endOf("month");
    return {
      label: `${start.toFormat("MMMM yyyy")} (monthly)`,
      startIso: start.toUTC().toISO() ?? start.toISO() ?? "",
      endIso: end.toUTC().toISO() ?? end.toISO() ?? "",
    };
  }

  const end = nowZ;
  const start = nowZ.minus({ hours: 24 });
  return {
    label: `${start.toFormat("MMM d, HH:mm")} – ${end.toFormat("MMM d, HH:mm")} (${zone})`,
    startIso: start.toUTC().toISO() ?? start.toISO() ?? "",
    endIso: end.toUTC().toISO() ?? end.toISO() ?? "",
  };
}

export function scheduleInputFromDbRow(row: Record<string, unknown>): ScheduleInput {
  return {
    frequency: String(row.frequency ?? "daily") as ScheduleFrequency,
    run_time: row.run_time ? String(row.run_time).slice(0, 5) : "06:00",
    run_day_of_week:
      typeof row.run_day_of_week === "number" ? row.run_day_of_week : row.run_day_of_week != null ? Number(row.run_day_of_week) : null,
    run_day_of_month:
      typeof row.run_day_of_month === "number" ? row.run_day_of_month : row.run_day_of_month != null ? Number(row.run_day_of_month) : null,
    cron_expression: row.cron_expression ? String(row.cron_expression) : null,
    timezone: row.timezone ? String(row.timezone) : "America/Chicago",
  };
}
