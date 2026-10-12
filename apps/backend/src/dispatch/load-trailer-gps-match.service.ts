/**
 * LEAD 443.107 item 2 (owner: "GPS is the source of truth") — decide each load's PHYSICAL trailer from Samsara GPS.
 *
 * WHY: prod 2026-10-12, 138 live USMCA loads had no physical trailer recorded (Book Load's trailer was never filled;
 * mdata.loads.load_trailer_equipment_id is the trailer TYPE catalog, not the trailer). The trailer a load rode is the
 * fleet trailer whose GPS track sits on top of the load's truck across the load's pickup -> delivery window.
 *
 * THE RULE (named constants below, never a guess):
 *   - the truck's fixes come from telematics.vehicle_locations (stored, the canonical truck track);
 *   - every company-owned / company-leased trailer with a Samsara id is a candidate; its fixes come from Samsara
 *     GET /fleet/trailers/stats/history (trailer GPS is not stored locally);
 *   - a truck fix is PAIRED with a trailer fix when they are <= PAIR_TIME_TOLERANCE_MS apart, and CO-LOCATED when that
 *     pair is <= CO_LOCATED_METERS apart;
 *   - a candidate MATCHES when it has >= MIN_PAIRED_FIXES pairs, >= MIN_CO_LOCATED_SHARE of them co-located, AND is
 *     co-located within DWELL_TOLERANCE_MS of BOTH the pickup and the delivery stop time (the two dwells);
 *   - exactly one matching candidate => the trailer; none => "no trailer GPS" / "no co-located trailer"; two or more =>
 *     "two candidates: A, B" — nothing is stamped on an ambiguous load.
 *   - a load whose expenses already name a trailer (the load-trailer.sql.ts fallback) is only CONFIRMED when GPS agrees;
 *     when GPS names a different trailer the load is reported as a conflict and nothing is written.
 *
 * WRITES (dryRun=false), each load inside its own SAVEPOINT, METADATA ONLY:
 *   1. a dispatch.load_assignment_history row (assignment_method 'auto_reassign', reason_code 'gps_trailer_match',
 *      notes = the GPS evidence) — the load's assignment trailer, which load-trailer.sql.ts and the expense trailer
 *      trigger read everywhere (row-audited by audit.ensure_row_trigger);
 *   2. accounting.expenses.trailer_id + accounting.expense_lines.trailer_id on the load's live expenses, ONLY where NULL
 *      and the expense names no customer trailer — never an amount, account, status, JE or posting;
 *   3. one audit event per load (load.trailer_matched_by_gps).
 * The driver bills then take the trailer through the existing Owner bill stamp (bill-trailer-stamp.service.ts), which
 * the route runs after the loads in the same transaction. Customer-trailer loads are never touched.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import type { TrailerGpsFix, TrailerGpsHistory } from "../integrations/samsara/samsara-client.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

/** 300 m: a tractor and the trailer it pulls report within a trailer length + GPS error of each other; two trailers
 *  parked in one yard are routinely 50-300 m apart, so the share + dwell tests below — not distance alone — separate them. */
export const CO_LOCATED_METERS = 300;
/** Samsara trailer gateways report every few minutes while moving; a truck fix pairs with the nearest trailer fix in time. */
export const PAIR_TIME_TOLERANCE_MS = 10 * 60 * 1000;
/** A trailer riding with the truck is co-located on (almost) every paired fix; 80% leaves room for GPS dropouts. */
export const MIN_CO_LOCATED_SHARE = 0.8;
/** Fewer than 5 pairs over a whole load is too thin to call a trailer. */
export const MIN_PAIRED_FIXES = 5;
/** The trailer must be with the truck at the pickup AND at the delivery (the two dwells). */
export const DWELL_TOLERANCE_MS = 60 * 60 * 1000;
/** Truck fixes are thinned to at most this many per load for the co-location SHARE (the share does not need every
 *  30-second fix). The pickup / delivery dwell is found on the FULL track, never the thinned one. */
const MAX_TRUCK_FIXES = 400;
/** Stop "actual" stamps written by the Creator are DATE-ONLY (local midnight, measured: every USMCA stop 05:00Z/06:00Z).
 *  The dwell moment is therefore read from the truck's own GPS: its closest approach to the stop's geocode on that day.
 *  1,500 m covers a facility yard plus geocode precision (rooftop/street); a truck farther than that never reached it. */
