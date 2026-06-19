// HOS Tracker (Compliance "HOS Tracker" tab) — per-driver daily duty-status timeline + clocks, read from the
// already-ingested hos.duty_status_events (filled by the Samsara HOS pull). HONEST: a driver-day with NO events
// reads "unavailable" with null clocks and an empty timeline — never a guessed default and never a violation on
// missing data. The #1218 atomic per-driver savepoint + #1220 canonical mapping guarantee a driver's events are
// all-or-nothing, so "has events" == complete; "no events" == unavailable.
import { computeHosClocks, hosClocksCoherent, type HosClocks, type HosDutyStatus, type HosDutyStatusEvent } from "./hos-clocks.service.js";

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

const LAREDO_TZ = "America/Chicago";
const CYCLE_70_MIN = 70 * 60;

// Offset (minutes, local - UTC) for the Laredo zone at a given instant — DST-correct.
function tzOffsetMinutes(date: Date): number {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tz = new Date(date.toLocaleString("en-US", { timeZone: LAREDO_TZ }));
  return Math.round((tz.getTime() - utc.getTime()) / 60000);
}

// UTC window [start, end) for a Laredo calendar day "YYYY-MM-DD".
function laredoDayWindowUtc(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const offNoon = tzOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12))); // noon avoids DST-midnight edge
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offNoon * 60000);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start, end };
}

const CT = new Intl.DateTimeFormat("en-US", {
  timeZone: LAREDO_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
});
function hmCt(d: Date): string {
  return `${CT.format(d)} CT`;
}

export type HosSegment = {
  duty_status: HosDutyStatus;
  start_utc: string;
  end_utc: string;
  start_ct: string;
  end_ct: string;
  minutes: number;
  // fraction of the 24h day [0,1] for timeline rendering (offset from local midnight + width)
  day_offset: number;
  day_width: number;
};

export type HosDaily = {
  driver_id: string;
  date: string;
  available: boolean; // false => no ingested events => clocks null, timeline empty (honest "unavailable")
  segments: HosSegment[];
  per_status_minutes: Record<HosDutyStatus, number>;
  clocks: HosClocks | null;
  driven_cycle_min: number | null; // 70h*60 - cycle_remaining (hours driven in the cycle); null when unavailable
  eight_day_breakdown: { date: string; on_duty_min: number }[];
};

const ZERO_TOTALS = (): Record<HosDutyStatus, number> => ({
  off_duty: 0, sleeper: 0, driving: 0, on_duty_not_driving: 0, personal_conveyance: 0, yard_moves: 0,
});

const ON_DUTY: ReadonlySet<HosDutyStatus> = new Set<HosDutyStatus>(["driving", "on_duty_not_driving", "yard_moves"]);

async function fetchEvents(client: DbClient, oci: string, driverId: string, fromUtc: Date, toUtc: Date) {
  const res = await client.query<HosDutyStatusEvent & { started_at: string; ended_at: string | null }>(
    `SELECT e.started_at::text, e.ended_at::text, e.duty_status
       FROM hos.duty_status_events e
      WHERE e.operating_company_id = $1::uuid AND e.driver_id = $2::uuid
        AND e.started_at < $4::timestamptz AND COALESCE(e.ended_at, now()) > $3::timestamptz
      ORDER BY e.started_at ASC`,
    [oci, driverId, fromUtc.toISOString(), toUtc.toISOString()]
  );
  return res.rows.map((r) => ({ started_at: r.started_at, ended_at: r.ended_at, duty_status: r.duty_status }));
}

