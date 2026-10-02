/**
 * ENGINE: load real-driven miles — computes per-stop leg miles and per-load total from odometer anchors and writes them onto the stop and load
 * SCHEDULE: on demand — telematics/load-real-driven-miles.cron.ts (25 * * * *, runLoadRealDrivenMilesCronTick); GET /api/v1/loads/:id/real-driven-miles computes without writing
 * WRITES: mdata.load_stops (leg_miles_driven_actual*), mdata.loads (miles_driven_actual*) — UPDATE only
 * IDEMPOTENCY: DETERMINISTIC OVERWRITE — each UPDATE sets a computed column to a pure function of the odometer captures; no history row
 * OVERLAP: two runs write the same values; nothing accumulates
 * REVERSE: NOT-A-DOCUMENT — computed columns re-derived every run
 * NEVER: must never write billed (miles_practical) or paid (miles_shortest / miles_deadhead) miles — only the driven-actual columns
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { fetchOdometerAnchors, realDrivenMiles, type BoundaryRequest, type OdometerAnchor } from "./odometer-anchor.js";

/**
 * ORDER-2026-09-04 three-mile CPM: REAL DRIVEN miles per leg and per load, from the odometer only.
 * Leg k = stop k-1 departure -> stop k arrival (LOADED). The first stop's leg is the DEADHEAD from the same
 * unit's previous load (its last stop departure) and is stored on that stop only.
 * Load total (mdata.loads.miles_driven_actual) = sum of the LOADED legs -- compared with practical (billed,
 * loaded). Loaded + the stop-1 deadhead leg compares with short (miles_shortest + miles_deadhead). Measured
 * 2026-10-01: 76 of 118 USMCA loads have no earlier TMS load for their truck, so their deadhead start is
 * unknown -- folding deadhead into the total would have thrown away 76 measurable loaded trips.
 * Any unmeasurable loaded leg makes the load NULL with that leg's reason: never zero, never practical/short,
 * never interpolated, never a partial sum.
 */

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type LegKind = "deadhead" | "loaded";
export type LegRow = {
  stop_id: string;
  sequence_number: number;
  kind: LegKind;
  from_at: string | null;
  to_at: string | null;
  miles: number | null;
  source: string | null;
  reason: string | null;
};
export type LoadRealMilesRow = {
  load_id: string;
  unit_id: string | null;
  legs: LegRow[];
  miles_driven_actual: number | null;
  source: string | null;
  reason: string | null;
};

export const LOAD_REAL_MILES_SOURCE = "odometer";

/** Pure: the load total from its LOADED legs. NULL with the first missing leg's reason; never a partial sum. */
export function loadTotalFromLegs(allLegs: LegRow[]): { miles: number | null; source: string | null; reason: string | null } {
  if (allLegs.length === 0) return { miles: null, source: null, reason: "load has no stops" };
  const legs = allLegs.filter((l) => l.kind === "loaded");
  if (legs.length === 0) return { miles: null, source: null, reason: "load has a single stop -- no loaded leg" };
  const missing = legs.find((l) => l.miles == null);
  if (missing) return { miles: null, source: null, reason: `stop ${missing.sequence_number} (${missing.kind} leg): ${missing.reason ?? "not measured"}` };
  const total = legs.reduce((s, l) => s + (l.miles ?? 0), 0);
  return { miles: Math.round(total * 10) / 10, source: LOAD_REAL_MILES_SOURCE, reason: null };
}

/**
 * Pure: a leg whose start is not before its end cannot be measured. Measured 2026-10-01: two USMCA loads carry
 * a pickup "departure" at 12:00/13:00 and the delivery "arrival" at 08:00 the same day (round-hour entries), which
 * read as the odometer running backwards; the real defect is the stop times, and the reason says so.
 */
export function stopTimesOutOfOrder(fromAt: string | null, toAt: string | null, kind: LegKind, seq: number): string | null {
  if (!fromAt || !toAt) return null;
  if (new Date(fromAt).getTime() < new Date(toAt).getTime()) return null;
  return kind === "deadhead"
    ? `previous load departure (${fromAt}) is not before stop ${seq} arrival (${toAt}) -- stop times out of order`
    : `stop ${seq - 1} departure (${fromAt}) is not before stop ${seq} arrival (${toAt}) -- stop times out of order`;
}

