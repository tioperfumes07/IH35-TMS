export type HosDutyStatus =
  | "off_duty"
  | "sleeper"
  | "driving"
  | "on_duty_not_driving"
  | "personal_conveyance"
  | "yard_moves";

export type HosDutyStatusEvent = {
  started_at: string;
  ended_at: string | null;
  duty_status: HosDutyStatus;
};

export type HosClocks = {
  drive_remaining_min: number;
  window_remaining_min: number;
  break_remaining_min: number;
  cycle_remaining_min: number;
  // Minutes until the 70h/8-day cycle begins recovering — i.e. when the OLDEST on-duty segment
  // still inside the rolling 8-day window rolls off and those hours come back. null when there is
  // no on-duty time in the window (nothing to recover; full cycle available). This is the
  // dispatch "Hrs to reset" value, derived from the 8-day on-duty summary (no Samsara, no feed).
  cycle_reset_in_min: number | null;
  last_reset_at: string | null;
  status: "ok" | "warning_1hr" | "warning_15min" | "violation";
};

type DbClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

// COHERENCE GUARD (false-violation killer): an internally-impossible clock set means the driver's event stream is
// INCOMPLETE/gapped and computeHosClocks filled the holes — it must render "unavailable", NEVER a "violation".
// - You cannot have driven the full 11h (drive_remaining 0) while the 8h-driving break clock is untouched
//   (break_remaining > 0): passing 8h of driving forces the 30-min break, so break_remaining would be 0.
// - You cannot have a fully-consumed 14h window (window_remaining 0) with an essentially-untouched break.
// (Live case: HUGO GAYTAN drive=0/win=0/cyc=0/brk=459 — gapped stream, falsely flagged violation.)
export function hosClocksCoherent(c: {
  drive_remaining_min: number;
  window_remaining_min: number;
  break_remaining_min: number;
}): boolean {
  if (c.drive_remaining_min <= 0 && c.break_remaining_min > 0) return false;
  if (c.window_remaining_min <= 0 && c.break_remaining_min > 30) return false;
  return true;
}

const TEN_HOURS_MIN = 10 * 60;
const ELEVEN_HOURS_MIN = 11 * 60;
const FOURTEEN_HOURS_MIN = 14 * 60;
const EIGHT_HOURS_MIN = 8 * 60;
const BREAK_MIN = 30;
const CYCLE_70_EIGHT_DAYS_MIN = 70 * 60;
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  return (end.getTime() - start.getTime()) / 60000;
}

