import { computeHosClocks, hosClocksCoherent, type HosDutyStatusEvent } from "./hos-clocks.service.js";

type DbClient = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

// In-flight load statuses where a driver is actually in the truck "now" (mdata.load_status_enum).
// Excludes pre-assignment (draft/booked/planned) and finished (delivered/invoiced/paid/closed/cancelled).
const ACTIVE_LOAD_STATUSES = ["assigned", "assigned_not_dispatched", "dispatched", "at_pickup", "in_transit", "at_delivery"];

const STALE_AFTER_MIN = 60; // a fix older than this is flagged stale (positions already filtered to 24h)
// PER-DRIVER STALENESS (MUST 3.15.6): a fix older than the 2h absolute cutoff means HOS is NOT live — suppress the
// clocks to "unavailable" rather than presenting >2h-old HOS as "ok"/current (live case: SOSA PEREZ, ~16h old, "ok").
const HOS_STALE_CUTOFF_MIN = 120;

// SERIALIZATION BOUNDARY: node-postgres returns numeric/decimal columns (lat, lng, speed_mph, heading_deg)
// as STRINGS to preserve precision — the row types claim `number | null` but lie at runtime. Consumers that
// trusted the type (e.g. the Live Fleet HOS section calling speed.toFixed()) threw "toFixed is not a function"
// and the whole section was skipped. Coerce here, at the one API boundary, so the board, the Google-Maps link,
// and the Excel export all receive real numbers. null/blank/garbage -> null (never NaN onto the wire).
function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type FleetLocationHosRow = {
  unit_id: string;
  unit_number: string | null;
  samsara_vehicle_id: string | null;
  driver_id: string | null;
  driver_name: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  formatted_location: string | null;
  speed_mph: number | null;
  heading_deg: number | null;
  engine_state: string | null;
  captured_at_utc: string | null;
  captured_at_local: string | null; // America/Chicago (Laredo = Central)
  minutes_since_fix: number | null;
  stale: boolean;
  // HOS (minutes remaining); null when no driver assigned
  drive_remaining_min: number | null; // 11-hr cap
  window_remaining_min: number | null; // 14-hr shift
  break_remaining_min: number | null;
  cycle_remaining_min: number | null; // 70-hr
  hos_status: string | null;
};

const CT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
function toLocal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return CT.format(d) + " CT";
}