/** Stop-time sources recorded at the moment by a device or the driver's own tap. `manual` and NULL are not. */
export const MEASURED_STOP_TIME_SOURCES = ["eld_geofence", "samsara_route", "driver_app"] as const;
/** A geofence capture is matched to a stop when it is this close in time to the stop's recorded time. */
export const GEOFENCE_MATCH_WINDOW_HOURS = 48;
/** A stop is inside a fence when within the fence radius (never less than this many metres). */
export const GEOFENCE_MIN_RADIUS_M = 300;

type StopPoint = {
  stop_id: string; load_id: string; unit_id: string | null; sequence_number: number;
  latitude: number | null; longitude: number | null;
  arrival_at: string | null; departure_at: string | null; scheduled_arrival_at: string | null;
  arrival_source: string | null; departure_source: string | null;
};
type Boundary = { anchor: OdometerAnchor | null; reason: string | null; at: string | null; via: string | null };
type GeofenceHit = { odo: number | null; at: string; src: string | null };

/**
 * Pure: the odometer at one stop boundary (arrival = fence entered, departure = fence exited).
 * 1. A geofence capture for the load's truck at a fence containing the stop, near the stop's time, with a REAL
 *    OBD odometer (interpolated / absent captures are not measurements and refuse with that reason).
 * 2. Else the stop's recorded time, only when a device or the driver's tap recorded it, resolved through the
 *    shared odometer-anchor rule.
 * 3. Else NOT measurable: a manual (typed) stop time is an approximation -- measured 2026-10-01, all 216 manual
 *    USMCA stop times sit on the hour, and legs between them spanned exactly 23/47/71/95 h.
 */
export function resolveStopBoundary(
  side: "arrival" | "departure",
  stop: StopPoint,
  hit: GeofenceHit | undefined,
  timeAnchor: { anchor: OdometerAnchor | null; reason: string | null } | undefined
): Boundary {
  const label = `stop ${stop.sequence_number} ${side}`;
  if (hit) {
    if (hit.odo != null && hit.src === "real_obd") return { anchor: { odometer_mi: hit.odo, read_at: hit.at, source: "odometer_readings" }, reason: null, at: hit.at, via: "geofence" };
    return { anchor: null, reason: `${label}: geofence ${side === "arrival" ? "entry" : "exit"} at ${hit.at} has a ${hit.src ?? "missing"} odometer -- not a measurement`, at: hit.at, via: "geofence" };
  }
  const at = side === "arrival" ? stop.arrival_at : stop.departure_at;
  const src = side === "arrival" ? stop.arrival_source : stop.departure_source;
  if (!at) return { anchor: null, reason: `${label}: no geofence event for the truck and no recorded time`, at: null, via: null };
  if (!src || !(MEASURED_STOP_TIME_SOURCES as readonly string[]).includes(src)) {
    return { anchor: null, reason: `${label}: no geofence event for the truck; the stop time is ${src ? `a ${src}` : "an unsourced"} entry, not a measurement`, at, via: null };
  }
  return { anchor: timeAnchor?.anchor ?? null, reason: timeAnchor?.anchor ? null : `${label}: ${timeAnchor?.reason ?? "odometer not resolved"}`, at, via: src };
}

/** Pure: a leg from its two boundaries. */
export function legFromBoundaries(from: Boundary, to: Boundary, kind: LegKind, seq: number): { miles: number | null; source: string | null; reason: string | null } {
  if (!from.anchor) return { miles: null, source: null, reason: from.reason ?? "start not measured" };
  if (!to.anchor) return { miles: null, source: null, reason: to.reason ?? "end not measured" };
  const order = stopTimesOutOfOrder(from.at, to.at, kind, seq);
  if (order) return { miles: null, source: null, reason: order };
  const r = realDrivenMiles(from.anchor, to.anchor, from.reason, to.reason);
  if (r.miles == null) return { miles: null, source: null, reason: r.reason };
  return { miles: r.miles, source: `${LOAD_REAL_MILES_SOURCE}:${from.via}->${to.via}`, reason: null };
}

const STOP_COLS = `s.id::text AS stop_id, s.load_id::text AS load_id, l.assigned_unit_id::text AS unit_id, s.sequence_number,
  s.latitude::float AS latitude, s.longitude::float AS longitude,
  s.actual_arrival_at::text AS arrival_at, s.actual_departure_at::text AS departure_at, s.scheduled_arrival_at::text AS scheduled_arrival_at,
  s.actual_arrival_source AS arrival_source, s.actual_departure_source AS departure_source`;

