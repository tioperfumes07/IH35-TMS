/**
 * ORDERS-2026-10-01 CC-2 rows 5-6 — derive a real pump time (and the IFTA state) for fuel rows whose
 * source carries only a DATE.
 *
 * Why: 125 USMCA diesel rows are stamped 00:00 / 12:00 UTC because their statement source has no
 * time of day. That blocks E-21 (pump-time rules refused), E-22 and E-23 (Samsara push needs a
 * time), and CC-3's IFTA reader (no state on 73 of 105 rows).
 *
 * How: for each (unit, local date) the engine looks at where the TRUCK ITSELF stopped that day —
 * telematics.unit_stop_events when it is live (feature-detected), otherwise dwell >= 3 min detected
 * from telematics.vehicle_locations by the Lead's detectStops — and keeps only stops inside a
 * fuel_stop geofence (geo.geofences, its own radius). Then, per unit-day:
 *   1 row,  1 fuel stop      -> time = that stop's start, state = its state     (confidence high)
 *   n rows, 1 fuel stop      -> every fill happened at that one stop: its time + state (medium)
 *   n rows, n>1 or stops>rows -> NO time (which fill was which stop is unknown); state only when every
 *                                fuel stop that day is in one state            (confidence medium)
 *   0 fuel stops             -> nothing derived, reason stated
 * It NEVER writes fuel.fuel_transactions.transaction_at or any source field: the result is this
 * engine's own derived output (transaction_at_derived, state_derived, derived_from, confidence).
 */
import { detectStops, unitFixesSql, type PositionFix } from "../telematics/stop-odometer-capture.service.js";
import { fuelPurchaseIneligibleReason } from "./fuel-purchase-eligibility.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type FuelStop = { ref: string; startedAt: Date; state: string | null; geofenceId: string; geofenceLabel: string | null; metres: number };

export type FuelTimeDerivation = {
  fuel_transaction_id: string;
  local_date: string;
  unit_id: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  transaction_at_derived: string | null;
  state_derived: string | null;
  derived_from_kind: "unit_stop_event" | "vehicle_locations_dwell" | null;
  derived_from_ref: string | null;
  geofence_id: string | null;
  confidence: "high" | "medium" | null;
  reason: string;
};

/** Pure: the per unit-day decision. */
export function decideUnitDay(rowCount: number, stops: FuelStop[]): {
  time: Date | null;
  state: string | null;
  stop: FuelStop | null;
  confidence: "high" | "medium" | null;
  reason: string;
} {
  if (stops.length === 0) {
    return { time: null, state: null, stop: null, confidence: null, reason: "the truck made no stop inside a fuel-stop geofence that day" };
  }
  if (rowCount === 1 && stops.length === 1) {
    return {
      time: stops[0].startedAt,
      state: stops[0].state,
      stop: stops[0],
      confidence: "high",
      reason: `one fill, one fuel stop that day (${stops[0].geofenceLabel ?? "fuel stop"}, ${stops[0].metres} m from the fence centre)`,
    };
  }
  if (stops.length === 1) {
    return {
      time: stops[0].startedAt,
      state: stops[0].state,
      stop: stops[0],
      confidence: "medium",
      reason: `${rowCount} fills and one fuel stop that day — every fill happened at that stop (${stops[0].geofenceLabel ?? "fuel stop"})`,
    };
  }
  const states = [...new Set(stops.map((s) => s.state).filter((s): s is string => Boolean(s)))];
  const state = states.length === 1 && stops.every((s) => s.state) ? states[0] : null;
  return {
    time: null,
    state,
    stop: null,
    confidence: state ? "medium" : null,
    reason:
      `${rowCount} fill(s) and ${stops.length} fuel stop(s) that day — which fill was which stop is unknown, so no time` +
      (state ? `; every fuel stop was in ${state}, so the state is derived` : "; fuel stops span states, so no state either"),
  };
}

function haversineMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** [start, end) of a calendar date in America/Chicago, as UTC instants. */
function chicagoDayBounds(localDate: string): { start: Date; end: Date } {
  // Chicago is UTC-5 (CDT) or UTC-6 (CST); find the offset that makes local midnight land on the date.
  for (const off of [5, 6]) {
    const start = new Date(`${localDate}T${String(off).padStart(2, "0")}:00:00Z`);
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(start);
    if (local.startsWith(localDate) && local.endsWith("00")) {
      const end = new Date(start.getTime() + 24 * 3_600_000);
      return { start, end };
    }
  }
  const start = new Date(`${localDate}T05:00:00Z`);
  return { start, end: new Date(start.getTime() + 24 * 3_600_000) };
}

