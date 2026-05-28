export type MaintPmScheduleDueInput = {
  interval_miles: number | null;
  interval_days: number | null;
  last_done_miles: number | null;
  last_done_date: string | null;
  next_due_miles: number | null;
  next_due_date: string | null;
};

export type MaintPmDueEvaluation = {
  next_due_miles: number | null;
  next_due_date: string | null;
  current_odometer_mi: number | null;
  miles_remaining: number | null;
  days_remaining: number | null;
  is_due: boolean;
  due_reasons: Array<"miles" | "date">;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function extractSamsaraOdometerMi(rawPayload: unknown): number | null {
  const root = asObject(rawPayload);
  if (!root) return null;

  const nested =
    asObject(root.data) ??
    asObject(root.vehicle) ??
    root;

  const candidates = [nested, root].filter((v): v is Record<string, unknown> => Boolean(v));
  for (const candidate of candidates) {
    const raw =
      candidate.odometer_mi ??
      candidate.odometerMiles ??
      candidate.odometer_miles ??
      candidate.odometer;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  }
  return null;
}

export function computeNextDueMiles(
  lastDoneMiles: number | null | undefined,
  intervalMiles: number | null | undefined
): number | null {
  if (lastDoneMiles == null || intervalMiles == null) return null;
  if (!Number.isFinite(lastDoneMiles) || !Number.isFinite(intervalMiles) || intervalMiles <= 0) return null;
  return Math.round(lastDoneMiles + intervalMiles);
}

export function computeNextDueDate(
  lastDoneDate: string | null | undefined,
  intervalDays: number | null | undefined
): string | null {
  if (!lastDoneDate || intervalDays == null) return null;
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  const base = new Date(`${lastDoneDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Math.round(intervalDays));
  return base.toISOString().slice(0, 10);
}

export function recomputePmScheduleDueFields(schedule: {
  interval_miles: number | null;
  interval_days: number | null;
  last_done_miles: number | null;
  last_done_date: string | null;
}): { next_due_miles: number | null; next_due_date: string | null } {
  return {
    next_due_miles: computeNextDueMiles(schedule.last_done_miles, schedule.interval_miles),
    next_due_date: computeNextDueDate(schedule.last_done_date, schedule.interval_days),
  };
}

function daysBetweenUtc(todayIso: string, targetDate: string | null): number | null {
  if (!targetDate) return null;
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const target = new Date(`${targetDate}T00:00:00.000Z`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function evaluatePmDue(
  schedule: MaintPmScheduleDueInput,
  currentOdometerMi: number | null,
  todayIso = new Date().toISOString().slice(0, 10)
): MaintPmDueEvaluation {
  const next_due_miles = schedule.next_due_miles ?? computeNextDueMiles(schedule.last_done_miles, schedule.interval_miles);
  const next_due_date = schedule.next_due_date ?? computeNextDueDate(schedule.last_done_date, schedule.interval_days);

  const miles_remaining =
    currentOdometerMi != null && next_due_miles != null ? next_due_miles - currentOdometerMi : null;
  const days_remaining = daysBetweenUtc(todayIso, next_due_date);

  const due_reasons: Array<"miles" | "date"> = [];
  if (currentOdometerMi != null && next_due_miles != null && currentOdometerMi >= next_due_miles) {
    due_reasons.push("miles");
  }
  if (next_due_date && todayIso >= next_due_date) {
    due_reasons.push("date");
  }

  return {
    next_due_miles,
    next_due_date,
    current_odometer_mi: currentOdometerMi,
    miles_remaining,
    days_remaining,
    is_due: due_reasons.length > 0,
    due_reasons,
  };
}