export async function computeLoadRealDrivenMiles(client: DbClient, operatingCompanyId: string, loadIds: string[]): Promise<LoadRealMilesRow[]> {
  if (loadIds.length === 0) return [];
  const stops = await client.query<StopPoint>(
    `SELECT ${STOP_COLS}
       FROM mdata.loads l
       JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
      WHERE l.operating_company_id = $1::uuid AND l.id = ANY($2::uuid[])
      ORDER BY s.load_id, s.sequence_number`,
    [operatingCompanyId, loadIds]
  );
  const byLoad = new Map<string, StopPoint[]>();
  for (const st of stops.rows) byLoad.set(st.load_id, [...(byLoad.get(st.load_id) ?? []), st]);

  // Deadhead start: the same truck's previous load's LAST stop (latest recorded time before this load's first stop).
  const firsts = [...byLoad.values()].map((l) => l[0]).filter((f) => f.unit_id && (f.arrival_at ?? f.scheduled_arrival_at));
  const prior = new Map<string, StopPoint>();
  if (firsts.length) {
    const r = await client.query<StopPoint & { for_stop: string }>(
      `SELECT f.for_stop, p.*
         FROM unnest($2::text[], $3::uuid[], $4::timestamptz[], $5::uuid[]) AS f(for_stop, unit_id, at, load_id)
         CROSS JOIN LATERAL (
           SELECT ${STOP_COLS}
             FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
            WHERE l.operating_company_id = $1::uuid AND l.assigned_unit_id = f.unit_id AND l.id <> f.load_id
              AND l.voided_at IS NULL AND l.canceled_at IS NULL AND s.soft_deleted_at IS NULL
              AND COALESCE(s.actual_departure_at, s.actual_arrival_at, s.scheduled_arrival_at) < f.at
            ORDER BY COALESCE(s.actual_departure_at, s.actual_arrival_at, s.scheduled_arrival_at) DESC
            LIMIT 1) p`,
      [operatingCompanyId, firsts.map((f) => f.stop_id), firsts.map((f) => f.unit_id), firsts.map((f) => f.arrival_at ?? f.scheduled_arrival_at), firsts.map((f) => f.load_id)]
    );
    for (const row of r.rows) prior.set(row.for_stop, row);
  }

  // Every boundary: [stop, side]. Geofence captures and device-time anchors are each resolved in one round trip.
  const wanted: Array<{ key: string; stop: StopPoint; side: "arrival" | "departure" }> = [];
  for (const list of byLoad.values()) {
    list.forEach((st, i) => {
      wanted.push({ key: `${st.stop_id}:arrival`, stop: st, side: "arrival" });
      if (i < list.length - 1) wanted.push({ key: `${st.stop_id}:departure`, stop: st, side: "departure" });
    });
    const p = prior.get(list[0].stop_id);
    if (p) wanted.push({ key: `${list[0].stop_id}:prior_departure`, stop: p, side: "departure" });
  }
  const geo = wanted.filter((w) => w.stop.unit_id && w.stop.latitude != null && w.stop.longitude != null && (w.stop.departure_at ?? w.stop.arrival_at ?? w.stop.scheduled_arrival_at));
  const hits = new Map<string, GeofenceHit>();
  if (geo.length) {
    const r = await client.query<{ k: string; odo: string | null; at: string; src: string | null }>(
      `SELECT q.k, c.odometer_mi::text AS odo, c.occurred_at::text AS at, c.odometer_source AS src
         FROM unnest($2::text[], $3::uuid[], $4::float8[], $5::float8[], $6::timestamptz[], $7::text[]) AS q(k, unit_id, lat, lng, at, ev)
         CROSS JOIN LATERAL (
           SELECT c.* FROM telematics.geofence_odometer_captures c
             JOIN geo.geofences g ON g.id = c.geofence_id AND g.operating_company_id = c.operating_company_id
            WHERE c.operating_company_id = $1::uuid AND c.unit_id = q.unit_id AND c.event_kind = q.ev
              AND c.occurred_at BETWEEN q.at - make_interval(hours => $8::int) AND q.at + make_interval(hours => $8::int)
              AND g.center_lat IS NOT NULL
              AND 6371000 * 2 * asin(sqrt(power(sin(radians(g.center_lat - q.lat) / 2), 2)
                    + cos(radians(q.lat)) * cos(radians(g.center_lat)) * power(sin(radians(g.center_lng - q.lng) / 2), 2)))
                  <= GREATEST(COALESCE(g.radius_m, 0), $9::int)
            ORDER BY abs(extract(epoch FROM c.occurred_at - q.at))
            LIMIT 1) c`,
      [
        operatingCompanyId,
        geo.map((w) => w.key),
        geo.map((w) => w.stop.unit_id),
        geo.map((w) => w.stop.latitude),
        geo.map((w) => w.stop.longitude),
        geo.map((w) => (w.side === "arrival" ? w.stop.arrival_at ?? w.stop.scheduled_arrival_at : w.stop.departure_at ?? w.stop.arrival_at ?? w.stop.scheduled_arrival_at)),
        geo.map((w) => (w.side === "arrival" ? "entered" : "exited")),
        GEOFENCE_MATCH_WINDOW_HOURS,
        GEOFENCE_MIN_RADIUS_M,
      ]
    );
    for (const row of r.rows) hits.set(row.k, { odo: row.odo == null ? null : Number(row.odo), at: row.at, src: row.src });
  }
  const timed: BoundaryRequest[] = [];
  for (const w of wanted) {
    if (hits.has(w.key) || !w.stop.unit_id) continue;
    const at = w.side === "arrival" ? w.stop.arrival_at : w.stop.departure_at;
    const src = w.side === "arrival" ? w.stop.arrival_source : w.stop.departure_source;
    if (at && src && (MEASURED_STOP_TIME_SOURCES as readonly string[]).includes(src)) timed.push({ key: w.key, unit_id: w.stop.unit_id, at });
  }
  const anchors = await fetchOdometerAnchors(client, operatingCompanyId, timed);
  const boundary = new Map<string, Boundary>();
  for (const w of wanted) boundary.set(w.key, resolveStopBoundary(w.side, w.stop, hits.get(w.key), anchors.get(w.key)));

  const out: LoadRealMilesRow[] = [];
  for (const loadId of loadIds) {
    const list = byLoad.get(loadId) ?? [];
    const unitId = list[0]?.unit_id ?? null;
    const legs: LegRow[] = list.map((st, i) => {
      const kind: LegKind = i === 0 ? "deadhead" : "loaded";
      const fromKey = i === 0 ? `${st.stop_id}:prior_departure` : `${list[i - 1].stop_id}:departure`;
      const from = boundary.get(fromKey);
      const to = boundary.get(`${st.stop_id}:arrival`)!;
      const base = { stop_id: st.stop_id, sequence_number: st.sequence_number, kind, from_at: from?.at ?? null, to_at: to?.at ?? null };
      if (!unitId) return { ...base, miles: null, source: null, reason: "load has no assigned unit" };
      if (!from) return { ...base, miles: null, source: null, reason: "no earlier load for this truck -- deadhead start unknown" };
      return { ...base, ...legFromBoundaries(from, to, kind, st.sequence_number) };
    });
    const total = loadTotalFromLegs(legs);
    out.push({ load_id: loadId, unit_id: unitId, legs, miles_driven_actual: total.miles, source: total.source, reason: total.reason });
  }
  return out;
}

