// HOS Tracker (Compliance "HOS Tracker" tab) — per-driver daily duty-status timeline + clocks, read from the
// already-ingested hos.duty_status_events (filled by the Samsara HOS pull). HONEST: a driver-day with NO events
// reads "unavailable" with null clocks and an empty timeline — never a guessed default and never a violation on
// missing data. The #1218 atomic per-driver savepoint + #1220 canonical mapping guarantee a driver's events are
// all-or-nothing, so "has events" == complete; "no events" == unavailable.
import { DateTime } from "luxon";
import { computeHosClocks, hosClocksCoherent, flattenDutySegments, type HosClocks, type HosDutyStatus, type HosDutyStatusEvent } from "./hos-clocks.service.js";

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

// HOME TERMINAL zone (FMCSA HOS law — see docs/specs/TIME-AND-TIMEZONE.md). The 24h period + 7/8-day cycle anchor to
// the home terminal regardless of truck location. America/Chicago for TRANSP/Laredo; per operating company later.
// Use Luxon (IANA, DST-aware) for ALL day-boundary math — NEVER fixed offsets (a Central day is 23h or 25h on DST).
const HOME_TZ = "America/Chicago";
const CYCLE_70_MIN = 70 * 60;

// UTC window [start, end) for a home-terminal calendar day "YYYY-MM-DD" — DST-aware (23h/25h on transition dates).
export function homeDayWindowUtc(dateStr: string): { start: Date; end: Date } {
  const day = DateTime.fromISO(dateStr, { zone: HOME_TZ }).startOf("day");
  return { start: day.toUTC().toJSDate(), end: day.plus({ days: 1 }).toUTC().toJSDate() };
}
function hmCt(d: Date): string {
  return `${DateTime.fromJSDate(d).setZone(HOME_TZ).toFormat("HH:mm")} CT`;
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

  const { start: dayStart, end: dayEnd } = homeDayWindowUtc(dateStr);
  const asOf = now < dayEnd ? now : dayEnd; // for a past day, evaluate clocks at end-of-day
  // Anchor the fetch to asOf − 8 days — the SAME window computeHosClocks uses internally for the 70h cycle, and the
  // SAME window the Live Fleet board now uses (now() − 8d). Anchoring to dayEnd − 8d (the old value) fetched too
  // late and missed on-duty in [asOf−8d, dayEnd−8d], under-counting on-duty -> over-stating cycle (roster 472 vs
  // board 169; the ~303min gap was exactly dayEnd−now, the hours to Laredo midnight). Both paths now agree per driver.
  const eightStart = new Date(asOf.getTime() - 8 * 24 * 3600_000);

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

  // Flatten to a NON-OVERLAPPING timeline (same reconstruction the clocks use) so the day's per-status totals and
  // the 8-day on-duty breakdown count wall-clock time, not summed overlapping/duplicate/open-ended segments. The
  // raw-event sum produced impossible days (CAZARES 06-14 = 35h) -> false cycle:0 violations.
  const flat = flattenDutySegments(eightDayEvents, asOf);

  // Segments: clip the flattened timeline to [dayStart, min(dayEnd, asOf)).
  const segEnd = asOf < dayEnd ? asOf : dayEnd;
  const dayMs = dayEnd.getTime() - dayStart.getTime();
  const per_status_minutes = ZERO_TOTALS();
  const segments: HosSegment[] = [];
  for (const ev of flat) {
    const cs = ev.start > dayStart ? ev.start : dayStart;
    const ce = ev.end < segEnd ? ev.end : segEnd;
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

  // 8-day on-duty breakdown by HOME-TERMINAL CALENDAR DAYS (today + prior 7), DST-aware via Luxon — union, not sum.
  // Each day's window is its real length (23h/25h on DST-transition days), so the sanity cap is the ACTUAL day
  // length, not a hardcoded 1440 (same DST-correctness principle applied to the guard itself).
  const selDay = DateTime.fromISO(dateStr, { zone: HOME_TZ }).startOf("day");
  const eight_day_breakdown: { date: string; on_duty_min: number }[] = [];
  let impossibleDay = false;
  for (let i = 7; i >= 0; i--) {
    const dayDT = selDay.minus({ days: i }); // Luxon minus days = a real home-terminal calendar day (DST-aware)
    const dStart = dayDT.toUTC().toJSDate();
    const dEnd = dayDT.plus({ days: 1 }).toUTC().toJSDate();
    const dayLenMin = Math.round((dEnd.getTime() - dStart.getTime()) / 60000); // 1380 / 1440 / 1500 by DST
    let onDuty = 0;
    for (const ev of flat) {
      if (!ON_DUTY.has(ev.duty_status)) continue;
      const cs = ev.start > dStart ? ev.start : dStart;
      const ce = ev.end < dEnd ? ev.end : dEnd;
      if (ce > cs) onDuty += Math.round((ce.getTime() - cs.getTime()) / 60000);
    }
    if (onDuty > dayLenMin) impossibleDay = true; // exceeds the ACTUAL day length -> corrupt stream
    eight_day_breakdown.push({ date: dayDT.toISODate() ?? dStart.toISOString().slice(0, 10), on_duty_min: onDuty });
  }

  // HARD SANITY GUARD: a flattened day can't exceed its real (DST-aware) length. If it does, the stream is corrupt
  // -> the CYCLE can't be trusted -> render "unavailable", NEVER a (false) cycle:0 violation.
  if (impossibleDay) {
    return {
      driver_id: driverId, date: dateStr, available: false, segments: [],
      per_status_minutes: ZERO_TOTALS(), clocks: null, driven_cycle_min: null, eight_day_breakdown,
    };
  }

  return {
    driver_id: driverId, date: dateStr, available: true, segments,
    per_status_minutes, clocks, driven_cycle_min, eight_day_breakdown,
  };
}

// ── CANONICAL ROSTER (Block 02-04): one source of truth for the HOS Tracker's timeline (Block 03) AND dense table
// (Block 04) so they agree per driver. Both surfaces read THIS, not the legacy fleet board's separate cycle math
// (GUARD: board cyc=128 vs /hos/daily cyc=472 for the same driver). Per active board driver -> getHosDaily + name/unit.
export type HosRosterDriver = HosDaily & {
  driver_name: string | null;
  unit_number: string | null;
  current_duty_status: HosDutyStatus | null; // the duty status covering "now" (last segment of the day)
};
export type HosRoster = {
  date: string;
  generated_at: string;
  drivers: HosRosterDriver[];
  counts: { active: number; on_duty: number; driving: number; low: number; violation: number; unavailable: number };
};

export async function getHosDailyRoster(
  client: DbClient,
  operatingCompanyId: string,
  dateStr: string,
  now: Date
): Promise<HosRoster> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
  // Active board drivers = drivers with an OPEN vehicle assignment (the same set the fleet board + HOS pull use).
  const active = await client.query<{ driver_id: string; driver_name: string | null; unit_number: string | null }>(
    `SELECT DISTINCT ON (a.driver_id)
       a.driver_id::text AS driver_id,
       trim(coalesce(d.first_name,'') || ' ' || coalesce(d.last_name,'')) AS driver_name,
       u.unit_number
     FROM telematics.vehicle_driver_assignments a
     JOIN mdata.drivers d ON d.id = a.driver_id
     LEFT JOIN mdata.units u ON u.id = a.unit_id
     WHERE a.operating_company_id = $1::uuid AND a.ended_at IS NULL AND a.driver_id IS NOT NULL
     ORDER BY a.driver_id, a.started_at DESC`,
    [operatingCompanyId]
  );

  const drivers: HosRosterDriver[] = [];
  for (const r of active.rows) {
    const daily = await getHosDaily(client, operatingCompanyId, r.driver_id, dateStr, now);
    const current = daily.segments.length > 0 ? daily.segments[daily.segments.length - 1].duty_status : null;
    drivers.push({ ...daily, driver_name: r.driver_name?.trim() || null, unit_number: r.unit_number, current_duty_status: current });
  }

  const counts = { active: drivers.length, on_duty: 0, driving: 0, low: 0, violation: 0, unavailable: 0 };
  for (const d of drivers) {
    if (!d.available) { counts.unavailable += 1; continue; }
    if (d.clocks?.status === "violation") counts.violation += 1;
    else if (d.clocks?.status === "warning_1hr" || d.clocks?.status === "warning_15min") counts.low += 1;
    if (d.current_duty_status === "driving") counts.driving += 1;
    if (d.current_duty_status === "driving" || d.current_duty_status === "on_duty_not_driving" || d.current_duty_status === "yard_moves")
      counts.on_duty += 1;
  }
  return { date: dateStr, generated_at: now.toISOString(), drivers, counts };
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