async function stopEventsLive(client: DbClient): Promise<boolean> {
  const r = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'telematics' AND table_name = 'unit_stop_events'
        AND column_name = ANY(ARRAY['unit_id','started_at','lat','lng','state'])`
  );
  return (r.rows[0]?.n ?? 0) === 5;
}

export async function computeFuelTimeDerivations(
  client: DbClient,
  operatingCompanyId: string,
  opts: { periodStart?: string | null; periodEnd?: string | null } = {}
): Promise<{ rows: FuelTimeDerivation[]; summary: Record<string, number>; stop_source: string }> {
  const fences = await client.query<{ id: string; label: string | null; lat: number; lng: number; radius: number }>(
    `SELECT id::text, label, center_lat::float8 AS lat, center_lng::float8 AS lng,
            coalesce(enter_radius_m, radius_m)::float8 AS radius
       FROM geo.geofences
      WHERE operating_company_id = $1::uuid AND is_active AND location_kind = 'fuel_stop'
        AND center_lat IS NOT NULL AND center_lng IS NOT NULL`,
    [operatingCompanyId]
  );
  const rows = await client.query<{
    id: string;
    transaction_at: string;
    fuel_type: string | null;
    gallons: number | null;
    unit_id: string | null;
    unit_number: string | null;
    vendor_name: string | null;
    same_stamp_count: number;
  }>(
    `SELECT ft.id::text, ft.transaction_at::text, ft.fuel_type, ft.gallons::float8 AS gallons,
            ft.unit_id::text, u.unit_number, v.vendor_name,
            (SELECT count(*) FROM fuel.fuel_transactions x
              WHERE x.operating_company_id = ft.operating_company_id AND x.transaction_at = ft.transaction_at
                AND x.voided_at IS NULL)::int AS same_stamp_count
       FROM fuel.fuel_transactions ft
       LEFT JOIN mdata.units u ON u.id = ft.unit_id
       LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
      WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL
        AND ($2::timestamptz IS NULL OR ft.transaction_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR ft.transaction_at < $3::timestamptz)
      ORDER BY ft.unit_id, ft.transaction_at`,
    [operatingCompanyId, opts.periodStart ?? null, opts.periodEnd ?? null]
  );

  // Only real motor-fuel purchases whose source has a DATE and no time of day.
  const dateOnly = rows.rows.filter((r) => {
    const e = { fuel_type: r.fuel_type, gallons: r.gallons, transaction_at: r.transaction_at, voided_at: null, same_stamp_count: r.same_stamp_count };
    return fuelPurchaseIneligibleReason(e, { requirePumpTime: false }) === null &&
      fuelPurchaseIneligibleReason(e, { requirePumpTime: true }) === "date_only_precision";
  });

  const useStopEvents = await stopEventsLive(client);
  const groups = new Map<string, typeof dateOnly>();
  for (const r of dateOnly) {
    const key = `${r.unit_id ?? "none"}|${r.transaction_at.slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const out: FuelTimeDerivation[] = [];
  for (const [key, group] of groups) {
    const [unitId, localDate] = key.split("|");
    const base = (r: (typeof group)[number]) => ({
      fuel_transaction_id: r.id,
      local_date: localDate,
      unit_id: r.unit_id,
      unit_number: r.unit_number,
      vendor_name: r.vendor_name,
    });
    if (unitId === "none") {
      for (const r of group) out.push({ ...base(r), transaction_at_derived: null, state_derived: null, derived_from_kind: null, derived_from_ref: null, geofence_id: null, confidence: null, reason: "fuel row has no unit — nothing to follow" });
      continue;
    }
    const { start, end } = chicagoDayBounds(localDate);
    let stops: { ref: string; startedAt: Date; lat: number | null; lng: number | null; state: string | null }[] = [];
    if (useStopEvents) {
      const s = await client.query<{ id: string; started_at: Date; lat: number | null; lng: number | null; state: string | null }>(
        `SELECT id::text, started_at, lat::float8 AS lat, lng::float8 AS lng, state
           FROM telematics.unit_stop_events WHERE unit_id = $1::uuid AND started_at >= $2 AND started_at < $3 ORDER BY started_at`,
        [unitId, start.toISOString(), end.toISOString()]
      );
      stops = s.rows.map((x) => ({ ref: x.id, startedAt: new Date(x.started_at), lat: x.lat, lng: x.lng, state: x.state }));
    } else {
      const fx = await client.query<{ captured_at: Date; lat: string | null; lng: string | null; speed_mph: string | null; engine_state: string | null; odometer_mi: string | null; city: string | null; state: string | null }>(
        unitFixesSql(),
        [unitId, start.toISOString(), end.toISOString()]
      );
      const n = (v: string | null) => (v === null ? null : Number(v));
      const fixes: PositionFix[] = fx.rows.map((r) => ({ capturedAt: new Date(r.captured_at), lat: n(r.lat), lng: n(r.lng), speedMph: n(r.speed_mph), engineState: r.engine_state, odometerMi: n(r.odometer_mi), city: r.city, state: r.state }));
      stops = detectStops(unitId, fixes).map((s) => ({ ref: `${unitId}:${s.startedAt.toISOString()}..${s.endedAt.toISOString()}`, startedAt: s.startedAt, lat: s.lat, lng: s.lng, state: s.state }));
    }
    const fuelStops: FuelStop[] = [];
    for (const s of stops) {
      if (s.lat === null || s.lng === null) continue;
      let best: { id: string; label: string | null; m: number } | null = null;
      for (const f of fences.rows) {
        const m = haversineMetres(s.lat, s.lng, f.lat, f.lng);
        if (m <= f.radius && (best === null || m < best.m)) best = { id: f.id, label: f.label, m };
      }
      if (best) fuelStops.push({ ref: s.ref, startedAt: s.startedAt, state: s.state, geofenceId: best.id, geofenceLabel: best.label, metres: Math.round(best.m) });
    }
    const d = decideUnitDay(group.length, fuelStops);
    for (const r of group) {
      out.push({
        ...base(r),
        transaction_at_derived: d.time ? d.time.toISOString() : null,
        state_derived: d.state,
        derived_from_kind: d.time || d.state ? (useStopEvents ? "unit_stop_event" : "vehicle_locations_dwell") : null,
        derived_from_ref: d.stop?.ref ?? null,
        geofence_id: d.stop?.geofenceId ?? null,
        confidence: d.confidence,
        reason: d.reason,
      });
    }
  }

  const summary: Record<string, number> = { date_only_rows: out.length, with_time: 0, with_state: 0, none: 0 };
  for (const r of out) {
    if (r.transaction_at_derived) summary.with_time += 1;
    if (r.state_derived) summary.with_state += 1;
    if (!r.transaction_at_derived && !r.state_derived) summary.none += 1;
  }
  return { rows: out, summary, stop_source: useStopEvents ? "telematics.unit_stop_events" : "telematics.vehicle_locations dwell >= 3 min" };
}


/**
 * Storage. The derived values go to a SIDE TABLE, never to fuel.fuel_transactions. The table is
 * CC-1's migration (spec in OUTBOX-CC-2.md, ORDERS-2026-10-01 row 5); until it exists the writer
 * is a logged no-op and the read endpoint computes on read. FUEL_TIME_DERIVATION_ENABLED defaults
 * ON because this is the engine's own derived output, not a source field.
 */
export const FUEL_DERIVATION_TABLE = "fuel.fuel_transaction_derivations";
export const FUEL_DERIVATION_COLUMNS = [
  "fuel_transaction_id", "operating_company_id", "transaction_at_derived", "state_derived",
  "derived_from_kind", "derived_from_ref", "geofence_id", "confidence", "reason", "derived_at",
] as const;

export function fuelTimeDerivationEnabled(): boolean {
  return (process.env.FUEL_TIME_DERIVATION_ENABLED ?? "true").trim() !== "false";
}

export async function derivationTableReady(client: DbClient): Promise<boolean> {
  const r = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'fuel' AND table_name = 'fuel_transaction_derivations' AND column_name = ANY($1::text[])`,
    [[...FUEL_DERIVATION_COLUMNS]]
  );
  return (r.rows[0]?.n ?? 0) === FUEL_DERIVATION_COLUMNS.length;
}

export async function writeFuelTimeDerivations(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ written: number; skipped_reason: string | null }> {
  if (!fuelTimeDerivationEnabled()) return { written: 0, skipped_reason: "FUEL_TIME_DERIVATION_ENABLED=false" };
  if (!(await derivationTableReady(client))) {
    return { written: 0, skipped_reason: `${FUEL_DERIVATION_TABLE} does not exist yet (CC-1 migration) — computed on read only` };
  }
  const { rows } = await computeFuelTimeDerivations(client, operatingCompanyId);
  let written = 0;
  for (const r of rows) {
    await client.query(
      `INSERT INTO fuel.fuel_transaction_derivations (
         fuel_transaction_id, operating_company_id, transaction_at_derived, state_derived,
         derived_from_kind, derived_from_ref, geofence_id, confidence, reason, derived_at)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6, $7::uuid, $8, $9, now())
       ON CONFLICT (fuel_transaction_id) DO UPDATE SET
         transaction_at_derived = EXCLUDED.transaction_at_derived, state_derived = EXCLUDED.state_derived,
         derived_from_kind = EXCLUDED.derived_from_kind, derived_from_ref = EXCLUDED.derived_from_ref,
         geofence_id = EXCLUDED.geofence_id, confidence = EXCLUDED.confidence, reason = EXCLUDED.reason,
         derived_at = now()`,
      [r.fuel_transaction_id, operatingCompanyId, r.transaction_at_derived, r.state_derived, r.derived_from_kind, r.derived_from_ref, r.geofence_id, r.confidence, r.reason]
    );
    written += 1;
  }
  return { written, skipped_reason: null };
}

/**
 * Pump times the engine has stored with HIGH confidence (one fill, one fuel stop). E-21 and E-22
 * use these instead of refusing a date-only row. Empty until the side table exists.
 */
export async function loadHighConfidenceDerivedTimes(client: DbClient, operatingCompanyId: string): Promise<Map<string, string>> {
  if (!(await derivationTableReady(client))) return new Map();
  const r = await client.query<{ id: string; t: string }>(
    `SELECT fuel_transaction_id::text AS id, transaction_at_derived::text AS t
       FROM fuel.fuel_transaction_derivations
      WHERE operating_company_id = $1::uuid AND confidence = 'high' AND transaction_at_derived IS NOT NULL`,
    [operatingCompanyId]
  );
  return new Map(r.rows.map((x) => [x.id, x.t]));
}