async function storageReady(client: DbClient): Promise<boolean> {
  const r = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.columns
      WHERE (table_schema, table_name, column_name) IN
            (('mdata','loads','miles_driven_actual'), ('mdata','loads','miles_driven_actual_computed_at'),
             ('mdata','load_stops','leg_miles_driven_actual'), ('mdata','load_stops','leg_miles_driven_actual_reason'))`
  );
  return Number(r.rows[0]?.n ?? 0) === 4;
}

/** Writes the computed legs and totals. Returns null when migration 202615160000 is not applied yet. */
export async function persistLoadRealDrivenMiles(client: DbClient, operatingCompanyId: string, rows: LoadRealMilesRow[]): Promise<number | null> {
  if (!(await storageReady(client))) return null;
  for (const row of rows) {
    for (const leg of row.legs) {
      await client.query(
        `UPDATE mdata.load_stops
            SET leg_miles_driven_actual = $2, leg_miles_driven_actual_source = $3, leg_miles_driven_actual_reason = $4
          WHERE id = $1::uuid`,
        [leg.stop_id, leg.miles, leg.source, leg.reason]
      );
    }
    await client.query(
      `UPDATE mdata.loads
          SET miles_driven_actual = $3, miles_driven_actual_source = $4, miles_driven_actual_reason = $5, miles_driven_actual_computed_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [row.load_id, operatingCompanyId, row.miles_driven_actual, row.source, row.reason]
    );
  }
  return rows.length;
}

