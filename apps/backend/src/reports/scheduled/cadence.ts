import { DateTime } from "luxon";

export type SubscriptionCadence = "daily" | "weekly" | "monthly" | "quarterly";

export type CadenceInput = {
  cadence: SubscriptionCadence;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDay: string;
  timezone: string;
};

function parseTimeOfDay(raw: string): { hour: number; minute: number } {
  const trimmed = raw.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return { hour: 6, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

function luxonWeekdayFromSundayZero(dow: number): number {
  if (dow === 0) return 7;
  return dow;
}

function nextQuarterlyIftaPreview(nowZ: DateTime, hour: number, minute: number): DateTime {
  const quarterEnds = [
    { month: 3, day: 31 },
    { month: 6, day: 30 },
    { month: 9, day: 30 },
    { month: 12, day: 31 },
  ];

  const candidates: DateTime[] = [];
  for (let year = nowZ.year - 1; year <= nowZ.year + 1; year += 1) {
    for (const q of quarterEnds) {
      const quarterEnd = DateTime.fromObject(
        { year, month: q.month, day: q.day, hour, minute, second: 0, millisecond: 0 },
        { zone: nowZ.zoneName ?? "America/Chicago" }
      );
      if (!quarterEnd.isValid) continue;
      candidates.push(quarterEnd.plus({ days: 7 }));
    }
  }

  const future = candidates.filter((c) => c > nowZ).sort((a, b) => a.toMillis() - b.toMillis());
  return future[0] ?? nowZ.plus({ months: 3 });
}

export function computeNextScheduledAt(input: CadenceInput, from: Date = new Date()): Date {
  const zone = input.timezone?.trim() || "America/Chicago";
  const { hour, minute } = parseTimeOfDay(input.timeOfDay);
  const nowZ = DateTime.fromJSDate(from, { zone: "utc" }).setZone(zone);
  if (!nowZ.isValid) return from;

  if (input.cadence === "daily") {
    let cand = nowZ.set({ hour, minute, second: 0, millisecond: 0 });
    if (cand <= nowZ) cand = cand.plus({ days: 1 });
    return cand.toUTC().toJSDate();
  }

  if (input.cadence === "weekly") {
    const dow = luxonWeekdayFromSundayZero(typeof input.dayOfWeek === "number" ? input.dayOfWeek : 1);
    let cand = nowZ.set({ weekday: dow as 1 | 2 | 3 | 4 | 5 | 6 | 7, hour, minute, second: 0, millisecond: 0 });
    if (cand <= nowZ) cand = cand.plus({ weeks: 1 });
    return cand.toUTC().toJSDate();
  }

  if (input.cadence === "monthly") {
    const dom = typeof input.dayOfMonth === "number" ? input.dayOfMonth : 1;
    const clampDay = (dt: DateTime, day: number) => {
      const dim = dt.daysInMonth ?? day;
      const safe = Math.min(Math.max(1, day), dim);
      return dt.set({ day: safe });
    };
    let cand = clampDay(nowZ.set({ hour, minute, second: 0, millisecond: 0 }), dom);
    if (cand <= nowZ) {
      cand = clampDay(nowZ.plus({ months: 1 }).startOf("month").set({ hour, minute, second: 0, millisecond: 0 }), dom);
    }
    return cand.toUTC().toJSDate();
  }

  return nextQuarterlyIftaPreview(nowZ, hour, minute).toUTC().toJSDate();
}

export const Q8_DEFAULT_REPORT_SLUGS = [
  "weekly-cash-position",
  "weekly-driver-settlement-preview",
  "weekly-ar-aging-60",
  "monthly-pnl",
  "quarterly-ifta-preview",
  "daily-safety-alerts-digest",
] as const;

export type Q8ReportSlug = (typeof Q8_DEFAULT_REPORT_SLUGS)[number];

export const Q8_REPORT_LABELS: Record<Q8ReportSlug, string> = {
  "weekly-cash-position": "Weekly cash position",
  "weekly-driver-settlement-preview": "Weekly driver settlement preview",
  "weekly-ar-aging-60": "Weekly A/R aging > 60 days",
  "monthly-pnl": "Monthly P&L",
  "quarterly-ifta-preview": "Quarterly IFTA preview",
  "daily-safety-alerts-digest": "Daily safety alerts digest",
};