export const STOP_ARRIVAL_METERS = 1500;
/** A real stamp (not local midnight) is searched +/- this much for the dwell. */
const STAMPED_DWELL_SEARCH_MS = 6 * 60 * 60 * 1000;
/** A load window longer than this is a data error (a placeholder delivery date), not a trip — flagged, never matched. */
export const MAX_WINDOW_DAYS = 14;

export type GpsFetcher = (samsaraTrailerIds: string[], startIso: string, endIso: string) => Promise<TrailerGpsHistory>;

export type CandidateScore = {
  trailer_id: string;
  trailer_number: string | null;
  paired: number;
  co_located: number;
  share: number;
  at_pickup: boolean;
  at_delivery: boolean;
  matches: boolean;
};
export type LoadTrailerDecision = {
  load_id: string;
  load_number: string | null;
  truck_unit_id: string | null;
  truck_unit_number: string | null;
  window_start: string | null;
  window_end: string | null;
  truck_fixes: number;
  existing_trailer_id: string | null;
  /** The truck's GPS moment at the pickup / delivery stop (stop stamps are date-only). */
  pickup_dwell_at?: string | null;
  delivery_dwell_at?: string | null;
  /** Data-path proof: Samsara calls for this load and how many trailers survived each stage. */
  samsara?: { requests: number; retries: number; rows: number; trailers_queried: number; trailers_with_fixes_at_pickup: number; at_pickup: number; at_delivery: number };
  decision: "match" | "confirm" | "conflict" | "no_truck_gps" | "no_trailer_gps" | "no_co_located_trailer" | "two_candidates" | "no_window" | "samsara_unavailable";
  trailer_id: string | null;
  trailer_number: string | null;
  reason: string;
  candidates: CandidateScore[];
  outcome: "planned" | "stamped" | "skipped" | "refused";
  expenses_stamped?: number;
  expense_lines_stamped?: number;
  error?: string;
};
export type LoadTrailerGpsResult = {
  dry_run: boolean;
  operating_company_id: string;
  loads_considered: number;
  matched: number;
  confirmed: number;
  conflicts: number;
  no_match: number;
  stamped_loads: number;
  refused_loads: number;
  /** Run-level data-path proof. */
  samsara_requests: number;
  samsara_retries: number;
  trailers_with_any_gps: number;
  loads: LoadTrailerDecision[];
};

const R = 6371000;
export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestInTime(fixes: TrailerGpsFix[], t: number): TrailerGpsFix | null {
  let lo = 0;
  let hi = fixes.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fixes[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const cands = [fixes[lo], fixes[lo - 1]].filter(Boolean) as TrailerGpsFix[];
  let best: TrailerGpsFix | null = null;
  for (const f of cands) if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  return best && Math.abs(best.t - t) <= PAIR_TIME_TOLERANCE_MS ? best : null;
}

/** Pure scoring of one candidate trailer against the truck track (exported for the test and the guard). */
export function scoreCandidate(truck: TrailerGpsFix[], trailer: TrailerGpsFix[], pickupAt: number, deliveryAt: number) {
  let paired = 0;
  let coLocated = 0;
  let atPickup = false;
  let atDelivery = false;
  for (const tf of truck) {
    const near = nearestInTime(trailer, tf.t);
    if (!near) continue;
    paired += 1;
    if (metersBetween(tf, near) <= CO_LOCATED_METERS) {
      coLocated += 1;
      if (Math.abs(tf.t - pickupAt) <= DWELL_TOLERANCE_MS) atPickup = true;
      if (Math.abs(tf.t - deliveryAt) <= DWELL_TOLERANCE_MS) atDelivery = true;
    }
  }
  const share = paired ? coLocated / paired : 0;
  return { paired, co_located: coLocated, share, at_pickup: atPickup, at_delivery: atDelivery, matches: paired >= MIN_PAIRED_FIXES && share >= MIN_CO_LOCATED_SHARE && atPickup && atDelivery };
}

function isLocalMidnightStamp(iso: string): boolean {
  const d = new Date(iso);
  // America/Chicago midnight = 05:00Z (CDT) or 06:00Z (CST), with zero minutes/seconds — a date-only stamp.
  return d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && (d.getUTCHours() === 5 || d.getUTCHours() === 6);
}
/** Where to look for a stop's dwell: the whole local day for a date-only stamp, +/- 6 h around a real one. */
export function dwellSearchSpan(stamp: string | null): [number, number] {
  const t = stamp ? Date.parse(stamp) : NaN;
  if (!Number.isFinite(t)) return [NaN, NaN];
  return isLocalMidnightStamp(String(stamp)) ? [t, t + 86_400_000] : [t - STAMPED_DWELL_SEARCH_MS, t + STAMPED_DWELL_SEARCH_MS];
}
/** The truck's closest approach to the stop inside the span, if within STOP_ARRIVAL_METERS; else null. */
export function dwellAt(track: TrailerGpsFix[], lat: number | null, lng: number | null, span: [number, number]): number | null {
  if (lat == null || lng == null || !Number.isFinite(span[0])) return null;
  let best: { t: number; m: number } | null = null;
  for (const f of track) {
    if (f.t < span[0] || f.t > span[1]) continue;
    const m = metersBetween(f, { lat, lng });
    if (!best || m < best.m) best = { t: f.t, m };
  }
  return best && best.m <= STOP_ARRIVAL_METERS ? best.t : null;
}
function truckFixesAround(track: TrailerGpsFix[], at: number): TrailerGpsFix[] {
  return track.filter((f) => Math.abs(f.t - at) <= DWELL_TOLERANCE_MS);
}
/** The thinned track plus the full-resolution fixes inside both dwell tolerances (thinning must never drop the dwell). */
function withDwellFixes(thinned: TrailerGpsFix[], full: TrailerGpsFix[], pickupAt: number, deliveryAt: number): TrailerGpsFix[] {
  const extra = full.filter((f) => Math.abs(f.t - pickupAt) <= DWELL_TOLERANCE_MS || Math.abs(f.t - deliveryAt) <= DWELL_TOLERANCE_MS);
  const seen = new Set(thinned.map((f) => f.t));
  return [...thinned, ...extra.filter((f) => !seen.has(f.t))].sort((a, b) => a.t - b.t);
}

function thin<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(rows[Math.floor(i * step)]);
  return out;
}