export async function getFleetLocationHosRows(
  client: DbClient,
  operatingCompanyId: string,
  asOf: Date
): Promise<FleetLocationHosRow[]> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  // 1. Row set = EVERY active truck (Jorge's rule), not only the ones Samsara has a position/driver for.
  //    Start FROM mdata.units (active InService, entity-scoped, not Sold/retired/demo) and LEFT JOIN the
  //    latest position — so a truck with no recent fix or no logged-in driver still shows a row (location
  //    blank, driver resolved-or-"Not assigned"). No 50-cap. The `stale` flag conveys fix freshness.
  const posRes = await client.query<{
    unit_id: string;
    unit_number: string | null;
    samsara_vehicle_id: string | null;
    captured_at: string | null;
    lat: number | null;
    lng: number | null;
    city: string | null;
    state: string | null;
    formatted_location: string | null;
    speed_mph: number | null;
    heading_deg: number | null;
    engine_state: string | null;
  }>(
    `
      SELECT u.id::text AS unit_id, u.unit_number, p.samsara_vehicle_id,
             p.captured_at::text AS captured_at, p.lat, p.lng, p.city, p.state, p.formatted_location,
             p.speed_mph, p.heading_deg, p.engine_state
      FROM mdata.units u
      LEFT JOIN telematics.vehicle_latest_position p
        ON p.unit_id = u.id
       AND p.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
      WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
        AND u.deactivated_at IS NULL
        AND u.status::text = 'InService'
      ORDER BY u.unit_number ASC NULLS LAST
    `,
    [operatingCompanyId]
  );

  // 2. Current driver per unit. PRIMARY source = Samsara's vehicle→driver assignment (the ELD login,
  //    telematics.vehicle_driver_assignments — the same telematics feed as positions/HOS, the authoritative
  //    "who is physically in truck X now"). The dispatch load is NOT reliable here: in current data the loads
  //    table is nearly empty while 20+ trucks move on Samsara, so it resolved 0 drivers (GUARD). An OPEN
  //    assignment (ended_at IS NULL) is the active one; DISTINCT ON the most recent per unit.
  type DriverRow = { assigned_unit_id: string; driver_id: string; driver_name: string };
  const driverByUnit = new Map<string, DriverRow>();

  const samsaraRes = await client.query<DriverRow>(
    `
      SELECT DISTINCT ON (a.unit_id)
        a.unit_id::text AS assigned_unit_id,
        a.driver_id::text AS driver_id,
        trim(coalesce(d.first_name,'') || ' ' || coalesce(d.last_name,'')) AS driver_name
      FROM telematics.vehicle_driver_assignments a
      JOIN mdata.drivers d ON d.id = a.driver_id
      WHERE a.operating_company_id = $1::uuid
        AND a.ended_at IS NULL
        AND a.driver_id IS NOT NULL
      ORDER BY a.unit_id, a.started_at DESC
    `,
    [operatingCompanyId]
  );
  for (const r of samsaraRes.rows) driverByUnit.set(r.assigned_unit_id, r);

  // FALLBACK = active-load assignment, for any unit WITHOUT an open Samsara assignment (e.g. a booked
  // load on a truck Samsara hasn't paired yet). Broadened to include 'assigned'/'assigned_not_dispatched'.
  const loadRes = await client.query<DriverRow>(
    `
      SELECT DISTINCT ON (l.assigned_unit_id)
        l.assigned_unit_id::text AS assigned_unit_id,
        l.assigned_primary_driver_id::text AS driver_id,
        trim(coalesce(d.first_name,'') || ' ' || coalesce(d.last_name,'')) AS driver_name
      FROM mdata.loads l
      JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id IS NOT NULL
        AND l.assigned_primary_driver_id IS NOT NULL
        AND l.soft_deleted_at IS NULL
        AND l.status::text = ANY($2::text[])
      ORDER BY l.assigned_unit_id, l.updated_at DESC NULLS LAST
    `,
    [operatingCompanyId, ACTIVE_LOAD_STATUSES]
  );
  for (const r of loadRes.rows) {
    if (!driverByUnit.has(r.assigned_unit_id)) driverByUnit.set(r.assigned_unit_id, r);
  }
  const drvRes = { rows: [...driverByUnit.values()] }; // for the batched HOS lookup below

  // 3. Batch HOS: one query for ALL assigned drivers, grouped, then computeHosClocks per driver (no N+1).
  //    "no_data" = driver assigned but ZERO ingested duty events => HOS unknown (NOT the fabricated 14h default).
  const driverIds = [...new Set(drvRes.rows.map((r) => r.driver_id))];
  const hosByDriver = new Map<string, ReturnType<typeof computeHosClocks> | "no_data">();
  if (driverIds.length > 0) {
    const evRes = await client.query<HosDutyStatusEvent & { driver_id: string }>(
      `
        SELECT e.driver_id::text AS driver_id, e.started_at::text, e.ended_at::text, e.duty_status
        FROM hos.duty_status_events e
        WHERE e.operating_company_id = $1::uuid
          AND e.driver_id = ANY($2::uuid[])
        ORDER BY e.driver_id, e.started_at ASC
      `,
      [operatingCompanyId, driverIds]
    );
    const eventsByDriver = new Map<string, HosDutyStatusEvent[]>();
    for (const ev of evRes.rows) {
      const list = eventsByDriver.get(ev.driver_id) ?? [];
      list.push({ started_at: ev.started_at, ended_at: ev.ended_at, duty_status: ev.duty_status });
      eventsByDriver.set(ev.driver_id, list);
    }
    for (const id of driverIds) {
      const evs = eventsByDriver.get(id) ?? [];
      // HONEST DEFAULT: with NO ingested duty events, HOS is UNKNOWN — not "fresh 14h". computeHosClocks([])
      // returns the full 11h/14h/70h "ok" window, which on a compliance/safety board is a fabrication (it
      // claims every driver is legal-to-drive). So zero events => "no_data" -> blank clocks + "unavailable".
      hosByDriver.set(id, evs.length > 0 ? computeHosClocks(evs, asOf) : "no_data");
    }
  }

  // 4. Join into the export rows. Vehicles with no current driver keep blank driver/HOS (row NOT dropped).
  const nowMs = asOf.getTime();
  return posRes.rows.map((p) => {
    const drv = p.unit_id ? driverByUnit.get(p.unit_id) ?? null : null;
    const hosEntry = drv ? hosByDriver.get(drv.driver_id) ?? null : null;
    const computed = hosEntry && hosEntry !== "no_data" ? hosEntry : null;
    const capturedMs = p.captured_at ? new Date(p.captured_at).getTime() : NaN;
    const minutesSince = Number.isNaN(capturedMs) ? null : Math.round((nowMs - capturedMs) / 60_000);
    // SUPPRESS the computed clocks to "unavailable" when (a) the clock set is internally incoherent (gapped
    // stream -> false violation), or (b) the driver's fix is older than the 2h HOS cutoff (>2h-stale HOS is not
    // live). A clock/verdict is shown ONLY from a coherent, fresh set — never a fabricated or stale one.
    const hosStale = minutesSince != null && minutesSince > HOS_STALE_CUTOFF_MIN;
    const hosIncoherent = computed != null && !hosClocksCoherent(computed);
    const hos = computed != null && !hosStale && !hosIncoherent ? computed : null;
    // "unavailable" whenever a driver is assigned but we are not showing a real clock (no events / incoherent / stale).
    const hosUnknown = drv != null && hos == null;
    return {
      unit_id: p.unit_id,
      unit_number: p.unit_number,
      samsara_vehicle_id: p.samsara_vehicle_id,
      driver_id: drv?.driver_id ?? null,
      driver_name: drv?.driver_name?.trim() || null,
      lat: toNum(p.lat),
      lng: toNum(p.lng),
      city: p.city ?? null,
      state: p.state ?? null,
      formatted_location: p.formatted_location ?? null,
      speed_mph: toNum(p.speed_mph),
      heading_deg: toNum(p.heading_deg),
      engine_state: p.engine_state,
      captured_at_utc: p.captured_at,
      captured_at_local: toLocal(p.captured_at),
      minutes_since_fix: minutesSince,
      stale: minutesSince != null && minutesSince > STALE_AFTER_MIN,
      drive_remaining_min: hos?.drive_remaining_min ?? null,
      window_remaining_min: hos?.window_remaining_min ?? null,
      break_remaining_min: hos?.break_remaining_min ?? null,
      cycle_remaining_min: hos?.cycle_remaining_min ?? null,
      hos_status: hos?.status ?? (hosUnknown ? "unavailable" : null),
    };
  });
}

// minutes → "h:mm" for the HOS columns in the sheet.
export function minutesToHMM(min: number | null): string {
  if (min == null || Number.isNaN(min)) return "";
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