function overlapMinutes(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number {
  if (rangeEnd <= rangeStart || end <= rangeStart || start >= rangeEnd) return 0;
  const s = start > rangeStart ? start : rangeStart;
  const e = end < rangeEnd ? end : rangeEnd;
  return minutesBetween(s, e);
}

function isResetDuty(status: HosDutyStatus): boolean {
  return status === "off_duty" || status === "sleeper" || status === "personal_conveyance";
}

function isDriving(status: HosDutyStatus): boolean {
  return status === "driving";
}

function isOnDutyForCycle(status: HosDutyStatus): boolean {
  return status === "driving" || status === "on_duty_not_driving" || status === "yard_moves";
}

export type FlatDutySegment = { duty_status: HosDutyStatus; start: Date; end: Date };

// NON-OVERLAPPING reconstruction of the duty timeline (the ELD reality: one duty status at a time). Each segment
// ENDS when the next begins — so overlapping / duplicate / never-logged-out (open-ended) ingested segments don't get
// their durations SUMMED into impossible totals. Without this, on-duty time over-counts (GUARD: CAZARES 06-14 summed
// to 35h in a 24h day -> the 8-day cycle clamped to 0 -> a FALSE violation). Used by BOTH the clocks and the daily
// breakdown so they agree. Zero-length clips are dropped.
export function flattenDutySegments(events: HosDutyStatusEvent[], asOf: Date): FlatDutySegment[] {
  const sorted = events
    .map((event) => ({ duty_status: event.duty_status, start: asDate(event.started_at), end: asDate(event.ended_at) ?? asOf }))
    .filter((event): event is FlatDutySegment => Boolean(event.start))
    .filter((event) => event.start < asOf)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return sorted
    .map((event, i) => {
      const nextStart = i + 1 < sorted.length ? sorted[i + 1].start : asOf;
      const end = event.end < nextStart ? event.end : nextStart;
      return { duty_status: event.duty_status, start: event.start, end };
    })
    .filter((event) => event.end > event.start);
}

export type DailyDutySummaryRow = { service_day: string; duty_status: HosDutyStatus; total_minutes: number };

// HOS-F6312 — the "Last 8 days summary" panel (DriverHosDetailPage.tsx) was computed by a raw SQL
// SUM over hos.duty_status_events, grouped by the CALENDAR DAY THE EVENT STARTED. That query never
// got the same NON-OVERLAPPING flattening `computeHosClocks` above already required (see its own
// comment: "overlapping / duplicate / never-logged-out ingested segments don't get their durations
// SUMMED into impossible totals... GUARD: CAZARES 06-14 summed to 35h in a 24h day"). ELD ingest
// legitimately writes many overlapping/duplicate rows for the same real duty period (a polling
// snapshot pattern) into this append-only table — live-confirmed for driver 40823a77-… on
// 2026-08-20: ~15 "driving" events all sharing one ended_at, with staggered started_at 20:19-22:09,
// summing to 141h+ for a single calendar day. Reusing flattenDutySegments() here — the SAME
// event-shape, SAME overlap-safety guarantee already proven for the clocks panel — then splitting
// each flat (non-overlapping) segment across the calendar-day boundaries it spans, so a segment
// that legitimately runs past midnight contributes to both days' totals correctly instead of all
// of it landing in the start day's bucket.
export function computeDailyDutySummary(
  events: HosDutyStatusEvent[],
  windowDays: number,
  asOfInput: Date = new Date()
): DailyDutySummaryRow[] {
  const asOf = new Date(asOfInput);
  const windowStart = new Date(asOf.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const flattened = flattenDutySegments(events, asOf);
  const totals = new Map<string, number>();
  for (const segment of flattened) {
    if (segment.end <= windowStart) continue;
    const clippedStart = segment.start < windowStart ? windowStart : segment.start;
    // Walk the segment day by day so a span crossing midnight (or several midnights) contributes
    // its real share of minutes to EACH calendar day it touches, not just the day it started.
    let cursor = new Date(clippedStart);
    while (cursor < segment.end) {
      const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const minutes = overlapMinutes(segment.start, segment.end, dayStart, dayEnd);
      if (minutes > 0) {
        const key = `${dayStart.toISOString().slice(0, 10)} ${segment.duty_status}`;
        totals.set(key, (totals.get(key) ?? 0) + minutes);
      }
      cursor = dayEnd;
    }
  }
  return Array.from(totals.entries())
    .map(([key, minutes]) => {
      const [service_day, duty_status] = key.split(" ") as [string, HosDutyStatus];
      return { service_day, duty_status, total_minutes: Math.floor(minutes) };
    })
    .sort((a, b) => (a.service_day === b.service_day ? a.duty_status.localeCompare(b.duty_status) : b.service_day.localeCompare(a.service_day)));
}

export function computeHosClocks(events: HosDutyStatusEvent[], asOfInput: Date = new Date()): HosClocks {
  const asOf = new Date(asOfInput);
  const flattened = flattenDutySegments(events, asOf);

  if (flattened.length === 0) {
    return {
      drive_remaining_min: ELEVEN_HOURS_MIN,
      window_remaining_min: FOURTEEN_HOURS_MIN,
      break_remaining_min: EIGHT_HOURS_MIN,
      cycle_remaining_min: CYCLE_70_EIGHT_DAYS_MIN,
      cycle_reset_in_min: null,
      last_reset_at: null,
      status: "ok",
    };
  }

  let resetAccumulator = 0;
  let lastResetAt: Date | null = null;
  for (const event of flattened) {
    const segmentEnd = event.end < asOf ? event.end : asOf;
    const segmentMin = minutesBetween(event.start, segmentEnd);
    if (segmentMin <= 0) continue;
    if (isResetDuty(event.duty_status)) {
      resetAccumulator += segmentMin;
      if (resetAccumulator >= TEN_HOURS_MIN) {
        lastResetAt = new Date(segmentEnd);
      }
    } else {
      resetAccumulator = 0;
    }
  }

  const resetBase = lastResetAt ?? flattened[0].start;
  let drivingSinceReset = 0;
  let drivingSinceBreak = 0;
  let nonDrivingStreak = 0;
  for (const event of flattened) {
    const segmentEnd = event.end < asOf ? event.end : asOf;
    const segmentMinutes = overlapMinutes(event.start, segmentEnd, resetBase, asOf);
    if (segmentMinutes <= 0) continue;
    if (isDriving(event.duty_status)) {
      drivingSinceReset += segmentMinutes;
      drivingSinceBreak += segmentMinutes;
      nonDrivingStreak = 0;
      continue;
    }
    nonDrivingStreak += segmentMinutes;
    if (nonDrivingStreak >= BREAK_MIN) {
      drivingSinceBreak = 0;
    }
  }

  const cycleWindowStart = new Date(asOf.getTime() - EIGHT_DAYS_MS);
  let cycleOnDuty = 0;
  let earliestOnDutyInWindow: Date | null = null;
  for (const event of flattened) {
    if (!isOnDutyForCycle(event.duty_status)) continue;
    const segmentEnd = event.end < asOf ? event.end : asOf;
    if (overlapMinutes(event.start, segmentEnd, cycleWindowStart, asOf) <= 0) continue;
    cycleOnDuty += overlapMinutes(event.start, segmentEnd, cycleWindowStart, asOf);
    // The recovering edge is where the segment actually sits inside the window.
    const inWindowStart = event.start > cycleWindowStart ? event.start : cycleWindowStart;
    if (!earliestOnDutyInWindow || inWindowStart < earliestOnDutyInWindow) earliestOnDutyInWindow = inWindowStart;
  }
  // Hrs to reset: when the oldest in-window on-duty time ages out of the 8-day window, the cycle
  // starts recovering. Floor at 0; null when there is no on-duty time in the window.
  const cycleResetInMin = earliestOnDutyInWindow
    ? Math.max(0, Math.floor((earliestOnDutyInWindow.getTime() + EIGHT_DAYS_MS - asOf.getTime()) / 60000))
    : null;

  const driveRemaining = Math.max(0, Math.floor(ELEVEN_HOURS_MIN - drivingSinceReset));
  const windowElapsed = minutesBetween(resetBase, asOf);
  const windowRemaining = Math.max(0, Math.floor(FOURTEEN_HOURS_MIN - windowElapsed));
  const breakRemaining = Math.max(0, Math.floor(EIGHT_HOURS_MIN - drivingSinceBreak));
  const cycleRemaining = Math.max(0, Math.floor(CYCLE_70_EIGHT_DAYS_MIN - cycleOnDuty));

  const minimum = Math.min(driveRemaining, windowRemaining, breakRemaining, cycleRemaining);
  const status: HosClocks["status"] =
    minimum <= 0 ? "violation" : minimum <= 15 ? "warning_15min" : minimum <= 60 ? "warning_1hr" : "ok";

  return {
    drive_remaining_min: driveRemaining,
    window_remaining_min: windowRemaining,
    break_remaining_min: breakRemaining,
    cycle_remaining_min: cycleRemaining,
    cycle_reset_in_min: cycleResetInMin,
    last_reset_at: lastResetAt ? lastResetAt.toISOString() : null,
    status,
  };
}

export async function getCurrentClocks(client: DbClient, operatingCompanyId: string, driverId: string, asOf = new Date()): Promise<HosClocks> {
  const res = await client.query<HosDutyStatusEvent>(
    `
      SELECT
        e.started_at::text,
        e.ended_at::text,
        e.duty_status
      FROM hos.duty_status_events e
      WHERE e.operating_company_id = $1::uuid
        AND (e.driver_id = $2::uuid
          OR e.driver_id IN (
            SELECT id FROM mdata.drivers
            WHERE operating_company_id = $1::uuid
              AND merged_into_driver_id = $2::uuid
          ))
      ORDER BY e.started_at ASC
    `,
    [operatingCompanyId, driverId]
  );
  return computeHosClocks(res.rows, asOf);
}

// Batched equivalent of getCurrentClocks for many drivers in ONE query (kills the planner N+1).
// Returns a Map keyed by driver id with EVERY requested driver present — a driver with no events
// gets computeHosClocks([]) exactly like the per-driver path. Rows are grouped in id order then by
// started_at ASC, identical to the single-driver query, so computeHosClocks sees the same input and
// produces the same status. One asOf is used so all drivers are computed against the same instant.
export async function getCurrentClocksForDrivers(
  client: DbClient,
  operatingCompanyId: string,
  driverIds: string[],
  asOf = new Date()
): Promise<Map<string, HosClocks>> {
  const result = new Map<string, HosClocks>();
  if (driverIds.length === 0) return result;
  // Expand each queried driver ID to also include any shells merged into it, grouping
  // results back under the canonical (queried) driver ID.
  const res = await client.query<HosDutyStatusEvent & { canonical_driver_id: string }>(
    `
      WITH canonical AS (
        SELECT d.id AS canonical_id,
               UNNEST(ARRAY[d.id] || COALESCE(
                 ARRAY(SELECT id FROM mdata.drivers
                       WHERE operating_company_id = $1::uuid
                         AND merged_into_driver_id = d.id),
                 ARRAY[]::uuid[]
               )) AS shell_id
        FROM mdata.drivers d
        WHERE d.operating_company_id = $1::uuid
          AND d.id = ANY($2::uuid[])
      )
      SELECT
        c.canonical_id::text AS canonical_driver_id,
        e.started_at::text,
        e.ended_at::text,
        e.duty_status
      FROM canonical c
      JOIN hos.duty_status_events e
        ON e.driver_id = c.shell_id
        AND e.operating_company_id = $1::uuid
      ORDER BY c.canonical_id, e.started_at ASC
    `,
    [operatingCompanyId, driverIds]
  );
  const byDriver = new Map<string, HosDutyStatusEvent[]>();
  for (const row of res.rows) {
    const arr = byDriver.get(row.canonical_driver_id) ?? [];
    arr.push({ started_at: row.started_at, ended_at: row.ended_at, duty_status: row.duty_status });
    byDriver.set(row.canonical_driver_id, arr);
  }
  for (const driverId of driverIds) {
    result.set(driverId, computeHosClocks(byDriver.get(driverId) ?? [], asOf));
  }
  return result;
}