export async function matchLoadTrailersByGps(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; dryRun: boolean; loadIds?: string[]; fetchTrailerGps: GpsFetcher }
): Promise<LoadTrailerGpsResult> {
  const opco = input.operatingCompanyId;
  const loads = (
    await client.query<{
      id: string; load_number: string | null; unit_id: string | null; unit_number: string | null;
      w0: string | null; w1: string | null; pickup_at: string | null; delivery_at: string | null; expense_trailer_id: string | null;
      p_lat: number | null; p_lng: number | null; d_lat: number | null; d_lng: number | null;
    }>(
      `SELECT l.id::text, l.load_number::text, l.assigned_unit_id::text AS unit_id, u.unit_number::text,
              w.w0, w.w1, w.pickup_at, w.delivery_at, w.p_lat, w.p_lng, w.d_lat, w.d_lng,
              (SELECT (array_agg(DISTINCT x.trailer_id))[1]::text FROM accounting.expenses x
                WHERE x.load_id = l.id AND x.operating_company_id = l.operating_company_id
                  AND x.voided_at IS NULL AND x.trailer_id IS NOT NULL
               HAVING count(DISTINCT x.trailer_id) = 1) AS expense_trailer_id
         FROM mdata.loads l
         LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                                AND (u.owner_company_id = l.operating_company_id OR u.currently_leased_to_company_id = l.operating_company_id)
         LEFT JOIN LATERAL (
           SELECT min(COALESCE(s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at))::text AS w0,
                  max(COALESCE(s.actual_departure_at, s.actual_arrival_at, s.scheduled_departure_at, s.scheduled_arrival_at, s.appointment_end_at))::text AS w1,
                  (array_agg(COALESCE(s.actual_departure_at, s.actual_arrival_at, s.scheduled_departure_at, s.scheduled_arrival_at, s.appointment_start_at)
                             ORDER BY s.sequence_number ASC))[1]::text AS pickup_at,
                  (array_agg(COALESCE(s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at, s.actual_departure_at, s.scheduled_departure_at)
                             ORDER BY s.sequence_number DESC))[1]::text AS delivery_at,
                  (array_agg(s.latitude::float8 ORDER BY s.sequence_number ASC))[1] AS p_lat,
                  (array_agg(s.longitude::float8 ORDER BY s.sequence_number ASC))[1] AS p_lng,
                  (array_agg(s.latitude::float8 ORDER BY s.sequence_number DESC))[1] AS d_lat,
                  (array_agg(s.longitude::float8 ORDER BY s.sequence_number DESC))[1] AS d_lng
             FROM mdata.load_stops s WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL
         ) w ON true
        WHERE l.operating_company_id = $1::uuid
          AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL
          AND l.trailer_source IS DISTINCT FROM 'customer'
          AND NOT EXISTS (SELECT 1 FROM dispatch.load_assignment_history h
                           WHERE h.load_id = l.id AND h.operating_company_id = l.operating_company_id AND h.new_trailer_id IS NOT NULL)
          AND ($2::uuid[] IS NULL OR l.id = ANY($2::uuid[]))
        ORDER BY l.load_number`,
      [opco, input.loadIds?.length ? input.loadIds : null]
    )
  ).rows;

  const trailers = (
    await client.query<{ id: string; equipment_number: string | null; samsara_id: string }>(
      `SELECT e.id::text, e.equipment_number::text, e.samsara_vehicle_id::text AS samsara_id
         FROM mdata.equipment e
        WHERE (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)
          AND e.deactivated_at IS NULL AND e.samsara_vehicle_id IS NOT NULL`,
      [opco]
    )
  ).rows;
  const numberOf = new Map(trailers.map((t) => [t.id, t.equipment_number]));

  const result: LoadTrailerGpsResult = {
    dry_run: input.dryRun, operating_company_id: opco, loads_considered: loads.length,
    matched: 0, confirmed: 0, conflicts: 0, no_match: 0, stamped_loads: 0, refused_loads: 0,
    samsara_requests: 0, samsara_retries: 0, trailers_with_any_gps: 0, loads: [],
  };
  const gpsSeen = new Set<string>();

  for (const l of loads) {
    const d: LoadTrailerDecision = {
      load_id: l.id, load_number: l.load_number, truck_unit_id: l.unit_id, truck_unit_number: l.unit_number,
      window_start: l.w0, window_end: l.w1, truck_fixes: 0, existing_trailer_id: l.expense_trailer_id,
      decision: "no_window", trailer_id: null, trailer_number: null, reason: "", candidates: [], outcome: "skipped",
    };
    result.loads.push(d);
    // Stop stamps are often date-only (local midnight): the trip window runs from the start of the pickup search span to
    // the end of the delivery search span, so a same-day load still has a real window.
    const pSpan = dwellSearchSpan(l.pickup_at ?? l.w0);
    const dSpan = dwellSearchSpan(l.delivery_at ?? l.w1);
    const w0 = Math.min(l.w0 ? Date.parse(l.w0) : NaN, pSpan[0]);
    const w1 = Math.max(l.w1 ? Date.parse(l.w1) : NaN, dSpan[1]);
    d.window_start = Number.isFinite(w0) ? new Date(w0).toISOString() : l.w0;
    d.window_end = Number.isFinite(w1) ? new Date(w1).toISOString() : l.w1;
    if (!l.unit_id || !Number.isFinite(w0) || !Number.isFinite(w1) || w1 <= w0) {
      d.reason = !l.unit_id ? "load has no truck assigned" : "load has no pickup -> delivery window";
      result.no_match += 1;
      continue;
    }
    if ((w1 - w0) / 86_400_000 > MAX_WINDOW_DAYS) {
      d.reason = `load window is ${Math.round((w1 - w0) / 86_400_000)} days (> ${MAX_WINDOW_DAYS}) — the stop dates look like placeholders, fix the stops`;
      result.no_match += 1;
      continue;
    }
    const fullTruck = (
      await client.query<{ t: string; lat: number; lng: number }>(
        `SELECT v.captured_at::text AS t, v.lat::float8 AS lat, v.lng::float8 AS lng
           FROM telematics.vehicle_locations v
          WHERE v.unit_id = $1::uuid AND v.operating_company_id = $2::uuid
            AND v.captured_at BETWEEN $3::timestamptz AND $4::timestamptz
            AND v.lat IS NOT NULL AND v.lng IS NOT NULL
          ORDER BY v.captured_at`,
        [l.unit_id, opco, new Date(w0).toISOString(), new Date(w1).toISOString()]
      )
    ).rows.map((r) => ({ t: Date.parse(r.t), lat: Number(r.lat), lng: Number(r.lng) }));
    const truck = thin(fullTruck, MAX_TRUCK_FIXES);
    d.truck_fixes = truck.length;
    if (truck.length < MIN_PAIRED_FIXES) {
      d.decision = "no_truck_gps";
      d.reason = `truck ${l.unit_number ?? l.unit_id} has ${truck.length} GPS fix(es) in the load window`;
      result.no_match += 1;
      continue;
    }
    const pickupAt = dwellAt(fullTruck, l.p_lat, l.p_lng, pSpan);
    const deliveryAt = dwellAt(fullTruck, l.d_lat, l.d_lng, dSpan);
    d.pickup_dwell_at = pickupAt == null ? null : new Date(pickupAt).toISOString();
    d.delivery_dwell_at = deliveryAt == null ? null : new Date(deliveryAt).toISOString();
    if (pickupAt == null || deliveryAt == null) {
      d.decision = "no_truck_gps";
      d.reason = `truck ${l.unit_number ?? ""} GPS never within ${STOP_ARRIVAL_METERS} m of the ${pickupAt == null ? "pickup" : "delivery"} stop on its date${(pickupAt == null ? l.p_lat : l.d_lat) == null ? " (stop not geocoded)" : ""}`;
      result.no_match += 1;
      continue;
    }
    const sam = { requests: 0, retries: 0, rows: 0, trailers_queried: trailers.length, trailers_with_fixes_at_pickup: 0, at_pickup: 0, at_delivery: 0 };
    d.samsara = sam;
    const fetchSpan = async (ids: string[], t0: number, t1: number) => {
      const h = await input.fetchTrailerGps(ids, new Date(t0 - PAIR_TIME_TOLERANCE_MS).toISOString(), new Date(t1 + PAIR_TIME_TOLERANCE_MS).toISOString());
      sam.requests += h.requests; sam.retries += h.retries; sam.rows += h.rows;
      result.samsara_requests += h.requests; result.samsara_retries += h.retries;
      for (const [id, f] of h.fixes) if (f.length) gpsSeen.add(id);
      result.trailers_with_any_gps = gpsSeen.size;
      return h.fixes;
    };
    const bySamsara = new Map(trailers.map((t) => [t.samsara_id, t]));
    const nearTruck = (fixes: TrailerGpsFix[], at: number) =>
      truckFixesAround(fullTruck, at).some((tf) => { const n = nearestInTime(fixes, tf.t); return !!n && metersBetween(tf, n) <= CO_LOCATED_METERS; });
    let full: Map<string, TrailerGpsFix[]>;
    try {
      // Stage 1 — every fleet trailer, only around the pickup dwell (one short request instead of the whole trip).
      const atP = await fetchSpan(trailers.map((t) => t.samsara_id), pickupAt - DWELL_TOLERANCE_MS, pickupAt + DWELL_TOLERANCE_MS);
      sam.trailers_with_fixes_at_pickup = [...atP.values()].filter((f) => f.length).length;
      let ids = [...atP].filter(([, f]) => nearTruck(f, pickupAt)).map(([id]) => id);
      sam.at_pickup = ids.length;
      // Stage 2 — only trailers that were with the truck at pickup, around the delivery dwell.
      if (ids.length) {
        const atD = await fetchSpan(ids, deliveryAt - DWELL_TOLERANCE_MS, deliveryAt + DWELL_TOLERANCE_MS);
        ids = ids.filter((id) => nearTruck(atD.get(id) ?? [], deliveryAt));
      }
      sam.at_delivery = ids.length;
      // The expense trailer is always scored too, so a confirm / conflict is reported on evidence.
      const existingSid = trailers.find((t) => t.id === l.expense_trailer_id)?.samsara_id;
      if (existingSid && !ids.includes(existingSid)) ids.push(existingSid);
      // Stage 3 — the whole trip, only for the survivors: the share test runs on the full track.
      full = ids.length ? await fetchSpan(ids, w0, w1) : new Map();
    } catch (e) {
      d.decision = "samsara_unavailable";
      d.reason = `Samsara trailer GPS could not be read: ${String((e as Error)?.message ?? e)}`;
      result.no_match += 1;
      continue;
    }
    const anyTrailerFix = sam.trailers_with_fixes_at_pickup > 0;
    for (const [sid, fixes] of full) {
      const t = bySamsara.get(sid);
      if (!t) continue;
      const s = scoreCandidate(withDwellFixes(truck, fullTruck, pickupAt, deliveryAt), fixes, pickupAt, deliveryAt);
      if (s.paired > 0) d.candidates.push({ trailer_id: t.id, trailer_number: t.equipment_number, ...s, share: Math.round(s.share * 1000) / 1000 });
    }
    d.candidates.sort((a, b) => b.co_located - a.co_located);
    d.candidates = d.candidates.slice(0, 5);
    const winners = d.candidates.filter((c) => c.matches);
    if (winners.length === 0) {
      d.decision = anyTrailerFix ? "no_co_located_trailer" : "no_trailer_gps";
      d.reason = anyTrailerFix
        ? `no fleet trailer stayed with truck ${l.unit_number ?? ""} (>= ${MIN_CO_LOCATED_SHARE * 100}% within ${CO_LOCATED_METERS} m and at pickup + delivery)`
        : "no fleet trailer reported GPS in the load window";
      result.no_match += 1;
      continue;
    }
    if (winners.length > 1) {
      d.decision = "two_candidates";
      d.reason = `two candidates: ${winners.map((c) => c.trailer_number ?? c.trailer_id).join(", ")}`;
      result.no_match += 1;
      continue;
    }
    const w = winners[0];
    d.trailer_id = w.trailer_id;
    d.trailer_number = numberOf.get(w.trailer_id) ?? null;
    if (l.expense_trailer_id && l.expense_trailer_id !== w.trailer_id) {
      d.decision = "conflict";
      d.reason = `GPS says ${d.trailer_number ?? w.trailer_id}, the load's expenses say ${numberOf.get(l.expense_trailer_id) ?? l.expense_trailer_id} — not written`;
      result.conflicts += 1;
      continue;
    }
    d.decision = l.expense_trailer_id ? "confirm" : "match";
    d.reason = `trailer ${d.trailer_number ?? w.trailer_id} co-located on ${w.co_located}/${w.paired} fixes (${Math.round(w.share * 100)}%), at pickup and delivery`;
    if (d.decision === "confirm") result.confirmed += 1;
    else result.matched += 1;
    d.outcome = "planned";
    if (input.dryRun) continue;

    await client.query("SAVEPOINT gps_trailer_load");
    try {
      await client.query(
        `INSERT INTO dispatch.load_assignment_history
           (operating_company_id, load_id, assignment_method, previous_trailer_id, new_trailer_id,
            assigned_by_user_id, warnings_acknowledged, reason_code, notes)
         VALUES ($1::uuid, $2::uuid, 'auto_reassign', NULL, $3::uuid, $4::uuid, '[]'::jsonb, 'gps_trailer_match', $5)`,
        [opco, l.id, w.trailer_id, input.actorUserId, JSON.stringify({ rule: "443.107 GPS co-location", ...w, truck_fixes: truck.length })]
      );
      const ex = await client.query<{ id: string }>(
        `UPDATE accounting.expenses x SET trailer_id = $3::uuid
          WHERE x.load_id = $2::uuid AND x.operating_company_id = $1::uuid AND x.voided_at IS NULL
            AND x.trailer_id IS NULL AND x.non_owned_trailer_id IS NULL
          RETURNING x.id::text`,
        [opco, l.id, w.trailer_id]
      );
      const exl = await client.query(
        `UPDATE accounting.expense_lines el SET trailer_id = $3::uuid
           FROM accounting.expenses x
          WHERE el.expense_id = x.id AND el.operating_company_id = x.operating_company_id
            AND x.load_id = $2::uuid AND x.operating_company_id = $1::uuid AND x.voided_at IS NULL
            AND x.non_owned_trailer_id IS NULL AND el.trailer_id IS NULL`,
        [opco, l.id, w.trailer_id]
      );
      d.expenses_stamped = ex.rows.length;
      d.expense_lines_stamped = exl.rowCount ?? 0;
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        "load.trailer_matched_by_gps",
        { resource_type: "mdata.loads", resource_id: l.id, operating_company_id: opco, load_number: l.load_number,
          trailer_id: w.trailer_id, trailer_number: d.trailer_number, decision: d.decision, evidence: w,
          expenses_stamped: d.expenses_stamped, expense_lines_stamped: d.expense_lines_stamped },
        "info",
        "LEAD-443.107-GPS-TRAILER"
      );
      await client.query("RELEASE SAVEPOINT gps_trailer_load");
      d.outcome = "stamped";
      result.stamped_loads += 1;
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT gps_trailer_load");
      d.outcome = "refused";
      d.error = String((e as Error)?.message ?? e);
      result.refused_loads += 1;
    }
  }
  return result;
}
