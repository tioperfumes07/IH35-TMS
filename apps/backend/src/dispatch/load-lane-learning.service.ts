/**
 * ROUND 443.35 (owner 2026-10-11 00:25 CT; Lead order) — every booked load, any source (live_feed and historical_backfill),
 * saves its miles for the next estimate. Before this module NO booking path wrote any of these (measured on prod: the
 * Settlement Creator's loads had leg_miles NULL on 40 of 40 stops and 0 lane_mileage / point_mileage / customer_lanes rows):
 *
 *   mdata.load_stops.leg_miles  — miles from the previous stop to this one. A stop that already carries leg_miles (the
 *                                 source document printed it) is never overwritten. Stop 1 (no previous stop on the load)
 *                                 = the load's deadhead to pickup (miles_deadhead) when known, else left NULL — never 0.
 *                                 Later stops: a 2-stop load's delivery leg = the load's loaded miles (loadedMilesFor:
 *                                 typed shortest, else practical); a multi-stop leg = the point_mileage cache for the
 *                                 stop pair, else left NULL and listed. Never invented.
 *   catalogs.lane_mileage       — the lane (first pickup city/state -> last delivery city/state) the lane-mileage reader
 *                                 resolves: an existing ZIP-pair row when both ZIPs match one, else the city-pair row
 *                                 (postal codes NULL, lane-mileage.service.ts "City match"), created when missing
 *                                 (confidence 'Thin', autofill off, source 'History' — same vocabulary as the seed).
 *                                 Running practical average + n_practical + min/max/spread, empty miles average,
 *                                 shortest average only when it stays <= practical, first_seen / last_seen.
 *   catalogs.point_mileage      — the load's own pickup -> delivery coordinates with its document miles, engine
 *                                 'load_document' (honest: not a routing engine), ON CONFLICT DO NOTHING.
 *   mdata.customer_lanes        — the customer's lane (customer + origin + destination), created when missing with
 *                                 typical_miles and base_rate_cents = the load's rate_total_cents; an existing lane keeps
 *                                 its owner-set rate (only a missing typical_miles is filled). A load with no rate is listed.
 *
 * FIRST-STOP DEADHEAD (Lead 443.41 G(2)): when the load's document carries no deadhead, stop 1's leg_miles = the miles from the
 * SAME unit's previous load's last stop (the unit's load whose last stop arrived latest strictly BEFORE this load's first stop —
 * by stop dates, never created_at; Creator loads are booked out of order) to this first stop: the mileage engine first
 * (resolvePointMileage — point_mileage cache, then the configured routing provider), else the owner-ruled chain-deadhead
 * method (GO-23: haversine over the two stops' coordinates, chain-deadhead.service.ts) — never written to the routing cache.
 * NULL only when the unit has no previous load (or a stop has no coordinates). load_stops has no leg-miles source column and
 * loads.deadhead_miles_calculation_method's CHECK has no 'computed' value (CC-2 cannot author migrations), so the source
 * ('computed', method, prior load) is recorded on an audit row (dispatch.load_stop.leg_miles_computed). Out of order: after a
 * booking, the unit's NEXT load's first stop is filled too when still NULL; a next load already filled from an older
 * predecessor is never overwritten (a filled leg is never moved) — re-derive it by clearing nothing, it is listed instead.
 *
 * DB-driven (reads the load and its stops by id), so the booking hook and the backfill run the identical code.
 * Idempotency: a booking counts its lane once (fresh: true). A backfill counts a load's lane only when it filled at least one
 * NULL leg_miles on that load in the same call — a re-run finds nothing NULL and counts nothing twice.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { haversineMiles } from "./deadhead/optimizer.service.js";
import { resolvePointMileage } from "./mileage/mileage.service.js";
import type { MileageProvider } from "./mileage/mileage-provider.js";
import { OsrmProvider } from "./mileage/osrm.provider.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
};

export type LaneLearningResult = {
  load_id: string;
  legs_filled: number;
  legs_unresolved: number[];
  lane: "zip_row_updated" | "city_row_updated" | "city_row_created" | "skipped";
  lane_skip_reason?: string;
  point_mileage: "inserted" | "exists" | "skipped";
  customer_lane: "created" | "existing" | "typical_miles_filled" | "skipped";
  customer_lane_skip_reason?: string;
  first_stop_deadhead?: { miles: number; method: DeadheadMethod; prior_load_number: string | null } | { miles: null; reason: string };
  successor_first_stop?: { load_number: string; miles: number | null; reason?: string };
};

export type DeadheadMethod = "point_mileage_cache" | "routing_provider" | "haversine_chain";
/** Audit classes that mark a leg as written by this module (so relearnLoadStopLegs may recompute it). */
export const LEG_LEARNED_EVENT = "dispatch.load_stop.leg_miles_learned";
export const LEG_COMPUTED_EVENT = "dispatch.load_stop.leg_miles_computed";
export const LEG_RELEARNED_EVENT = "dispatch.load_stop.leg_miles_relearned";
export type FirstStopDeadhead =
  | { miles: number; method: DeadheadMethod; engine_reason?: string; stop_id: string; prior_load_id: string; prior_load_number: string | null }
  | { miles: null; reason: string; stop_id?: string; prior_load_id?: string };