export async function getHosDaily(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string,
  dateStr: string,
  now: Date
): Promise<HosDaily> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const { start: dayStart, end: dayEnd } = laredoDayWindowUtc(dateStr);
  const asOf = now < dayEnd ? now : dayEnd; // for a past day, evaluate clocks at end-of-day
  const eightStart = new Date(dayEnd.getTime() - 8 * 24 * 3600_000);

  // 8-day events drive the cycle clocks; the selected day's events drive the timeline segments.
  const eightDayEvents = await fetchEvents(client, operatingCompanyId, driverId, eightStart, asOf);

  if (eightDayEvents.length === 0) {
    return {
      driver_id: driverId, date: dateStr, available: false, segments: [],
      per_status_minutes: ZERO_TOTALS(), clocks: null, driven_cycle_min: null, eight_day_breakdown: [],
    };
  }

  const clocks = computeHosClocks(eightDayEvents, asOf);
  // COHERENCE: an internally-impossible clock set => the event stream is incomplete/gapped (computeHosClocks filled
  // the holes). Render "unavailable" with null clocks + empty timeline — NEVER a violation on a gapped stream.
  if (!hosClocksCoherent(clocks)) {
    return {
      driver_id: driverId, date: dateStr, available: false, segments: [],
      per_status_minutes: ZERO_TOTALS(), clocks: null, driven_cycle_min: null, eight_day_breakdown: [],
    };
  }
  const driven_cycle_min = Math.max(0, CYCLE_70_MIN - clocks.cycle_remaining_min);

  // Segments: clip the day's events to [dayStart, min(dayEnd, asOf)).
  const segEnd = asOf < dayEnd ? asOf : dayEnd;
  const dayMs = dayEnd.getTime() - dayStart.getTime();
  const per_status_minutes = ZERO_TOTALS();
  const segments: HosSegment[] = [];
  for (const ev of eightDayEvents) {
    const s = new Date(ev.started_at);
    const e = ev.ended_at ? new Date(ev.ended_at) : asOf;
    const cs = s > dayStart ? s : dayStart;
    const ce = e < segEnd ? e : segEnd;
    if (ce <= cs) continue; // not in this day
    const minutes = Math.round((ce.getTime() - cs.getTime()) / 60000);
    per_status_minutes[ev.duty_status] += minutes;
    segments.push({
      duty_status: ev.duty_status,
      start_utc: cs.toISOString(), end_utc: ce.toISOString(),
      start_ct: hmCt(cs), end_ct: hmCt(ce),
      minutes,
      day_offset: (cs.getTime() - dayStart.getTime()) / dayMs,
      day_width: (ce.getTime() - cs.getTime()) / dayMs,
    });
  }

  // 8-day on-duty breakdown (per Laredo day) for the cycle context strip.
  const eight_day_breakdown: { date: string; on_duty_min: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const dEnd = new Date(dayEnd.getTime() - i * 24 * 3600_000);
    const dStart = new Date(dEnd.getTime() - 24 * 3600_000);
    let onDuty = 0;
    for (const ev of eightDayEvents) {
      if (!ON_DUTY.has(ev.duty_status)) continue;
      const s = new Date(ev.started_at);
      const e = ev.ended_at ? new Date(ev.ended_at) : asOf;
      const cs = s > dStart ? s : dStart;
      const ce = e < dEnd ? e : dEnd;
      if (ce > cs) onDuty += Math.round((ce.getTime() - cs.getTime()) / 60000);
    }
    eight_day_breakdown.push({ date: dStart.toISOString().slice(0, 10), on_duty_min: onDuty });
  }

  return {
    driver_id: driverId, date: dateStr, available: true, segments,
    per_status_minutes, clocks, driven_cycle_min, eight_day_breakdown,
  };
}

export type HosEvent = {
  driver_id: string;
  duty_status: HosDutyStatus;
  started_at: string;
  ended_at: string | null;
  started_ct: string;
  ended_ct: string | null;
};

export async function getHosEvents(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string,
  fromUtc: Date,
  toUtc: Date
): Promise<HosEvent[]> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
  const rows = await fetchEvents(client, operatingCompanyId, driverId, fromUtc, toUtc);
  return rows.map((r) => ({
    driver_id: driverId,
    duty_status: r.duty_status,
    started_at: r.started_at,
    ended_at: r.ended_at,
    started_ct: hmCt(new Date(r.started_at)),
    ended_ct: r.ended_at ? hmCt(new Date(r.ended_at)) : null,
  }));
}