/** Loads to (re)compute: delivered (last stop arrived) and either never computed or touched in the last 14 days. */
export async function loadsDueForRealMiles(client: DbClient, operatingCompanyId: string, ready: boolean): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `SELECT l.id::text
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.voided_at IS NULL AND l.canceled_at IS NULL
        AND l.assigned_unit_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.actual_arrival_at IS NOT NULL)
        ${ready ? "AND (l.miles_driven_actual_computed_at IS NULL OR l.updated_at > now() - interval '14 days' OR l.miles_driven_actual_computed_at > now() - interval '14 days')" : ""}
      ORDER BY l.id`,
    [operatingCompanyId]
  );
  return r.rows.map((x) => x.id);
}

export async function runLoadRealDrivenMilesCronTick(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const db = client as DbClient;
    const ready = await storageReady(db);
    if (!ready) return; // migration 202615160000 not applied yet -- the read route still computes on demand
    const companies = await db.query<{ id: string }>(
      `SELECT c.id::text AS id FROM org.companies c WHERE c.is_active = true AND c.deactivated_at IS NULL ORDER BY 1`
    );
    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "telematics.load_real_driven_miles_cron");
      // membership-scope-exempt: internally-iterated-active-company
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const ids = await loadsDueForRealMiles(db, company.id, ready);
      for (let i = 0; i < ids.length; i += 200) {
        const rows = await computeLoadRealDrivenMiles(db, company.id, ids.slice(i, i + 200));
        await persistLoadRealDrivenMiles(db, company.id, rows);
      }
    }
  });
}

/** Pure: the three-mile comparison for one load. Every figure names the mileage it is. */
export function threeMileComparison(row: LoadRealMilesRow, practical: number | null, shortest: number | null, deadhead: number | null) {
  const dh = row.legs.find((l) => l.kind === "deadhead");
  const realWithDeadhead = row.miles_driven_actual != null && dh?.miles != null ? Math.round((row.miles_driven_actual + dh.miles) * 10) / 10 : null;
  const short = shortest != null ? Math.round((shortest + (deadhead ?? 0)) * 10) / 10 : null;
  return {
    real_driven_loaded_miles: row.miles_driven_actual,
    real_driven_loaded_reason: row.reason,
    real_driven_deadhead_miles: dh?.miles ?? null,
    real_driven_deadhead_reason: dh?.miles == null ? dh?.reason ?? "no deadhead leg" : null,
    practical_miles: practical,
    short_miles: short,
    /** Driven but not billed: real loaded - practical (billed is loaded miles). */
    real_minus_practical_miles: row.miles_driven_actual != null && practical != null ? Math.round((row.miles_driven_actual - practical) * 10) / 10 : null,
    /** Driven but not paid: real loaded + real deadhead - short (paid = shortest + deadhead). */
    real_minus_short_miles: realWithDeadhead != null && short != null ? Math.round((realWithDeadhead - short) * 10) / 10 : null,
  };
}

const loadParams = z.object({ id: z.string().uuid() });
const loadQuery = z.object({ operating_company_id: z.string().uuid() });

export async function registerLoadRealDrivenMilesRoutes(app: FastifyInstance) {
  app.get("/api/v1/loads/:id/real-driven-miles", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const params = loadParams.safeParse(req.params ?? {});
    const query = loadQuery.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const payload = await withCurrentUser(user.uuid, async (client) => {
      const db = client as DbClient;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const load = await db.query<{ id: string; load_number: string | null; unit_id: string | null; unit_number: string | null; practical: string | null; shortest: string | null; deadhead: string | null }>(
        `SELECT l.id::text, l.load_number, l.assigned_unit_id::text AS unit_id, u.unit_number,
                l.miles_practical::text AS practical, l.miles_shortest::text AS shortest, l.miles_deadhead::text AS deadhead
           FROM mdata.loads l LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
        [params.data.id, opco]
      );
      const head = load.rows[0];
      if (!head) return null;
      const [row] = await computeLoadRealDrivenMiles(db, opco, [head.id]);
      const num = (x: string | null) => (x == null ? null : Number(x));
      return {
        load: { id: head.id, load_number: head.load_number },
        unit: head.unit_id ? { id: head.unit_id, unit_number: head.unit_number } : null,
        legs: row?.legs ?? [],
        comparison: row ? threeMileComparison(row, num(head.practical), num(head.shortest), num(head.deadhead)) : null,
        stored: await storageReady(db),
        basis: { real_driven: "odometer (geofence enter/exit or device-recorded stop times)", practical: "miles_practical (billed)", short: "miles_shortest + miles_deadhead (paid)" },
      };
    });
    if (!payload) return reply.code(404).send({ error: "load_not_found" });
    return payload;
  });
}