type StopRow = {
  id: string;
  sequence_number: number;
  stop_type: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  leg_miles: string | null;
  at: string | null;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The leg miles a stop should carry, by the rules in the header. Pure — unit-tested. */
export function plannedLegMiles(
  stops: Array<Pick<StopRow, "sequence_number">>,
  load: { miles_deadhead: number | null; loaded_miles: number | null },
  pairCache: (i: number) => number | null
): Array<number | null> {
  return stops.map((_, i) => {
    if (i === 0) return load.miles_deadhead != null && load.miles_deadhead >= 0 ? load.miles_deadhead : null;
    if (stops.length === 2) return load.loaded_miles;
    return pairCache(i);
  });
}

/** Running-average lane update. Pure — unit-tested. */
export function nextLaneStats(
  row: {
    practical_miles: number;
    n_practical: number;
    short_miles: number | null;
    n_short: number;
    empty_miles: number;
    practical_min: number | null;
    practical_max: number | null;
  },
  obs: { practical: number; short: number | null; empty: number }
) {
  const n = row.n_practical;
  const practical = round1((row.practical_miles * n + obs.practical) / (n + 1));
  const min = row.practical_min == null ? obs.practical : Math.min(row.practical_min, obs.practical);
  const max = row.practical_max == null ? obs.practical : Math.max(row.practical_max, obs.practical);
  let short = row.short_miles;
  let nShort = row.n_short;
  if (obs.short != null) {
    const s = round1(((row.short_miles ?? 0) * row.n_short + obs.short) / (row.n_short + 1));
    if (s <= practical) {
      short = s;
      nShort = row.n_short + 1;
    }
  }
  if (short != null && short > practical) short = row.short_miles != null && row.short_miles <= practical ? row.short_miles : null;
  return {
    practical_miles: practical,
    n_practical: n + 1,
    practical_min: min,
    practical_max: max,
    practical_spread: round1(max - min),
    short_miles: short,
    n_short: short == null ? 0 : nShort,
    empty_miles: round1((row.empty_miles * n + obs.empty) / (n + 1)),
  };
}

/** Engine answer first; the owner-ruled chain-deadhead haversine only when the engine has none. Pure — unit-tested. */
export function chooseDeadheadMiles(
  engine: { practical_miles: number | null; source: string; reason?: string },
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): { miles: number; method: DeadheadMethod; engine_reason?: string } {
  if (engine.practical_miles != null) return { miles: round1(engine.practical_miles), method: engine.source === "cache" ? "point_mileage_cache" : "routing_provider" };
  return { miles: round1(haversineMiles(from.lat, from.lng, to.lat, to.lng)), method: "haversine_chain", engine_reason: engine.reason };
}

/** First-stop deadhead for one load from the same unit's previous load (see header). Reads only; the caller writes. */
export async function computeFirstStopDeadhead(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string },
  provider: MileageProvider = new OsrmProvider()
): Promise<FirstStopDeadhead> {
  const first = (
    await client.query<{ stop_id: string; unit_id: string | null; lat: number | null; lng: number | null; at: string | null }>(
      `SELECT s.id::text AS stop_id, l.assigned_unit_id::text AS unit_id, s.latitude::float8 AS lat, s.longitude::float8 AS lng,
              COALESCE(s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at)::text AS at
         FROM mdata.loads l
         JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
        WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid
        ORDER BY s.sequence_number LIMIT 1`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows[0];
  if (!first) return { miles: null, reason: "load_has_no_stops" };
  if (!first.unit_id) return { miles: null, reason: "load_has_no_unit", stop_id: first.stop_id };
  if (!first.at) return { miles: null, reason: "first_stop_has_no_date", stop_id: first.stop_id };
  const prior = (
    await client.query<{ id: string; load_number: string | null; lat: number | null; lng: number | null }>(
      `SELECT l.id::text, l.load_number::text, ls.latitude::float8 AS lat, ls.longitude::float8 AS lng
         FROM mdata.loads l
         JOIN LATERAL (
           SELECT x.latitude, x.longitude, COALESCE(x.actual_arrival_at, x.scheduled_arrival_at, x.appointment_start_at) AS at
             FROM mdata.load_stops x WHERE x.load_id = l.id AND x.soft_deleted_at IS NULL
            ORDER BY x.sequence_number DESC LIMIT 1
         ) ls ON true
        WHERE l.assigned_unit_id = $1::uuid AND l.operating_company_id = $2::uuid AND l.id <> $3::uuid
          AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL
          AND l.status::text NOT IN ('cancelled', 'canceled', 'void', 'voided')
          AND ls.at IS NOT NULL AND ls.at < $4::timestamptz
        ORDER BY ls.at DESC, l.load_number DESC LIMIT 1`,
      [first.unit_id, args.operatingCompanyId, args.loadId, first.at]
    )
  ).rows[0];
  if (!prior) return { miles: null, reason: "no_previous_load_for_unit", stop_id: first.stop_id };
  if (prior.lat == null || prior.lng == null || first.lat == null || first.lng == null)
    return { miles: null, reason: "previous_last_stop_or_first_stop_not_located", stop_id: first.stop_id, prior_load_id: prior.id };
  const from = { lat: Number(prior.lat), lng: Number(prior.lng) };
  const to = { lat: Number(first.lat), lng: Number(first.lng) };
  const engine = await resolvePointMileage(client, provider, from, to);
  return { ...chooseDeadheadMiles(engine, from, to), stop_id: first.stop_id, prior_load_id: prior.id, prior_load_number: prior.load_number };
}

/** Writes a computed first-stop deadhead where leg_miles is still NULL, with its audit row. Returns the miles written or null. */
async function fillFirstStopDeadhead(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; actorUserId?: string | null },
  provider?: MileageProvider
): Promise<FirstStopDeadhead & { written: boolean }> {
  const dh = await computeFirstStopDeadhead(client, args, provider);
  if (dh.miles == null) return { ...dh, written: false };
  const r = await client.query(
    `UPDATE mdata.load_stops SET leg_miles = $1::numeric, updated_at = now()
      WHERE id = $2::uuid AND operating_company_id = $3::uuid AND leg_miles IS NULL`,
    [dh.miles, dh.stop_id, args.operatingCompanyId]
  );
  const written = (r.rowCount ?? 0) > 0;
  if (written)
    await appendCrudAudit(
      client as never,
      args.actorUserId ?? null as never,
      LEG_COMPUTED_EVENT,
      {
        operating_company_id: args.operatingCompanyId, load_id: args.loadId, stop_id: dh.stop_id, leg_miles: dh.miles,
        source: "computed", method: dh.method, engine_reason: dh.engine_reason ?? null,
        prior_load_id: dh.prior_load_id, prior_load_number: dh.prior_load_number,
      },
      "info",
      "LEAD-443.41-G2"
    );
  return { ...dh, written };
}

export async function learnLoadLanes(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; fresh: boolean; actorUserId?: string | null },
  provider?: MileageProvider
): Promise<LaneLearningResult> {
  const load = (
    await client.query<{
      id: string;
      customer_id: string | null;
      miles_practical: string | null;
      miles_shortest: string | null;
      miles_deadhead: string | null;
      loaded_miles: string | null;
      rate_total_cents: string | null;
      created_at: string;
    }>(
      `SELECT id::text, customer_id::text, miles_practical::text, miles_shortest::text, miles_deadhead::text,
              loaded_miles::text, rate_total_cents::text, created_at::text
         FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows[0];
  const out: LaneLearningResult = {
    load_id: args.loadId,
    legs_filled: 0,
    legs_unresolved: [],
    lane: "skipped",
    point_mileage: "skipped",
    customer_lane: "skipped",
  };
  if (!load) {
    out.lane_skip_reason = "load_not_found";
    return out;
  }
  const stops = (
    await client.query<StopRow>(
      `SELECT id::text, sequence_number, stop_type::text, city, state, postal_code, latitude, longitude, leg_miles::text,
              COALESCE(actual_arrival_at, scheduled_arrival_at, appointment_start_at)::date::text AS at
         FROM mdata.load_stops
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
        ORDER BY sequence_number`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows;
  if (stops.length < 2) {
    out.lane_skip_reason = "fewer_than_two_stops";
    return out;
  }

  const practical = pos(load.miles_practical) ?? pos(load.loaded_miles) ?? pos(load.miles_shortest);
  const loaded = pos(load.loaded_miles) ?? pos(load.miles_shortest) ?? pos(load.miles_practical);
  const deadhead = num(load.miles_deadhead);

  // ── leg_miles ──
  const pairMiles: Array<number | null> = [];
  for (let i = 0; i < stops.length; i++) {
    pairMiles.push(null);
    if (i === 0 || stops.length === 2) continue;
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) continue;
    const hit = (
      await client.query<{ m: string }>(
        `SELECT practical_miles::text AS m FROM catalogs.point_mileage
          WHERE origin_lat = $1::numeric AND origin_lng = $2::numeric AND dest_lat = $3::numeric AND dest_lng = $4::numeric LIMIT 1`,
        [round4(a.latitude), round4(a.longitude), round4(b.latitude), round4(b.longitude)]
      )
    ).rows[0];
    pairMiles[i] = hit ? num(hit.m) : null;
  }
  const planned = plannedLegMiles(stops, { miles_deadhead: deadhead, loaded_miles: loaded }, (i) => pairMiles[i] ?? null);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]!;
    if (s.leg_miles != null) continue;
    const m = planned[i];
    if (m == null) {
      if (i > 0) out.legs_unresolved.push(s.sequence_number);
      continue;
    }
    const r = await client.query(
      `UPDATE mdata.load_stops SET leg_miles = $1::numeric, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid AND leg_miles IS NULL`,
      [m, s.id, args.operatingCompanyId]
    );
    out.legs_filled += r.rowCount ?? 0;
    // Ownership marker: relearnLoadStopLegs may later recompute a leg the module wrote, never one a document / owner typed.
    if (i > 0 && (r.rowCount ?? 0) > 0)
      await appendCrudAudit(
        client as never,
        args.actorUserId ?? null as never,
        LEG_LEARNED_EVENT,
        { operating_company_id: args.operatingCompanyId, load_id: args.loadId, stop_id: s.id, leg_miles: m, rule: stops.length === 2 ? "load_loaded_miles" : "point_mileage_pair" },
        "info",
        "LEAD-443.35"
      );
  }

  // ── first-stop deadhead from the unit's previous load (443.41 G(2)) — does not count toward legs_filled, so a backfill that
  //    only computes deadheads never re-counts a lane ──
  if (stops[0]!.leg_miles == null && planned[0] == null) {
    const dh = await fillFirstStopDeadhead(client, args, provider);
    out.first_stop_deadhead = dh.miles != null ? { miles: dh.miles, method: dh.method, prior_load_number: dh.prior_load_number } : { miles: null, reason: dh.reason };
  }
  if (args.fresh) {
    // Out of order: this load may now be the previous load of the unit's next one — fill that first stop if still NULL.
    const next = (
      await client.query<{ id: string; load_number: string }>(
        `WITH me AS (
           SELECT l.assigned_unit_id AS unit_id,
                  (SELECT COALESCE(x.actual_arrival_at, x.scheduled_arrival_at, x.appointment_start_at) FROM mdata.load_stops x
                    WHERE x.load_id = l.id AND x.soft_deleted_at IS NULL ORDER BY x.sequence_number DESC LIMIT 1) AS last_at
             FROM mdata.loads l WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid)
         SELECT n.id::text, n.load_number::text
           FROM me JOIN mdata.loads n ON n.assigned_unit_id = me.unit_id AND n.operating_company_id = $2::uuid AND n.id <> $1::uuid
           JOIN LATERAL (SELECT y.leg_miles, COALESCE(y.actual_arrival_at, y.scheduled_arrival_at, y.appointment_start_at) AS at
                           FROM mdata.load_stops y WHERE y.load_id = n.id AND y.soft_deleted_at IS NULL
                          ORDER BY y.sequence_number LIMIT 1) f ON true
          WHERE me.unit_id IS NOT NULL AND me.last_at IS NOT NULL AND f.at > me.last_at
            AND n.voided_at IS NULL AND n.soft_deleted_at IS NULL AND n.status::text NOT IN ('cancelled', 'canceled', 'void', 'voided')
          ORDER BY f.at LIMIT 1`,
        [args.loadId, args.operatingCompanyId]
      )
    ).rows[0];
    if (next) {
      const nxt = await fillFirstStopDeadhead(client, { ...args, loadId: next.id }, provider);
      out.successor_first_stop = { load_number: next.load_number, miles: nxt.written ? nxt.miles : null, ...(nxt.miles == null ? { reason: nxt.reason } : nxt.written ? {} : { reason: "already_filled" }) };
    }
  }

  // A backfill re-run must not count the same load twice.
  if (!args.fresh && out.legs_filled === 0) {
    out.lane_skip_reason = "already_learned";
    out.customer_lane_skip_reason = "already_learned";
    return out;
  }

  const origin = stops.find((s) => s.stop_type === "pickup") ?? stops[0]!;
  const dest = [...stops].reverse().find((s) => s.stop_type === "delivery") ?? stops[stops.length - 1]!;
  const oCity = (origin.city ?? "").trim();
  const oState = (origin.state ?? "").trim().toUpperCase();
  const dCity = (dest.city ?? "").trim();
  const dState = (dest.state ?? "").trim().toUpperCase();
  const seen = dest.at ?? origin.at ?? load.created_at.slice(0, 10);

  // ── lane_mileage ──
  if (!oCity || !oState || !dCity || !dState) out.lane_skip_reason = "origin_or_destination_city_state_missing";
  else if (practical == null) out.lane_skip_reason = "no_miles_on_load";
  else {
    const short = pos(load.miles_shortest);
    const obs = { practical, short: short != null && short <= practical ? short : null, empty: deadhead != null && deadhead > 0 ? deadhead : 0 };
    const cols = `id::text, practical_miles::text, n_practical, short_miles::text, n_short, empty_miles::text,
                  practical_min::text, practical_max::text`;
    type LaneRow = { id: string; practical_miles: string; n_practical: number; short_miles: string | null; n_short: number; empty_miles: string; practical_min: string | null; practical_max: string | null };
    let row: LaneRow | undefined;
    let kind: "zip_row_updated" | "city_row_updated" = "city_row_updated";
    const oZip = (origin.postal_code ?? "").trim();
    const dZip = (dest.postal_code ?? "").trim();
    if (oZip && dZip) {
      row = (
        await client.query<LaneRow>(
          `SELECT ${cols} FROM catalogs.lane_mileage
            WHERE operating_company_id = $1::uuid AND origin_postal_code = $2 AND dest_postal_code = $3 LIMIT 1 FOR UPDATE`,
          [args.operatingCompanyId, oZip, dZip]
        )
      ).rows[0];
      if (row) kind = "zip_row_updated";
    }
    if (!row) {
      row = (
        await client.query<LaneRow>(
          `SELECT ${cols} FROM catalogs.lane_mileage
            WHERE operating_company_id = $1::uuid AND lower(origin_city) = lower($2) AND lower(origin_state) = lower($3)
              AND lower(dest_city) = lower($4) AND lower(dest_state) = lower($5)
              AND origin_postal_code IS NULL AND dest_postal_code IS NULL
            LIMIT 1 FOR UPDATE`,
          [args.operatingCompanyId, oCity, oState, dCity, dState]
        )
      ).rows[0];
    }
    if (row) {
      const next = nextLaneStats(
        {
          practical_miles: Number(row.practical_miles),
          n_practical: Number(row.n_practical),
          short_miles: num(row.short_miles),
          n_short: Number(row.n_short),
          empty_miles: Number(row.empty_miles),
          practical_min: num(row.practical_min),
          practical_max: num(row.practical_max),
        },
        obs
      );
      await client.query(
        `UPDATE catalogs.lane_mileage
            SET practical_miles = $2::numeric, n_practical = $3::int, practical_min = $4::numeric, practical_max = $5::numeric,
                practical_spread = $6::numeric, short_miles = $7::numeric, n_short = $8::int, empty_miles = $9::numeric,
                first_seen = LEAST(COALESCE(first_seen, $10::date), $10::date),
                last_seen = GREATEST(COALESCE(last_seen, $10::date), $10::date), updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $11::uuid`,
        [row.id, next.practical_miles, next.n_practical, next.practical_min, next.practical_max, next.practical_spread,
         next.short_miles, next.n_short, next.empty_miles, seen, args.operatingCompanyId]
      );
      out.lane = kind;
    } else {
      await client.query(
        `INSERT INTO catalogs.lane_mileage (
           operating_company_id, origin_city, origin_state, origin_postal_code, dest_city, dest_state, dest_postal_code,
           practical_miles, short_miles, empty_miles, n_practical, n_short, practical_min, practical_max, practical_spread,
           confidence, autofill_allowed, source, first_seen, last_seen, created_by_user_id
         ) VALUES ($1::uuid, $2, $3, NULL, $4, $5, NULL, $6::numeric, $7::numeric, $8::numeric, 1, $9::int, $6::numeric,
                   $6::numeric, 0, 'Thin', false, 'History', $10::date, $10::date, $11::uuid)
         ON CONFLICT DO NOTHING`,
        [args.operatingCompanyId, oCity, oState, dCity, dState, practical, obs.short, obs.empty, obs.short == null ? 0 : 1,
         seen, args.actorUserId ?? null]
      );
      out.lane = "city_row_created";
    }

    // ── point_mileage ──
    if (origin.latitude != null && origin.longitude != null && dest.latitude != null && dest.longitude != null) {
      const r = await client.query(
        `INSERT INTO catalogs.point_mileage (origin_lat, origin_lng, dest_lat, dest_lng, practical_miles, shortest_miles, engine, engine_version)
         VALUES ($1::numeric, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::numeric, 'load_document', 'booking-443.35')
         ON CONFLICT (origin_lat, origin_lng, dest_lat, dest_lng) DO NOTHING`,
        [round4(origin.latitude), round4(origin.longitude), round4(dest.latitude), round4(dest.longitude), practical, obs.short]
      );
      out.point_mileage = (r.rowCount ?? 0) > 0 ? "inserted" : "exists";
    }
  }

  // ── customer_lanes ──
  const rate = pos(load.rate_total_cents);
  if (!load.customer_id) out.customer_lane_skip_reason = "no_customer";
  else if (!oCity || !oState || !dCity || !dState) out.customer_lane_skip_reason = "origin_or_destination_city_state_missing";
  else {
    const existing = (
      await client.query<{ id: string; typical_miles: number | null }>(
        `SELECT id::text, typical_miles FROM mdata.customer_lanes
          WHERE operating_company_id = $1::uuid AND customer_id = $2::uuid AND deactivated_at IS NULL
            AND lower(origin_city) = lower($3) AND upper(origin_state) = $4
            AND lower(destination_city) = lower($5) AND upper(destination_state) = $6
          ORDER BY created_at LIMIT 1`,
        [args.operatingCompanyId, load.customer_id, oCity, oState, dCity, dState]
      )
    ).rows[0];
    const typical = loaded != null ? Math.round(loaded) : null;
    if (existing) {
      if (existing.typical_miles == null && typical != null) {
        await client.query(
          `UPDATE mdata.customer_lanes SET typical_miles = $2::int, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $3::uuid AND typical_miles IS NULL`,
          [existing.id, typical, args.operatingCompanyId]
        );
        out.customer_lane = "typical_miles_filled";
      } else out.customer_lane = "existing";
    } else if (rate == null) out.customer_lane_skip_reason = "load_has_no_rate";
    else {
      await client.query(
        `INSERT INTO mdata.customer_lanes (operating_company_id, customer_id, lane_label, origin_city, origin_state,
                                           destination_city, destination_state, typical_miles, base_rate_cents, notes)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::int, $9::bigint, $10)`,
        [args.operatingCompanyId, load.customer_id, `${oCity}, ${oState} → ${dCity}, ${dState}`, oCity, oState, dCity, dState,
         typical, Math.round(rate), "learned from a booked load (443.35)"]
      );
      out.customer_lane = "created";
    }
  }
  return out;
}


export type RelearnedLeg = { stop_id: string; old: number | null; new: number; method: DeadheadMethod | "load_loaded_miles" };
export type RelearnLoadStopLegsResult = {
  changed: RelearnedLeg[];
  kept_owner_legs: number;
  unresolved: Array<{ stop_id: string; reason: string }>;
};

/**
 * Is this non-first leg one the module wrote (so it may be recomputed)? NULL, an ownership audit row, or the value the
 * module's own rule produced (the load's loaded miles — the 2-stop delivery rule — or the point_mileage pair). Anything else
 * was typed by a document / the owner and is kept. Pure — unit-tested.
 */
export function isModuleOwnedLeg(
  leg: number | null,
  ctx: { audited: boolean; loadedMiles: number | null; pairMiles: number | null }
): boolean {
  if (leg == null || ctx.audited) return true;
  const eq = (a: number | null) => a != null && Math.abs(a - leg) < 0.05;
  return eq(ctx.loadedMiles) || eq(ctx.pairMiles);
}

/**
 * Lead 443.43 #3 (multi-stop repair): after stops are added / resequenced on a load, recompute every NON-first stop's leg
 * from the previous stop's coordinates to its own — mileage engine first (resolvePointMileage: point_mileage cache, then the
 * routing provider), else the owner-ruled chain-deadhead haversine (chooseDeadheadMiles); a 2-stop load keeps the module's
 * rule (delivery leg = the load's loaded miles). Overwrites ONLY legs this module wrote (isModuleOwnedLeg) and NULL legs;
 * never an owner / document leg; never the first-stop deadhead; never lane_mileage / customer_lanes counts. Each change is
 * audited (old -> new, method). Runs on the caller's client (same transaction).
 */
export async function relearnLoadStopLegs(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; actorUserId: string },
  provider: MileageProvider = new OsrmProvider()
): Promise<RelearnLoadStopLegsResult> {
  const out: RelearnLoadStopLegsResult = { changed: [], kept_owner_legs: 0, unresolved: [] };
  const load = (
    await client.query<{ loaded_miles: string | null; miles_shortest: string | null; miles_practical: string | null }>(
      `SELECT loaded_miles::text, miles_shortest::text, miles_practical::text
         FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows[0];
  if (!load) return out;
  const loaded = pos(load.loaded_miles) ?? pos(load.miles_shortest) ?? pos(load.miles_practical);
  const stops = (
    await client.query<StopRow>(
      `SELECT id::text, sequence_number, stop_type::text, city, state, postal_code, latitude, longitude, leg_miles::text, NULL::text AS at
         FROM mdata.load_stops
        WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
        ORDER BY sequence_number`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows;
  if (stops.length < 2) return out;
  const audited = new Set(
    (
      await client.query<{ stop_id: string }>(
        `SELECT DISTINCT payload->>'stop_id' AS stop_id FROM audit.audit_events
          WHERE event_class = ANY($1::text[]) AND payload->>'load_id' = $2`,
        [[LEG_LEARNED_EVENT, LEG_COMPUTED_EVENT, LEG_RELEARNED_EVENT], args.loadId]
      )
    ).rows.map((r) => r.stop_id)
  );
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    const current = num(b.leg_miles);
    const located = a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null;
    const pair = located
      ? num(
          (
            await client.query<{ m: string }>(
              `SELECT practical_miles::text AS m FROM catalogs.point_mileage
                WHERE origin_lat = $1::numeric AND origin_lng = $2::numeric AND dest_lat = $3::numeric AND dest_lng = $4::numeric LIMIT 1`,
              [round4(a.latitude!), round4(a.longitude!), round4(b.latitude!), round4(b.longitude!)]
            )
          ).rows[0]?.m
        )
      : null;
    if (!isModuleOwnedLeg(current, { audited: audited.has(b.id), loadedMiles: loaded, pairMiles: pair })) {
      out.kept_owner_legs += 1;
      continue;
    }
    let next: { miles: number; method: RelearnedLeg["method"] } | null = null;
    if (stops.length === 2 && loaded != null) next = { miles: round1(loaded), method: "load_loaded_miles" };
    else if (located) {
      const from = { lat: Number(a.latitude), lng: Number(a.longitude) };
      const to = { lat: Number(b.latitude), lng: Number(b.longitude) };
      const engine = await resolvePointMileage(client, provider, from, to);
      const chosen = chooseDeadheadMiles(engine, from, to);
      next = { miles: chosen.miles, method: chosen.method };
    }
    if (!next) {
      out.unresolved.push({ stop_id: b.id, reason: "previous_or_this_stop_not_located" });
      continue;
    }
    if (current != null && Math.abs(current - next.miles) < 0.05) continue;
    await client.query(
      `UPDATE mdata.load_stops SET leg_miles = $1::numeric, updated_at = now() WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
      [next.miles, b.id, args.operatingCompanyId]
    );
    await appendCrudAudit(
      client as never,
      args.actorUserId,
      LEG_RELEARNED_EVENT,
      { operating_company_id: args.operatingCompanyId, load_id: args.loadId, stop_id: b.id, old_leg_miles: current, leg_miles: next.miles, method: next.method },
      "info",
      "LEAD-443.43"
    );
    out.changed.push({ stop_id: b.id, old: current, new: next.miles, method: next.method });
  }
  return out;
}
