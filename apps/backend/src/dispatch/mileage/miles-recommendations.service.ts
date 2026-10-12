// 443.55 (owner 2026-10-11 09:33 CT): "In loads it should show both recommendations historical and google and we should be
// able to select which ones for short and practical etc."
//
// ONE engine call returns TWO recommendations per miles field (practical / short / empty), each with its evidence:
//   HISTORICAL — catalogs.lane_mileage for the lane (first stop -> last stop; zip pair, else city pair): the average, how many
//                past loads, min–max, last seen, confidence, autofill_allowed, the short-miles untrustworthy flag.
//   GOOGLE     — Google's driving distance over the stop sequence (sum of legs) and, for empty / deadhead, from the unit's
//                previous last stop to the first stop (googleLegMiles, cached in catalogs.point_mileage engine 'google').
// Neither is written to the load by itself. setMilesChoice writes ONE field: the value from the chosen source (historical |
// google | manual with a reason | document), both recommendations at that moment, who and when — into the existing miles
// column + mdata.loads.miles_choice, with an audit row. No driver bill, settlement or pay rate is read or written here:
// driver pay miles are the signed settlement.
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { computeRouteReference } from "../../integrations/google/routes-api-client.js";
import { googleLegMiles, type RouteFn } from "../load-lane-learning.service.js";
import { loadedMilesFor } from "../book-load.service.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const MILES_FIELDS = ["practical", "short", "empty"] as const;
export type MilesField = (typeof MILES_FIELDS)[number];
export const MILES_SOURCES = ["historical", "google", "manual", "document"] as const;
export type MilesSource = (typeof MILES_SOURCES)[number];

/** The load column each field's chosen value lives in. */
export const MILES_FIELD_COLUMN: Readonly<Record<MilesField, "miles_practical" | "miles_shortest" | "miles_deadhead">> = Object.freeze({
  practical: "miles_practical",
  short: "miles_shortest",
  empty: "miles_deadhead",
});

export type StopPoint = { latitude: number | null; longitude: number | null; city: string | null; state: string | null; postal_code: string | null };

export type HistoricalRec = {
  value: number; n_loads: number; min: number | null; max: number | null; last_seen: string | null;
  confidence: string | null; autofill_allowed: boolean; untrustworthy_reason: string | null;
};
export type FieldChoice = { value: number | null; source: MilesSource | null; chosen_by: string | null; chosen_at: string | null; reason: string | null };
export type FieldRec = {
  current: FieldChoice | null;
  historical: HistoricalRec | null;
  historical_missing_reason: string | null;
  google: { value: number; fetched_at: string } | null;
  google_missing_reason: string | null;
  difference: number | null;
  default_source: "historical" | "google" | "document" | null;
};
export type MilesRecommendations = { load_id: string | null; fields: Record<MilesField, FieldRec> };

type LaneRow = {
  practical_miles: string | null; short_miles: string | null; empty_miles: string | null; n_practical: number | null; n_short: number | null;
  practical_min: string | null; practical_max: string | null; short_min: string | null; short_max: string | null; last_seen: string | null;
  confidence: string | null; autofill_allowed: boolean | null; short_miles_untrustworthy: boolean | null; short_miles_untrustworthy_reason: string | null;
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
const located = (s: StopPoint) => s.latitude != null && s.longitude != null;

/** The historical lane row for first stop -> last stop: zip pair first, else city pair. */
async function laneRow(client: Queryable, companyId: string, from: StopPoint, to: StopPoint): Promise<LaneRow | null> {
  const cols = `practical_miles::text, short_miles::text, empty_miles::text, n_practical, n_short, practical_min::text, practical_max::text,
                short_min::text, short_max::text, last_seen::text, confidence, autofill_allowed, short_miles_untrustworthy, short_miles_untrustworthy_reason`;
  const zip = (z: string | null) => String(z ?? "").trim().slice(0, 5);
  if (zip(from.postal_code) && zip(to.postal_code)) {
    const r = (
      await client.query<LaneRow>(
        `SELECT ${cols} FROM catalogs.lane_mileage
          WHERE operating_company_id = $1::uuid AND left(origin_postal_code, 5) = $2 AND left(dest_postal_code, 5) = $3 AND practical_miles > 0
          ORDER BY n_practical DESC NULLS LAST LIMIT 1`,
        [companyId, zip(from.postal_code), zip(to.postal_code)]
      )
    ).rows[0];
    if (r) return r;
  }
  if (!from.city || !from.state || !to.city || !to.state) return null;
  return (
    (
      await client.query<LaneRow>(
        `SELECT ${cols} FROM catalogs.lane_mileage
          WHERE operating_company_id = $1::uuid AND lower(origin_city) = lower($2) AND upper(origin_state) = upper($3)
            AND lower(dest_city) = lower($4) AND upper(dest_state) = upper($5) AND practical_miles > 0
          ORDER BY n_practical DESC NULLS LAST LIMIT 1`,
        [companyId, from.city.trim(), from.state.trim(), to.city.trim(), to.state.trim()]
      )
    ).rows[0] ?? null
  );
}

/** The unit's previous last stop before `before` (or the latest one when no date) — where the empty run starts. */
async function priorLastStop(client: Queryable, companyId: string, unitId: string, excludeLoadId: string | null, before: string | null): Promise<StopPoint | null> {
  const r = (
    await client.query<StopPoint & { at: string | null }>(
      `SELECT ls.latitude::float8 AS latitude, ls.longitude::float8 AS longitude, ls.city, ls.state, ls.postal_code, ls.at::text
         FROM mdata.loads l
         JOIN LATERAL (
           SELECT x.latitude, x.longitude, x.city, x.state, x.postal_code, COALESCE(x.actual_arrival_at, x.scheduled_arrival_at, x.appointment_start_at) AS at
             FROM mdata.load_stops x WHERE x.load_id = l.id AND x.soft_deleted_at IS NULL
            ORDER BY x.sequence_number DESC LIMIT 1
         ) ls ON true
        WHERE l.assigned_unit_id = $1::uuid AND l.operating_company_id = $2::uuid AND ($3::uuid IS NULL OR l.id <> $3::uuid)
          AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL AND l.status::text NOT IN ('cancelled', 'canceled', 'void', 'voided')
          AND ls.at IS NOT NULL AND ($4::timestamptz IS NULL OR ls.at < $4::timestamptz)
        ORDER BY ls.at DESC, l.load_number DESC LIMIT 1`,
      [unitId, companyId, excludeLoadId, before]
    )
  ).rows[0];
  return r ?? null;
}

function fieldRec(
  historical: HistoricalRec | null,
  historicalMissing: string | null,
  google: { value: number; fetched_at: string } | null,
  googleMissing: string | null,
  current: FieldChoice | null
): FieldRec {
  const difference = historical && google ? round1(google.value - historical.value) : null;
  const default_source: FieldRec["default_source"] =
    current?.source === "document" || (current?.value != null && current.source == null) ? "document"
    : historical?.autofill_allowed ? "historical"
    : google ? "google"
    : historical ? "historical"
    : null;
  return {
    current,
    historical,
    historical_missing_reason: historical ? null : historicalMissing,
    google,
    google_missing_reason: google ? null : googleMissing,
    difference,
    default_source,
  };
}

/** Both recommendations for a stop sequence (Book Load before booking, or a booked load's stops). Reads + Google cache only. */
export async function computeMilesRecommendations(
  client: Queryable,
  args: { operatingCompanyId: string; stops: StopPoint[]; unitId?: string | null; loadId?: string | null; firstStopAt?: string | null; current?: Partial<Record<MilesField, FieldChoice>> },
  route: RouteFn = computeRouteReference
): Promise<MilesRecommendations> {
  const stops = args.stops;
  const current = args.current ?? {};
  const first = stops[0];
  const last = stops[stops.length - 1];

  // HISTORICAL
  let lane: LaneRow | null = null;
  let laneMissing = "no history for this lane";
  if (stops.length < 2 || !first || !last) laneMissing = "needs at least two stops";
  else lane = await laneRow(client, args.operatingCompanyId, first, last);
  const nP = Number(lane?.n_practical ?? 0);
  const histPractical: HistoricalRec | null = lane && pos(lane.practical_miles) != null
    ? { value: round1(Number(lane.practical_miles)), n_loads: nP, min: num(lane.practical_min), max: num(lane.practical_max), last_seen: lane.last_seen,
        confidence: lane.confidence, autofill_allowed: Boolean(lane.autofill_allowed), untrustworthy_reason: null }
    : null;
  const histShort: HistoricalRec | null = lane && pos(lane.short_miles) != null
    ? { value: round1(Number(lane.short_miles)), n_loads: Number(lane.n_short ?? 0), min: num(lane.short_min), max: num(lane.short_max), last_seen: lane.last_seen,
        confidence: lane.confidence, autofill_allowed: Boolean(lane.autofill_allowed) && !lane.short_miles_untrustworthy,
        untrustworthy_reason: lane.short_miles_untrustworthy ? lane.short_miles_untrustworthy_reason ?? "short miles flagged untrustworthy" : null }
    : null;
  // 443.55 "never a blank, never a zero": an average of 0 empty miles is no recommendation — the missing reason shows instead.
  const histEmpty: HistoricalRec | null = lane && pos(lane.empty_miles) != null
    ? { value: round1(Number(lane.empty_miles)), n_loads: nP, min: null, max: null, last_seen: lane.last_seen,
        confidence: lane.confidence, autofill_allowed: Boolean(lane.autofill_allowed), untrustworthy_reason: null }
    : null;

  // GOOGLE — loaded: sum over consecutive located stops; any leg without a route = no Google total (never a partial sum).
  let googleLoaded: { value: number; fetched_at: string } | null = null;
  let googleLoadedMissing: string | null = null;
  if (stops.length < 2) googleLoadedMissing = "needs at least two stops";
  else if (!stops.every(located)) googleLoadedMissing = "a stop has no real point yet";
  else {
    let total = 0;
    let oldest: string | null = null;
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]!, b = stops[i]!;
      const leg = await googleLegMiles(client, { lat: Number(a.latitude), lng: Number(a.longitude) }, { lat: Number(b.latitude), lng: Number(b.longitude) }, route);
      if (!leg) { googleLoadedMissing = "Google had no route"; total = -1; break; }
      total += leg.miles;
      if (!oldest || leg.fetched_at < oldest) oldest = leg.fetched_at;
    }
    if (total >= 0) googleLoaded = { value: round1(total), fetched_at: oldest ?? new Date().toISOString() };
  }
  // GOOGLE — empty / deadhead: the unit's previous last stop -> the first stop.
  let googleEmpty: { value: number; fetched_at: string } | null = null;
  let googleEmptyMissing: string | null = null;
  if (!args.unitId) googleEmptyMissing = "no unit assigned — no previous stop to measure from";
  else if (!first || !located(first)) googleEmptyMissing = "the first stop has no real point yet";
  else {
    const prior = await priorLastStop(client, args.operatingCompanyId, args.unitId, args.loadId ?? null, args.firstStopAt ?? null);
    if (!prior) googleEmptyMissing = "no previous load for this unit";
    else if (!located(prior)) googleEmptyMissing = "the previous load's last stop has no real point";
    else {
      const leg = await googleLegMiles(client, { lat: Number(prior.latitude), lng: Number(prior.longitude) }, { lat: Number(first.latitude), lng: Number(first.longitude) }, route);
      if (leg) googleEmpty = { value: leg.miles, fetched_at: leg.fetched_at };
      else googleEmptyMissing = "Google had no route";
    }
  }

  return {
    load_id: args.loadId ?? null,
    fields: {
      practical: fieldRec(histPractical, laneMissing, googleLoaded, googleLoadedMissing, current.practical ?? null),
      // Google returns ONE driving route; it has no separate shortest route, so its loaded distance is the Short comparison too.
      short: fieldRec(histShort, lane ? (lane.short_miles_untrustworthy ? lane.short_miles_untrustworthy_reason ?? "short miles flagged untrustworthy" : "no short-miles history for this lane") : laneMissing,
        googleLoaded, googleLoadedMissing, current.short ?? null),
      empty: fieldRec(histEmpty, lane ? "no empty-miles history for this lane" : laneMissing, googleEmpty, googleEmptyMissing, current.empty ?? null),
    },
  };
}

type LoadMilesRow = {
  id: string; assigned_unit_id: string | null; miles_practical: string | null; miles_shortest: string | null; miles_deadhead: string | null;
  miles_choice: Record<string, Record<string, unknown>> | null;
};

async function loadMilesRow(client: Queryable, companyId: string, loadId: string): Promise<LoadMilesRow | null> {
  return (
    (
      await client.query<LoadMilesRow>(
        `SELECT id::text, assigned_unit_id::text, miles_practical::text, miles_shortest::text, miles_deadhead::text, miles_choice
           FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL`,
        [loadId, companyId]
      )
    ).rows[0] ?? null
  );
}

function currentFor(row: LoadMilesRow): Record<MilesField, FieldChoice> {
  const out = {} as Record<MilesField, FieldChoice>;
  for (const f of MILES_FIELDS) {
    const c = row.miles_choice?.[f] ?? null;
    const value = num(row[MILES_FIELD_COLUMN[f]]);
    out[f] = {
      value,
      source: (c?.source as MilesSource | undefined) ?? null,
      chosen_by: (c?.chosen_by as string | undefined) ?? null,
      chosen_at: (c?.chosen_at as string | undefined) ?? null,
      reason: (c?.reason as string | undefined) ?? null,
    };
  }
  return out;
}

async function loadStopPoints(client: Queryable, companyId: string, loadId: string): Promise<{ stops: StopPoint[]; firstAt: string | null }> {
  const rows = (
    await client.query<StopPoint & { at: string | null }>(
      `SELECT s.latitude::float8 AS latitude, s.longitude::float8 AS longitude, s.city, s.state, s.postal_code,
              COALESCE(s.actual_arrival_at, s.scheduled_arrival_at, s.appointment_start_at)::text AS at
         FROM mdata.load_stops s WHERE s.load_id = $1::uuid AND s.operating_company_id = $2::uuid AND s.soft_deleted_at IS NULL
        ORDER BY s.sequence_number`,
      [loadId, companyId]
    )
  ).rows;
  return { stops: rows, firstAt: rows[0]?.at ?? null };
}

/** Both recommendations for a booked load, with what is chosen today. */
export async function milesRecommendationsForLoad(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string },
  route: RouteFn = computeRouteReference
): Promise<MilesRecommendations | null> {
  const row = await loadMilesRow(client, args.operatingCompanyId, args.loadId);
  if (!row) return null;
  const { stops, firstAt } = await loadStopPoints(client, args.operatingCompanyId, args.loadId);
  const current = currentFor(row);
  // Who chose is shown by name, never as a raw user id.
  const ids = [...new Set(Object.values(current).map((c) => c.chosen_by).filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v)))];
  if (ids.length) {
    const names = new Map(
      (
        await client.query<{ id: string; name: string }>(
          `SELECT id::text, coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email) AS name FROM identity.users WHERE id = ANY($1::uuid[])`,
          [ids]
        )
      ).rows.map((r) => [r.id, r.name])
    );
    for (const c of Object.values(current)) if (c.chosen_by && names.has(c.chosen_by)) c.chosen_by = names.get(c.chosen_by)!;
  }
  return computeMilesRecommendations(
    client,
    { operatingCompanyId: args.operatingCompanyId, stops, unitId: row.assigned_unit_id, loadId: row.id, firstStopAt: firstAt, current },
    route
  );
}

export class MilesChoiceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Choose ONE field's source. The value comes from the source (historical / google from the engine right now; manual = the typed
 * value, reason required; document = the value the load already carries). Writes the miles column + miles_choice[field] (both
 * recommendations at this moment, who, when) and an audit row. A manual value more than 10% from BOTH recommendations is
 * flagged (flag_far_from_both) — kept, not hidden. Never touches a driver bill, settlement or pay rate.
 */
export async function setMilesChoice(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; field: MilesField; source: MilesSource; manualValue?: number | null; reason?: string | null; actorUserId: string },
  route: RouteFn = computeRouteReference
): Promise<MilesRecommendations> {
  if (!MILES_FIELDS.includes(args.field)) throw new MilesChoiceError("miles_field_invalid");
  if (!MILES_SOURCES.includes(args.source)) throw new MilesChoiceError("miles_source_invalid");
  const recs = await milesRecommendationsForLoad(client, { operatingCompanyId: args.operatingCompanyId, loadId: args.loadId }, route);
  if (!recs) throw new MilesChoiceError("load_not_found");
  const rec = recs.fields[args.field];
  const row = (await loadMilesRow(client, args.operatingCompanyId, args.loadId))!;
  const prior = row.miles_choice?.[args.field] ?? null;
  const columnValue = num(row[MILES_FIELD_COLUMN[args.field]]);
  // The document's value is remembered the first time any other source replaces it, so "document" can always be re-chosen.
  const documentValue = num(prior?.document_value) ?? (prior?.source == null || prior?.source === "document" ? columnValue : null);

  let value: number | null;
  if (args.source === "historical") value = rec.historical?.value ?? null;
  else if (args.source === "google") value = rec.google?.value ?? null;
  else if (args.source === "document") value = documentValue;
  else {
    const reason = String(args.reason ?? "").trim();
    if (!reason) throw new MilesChoiceError("manual_miles_requires_reason");
    if (args.manualValue == null || !Number.isFinite(Number(args.manualValue)) || Number(args.manualValue) < 0) throw new MilesChoiceError("manual_miles_value_invalid");
    value = round1(Number(args.manualValue));
  }
  if (value == null) throw new MilesChoiceError(`${args.source}_has_no_value_for_${args.field}`);

  const h = rec.historical?.value ?? null;
  const g = rec.google?.value ?? null;
  const far = (ref: number | null) => ref == null || ref === 0 || Math.abs(value! - ref) / ref > 0.1;
  const flagFarFromBoth = args.source === "manual" && (h != null || g != null) && far(h) && far(g);
  const choice = {
    value,
    source: args.source,
    historical: h,
    google: g,
    document_value: documentValue,
    reason: args.source === "manual" ? String(args.reason).trim() : args.reason?.trim() || null,
    flag_far_from_both: flagFarFromBoth,
    chosen_by: args.actorUserId,
    chosen_at: new Date().toISOString(),
  };
  const col = MILES_FIELD_COLUMN[args.field];
  // The one loaded-miles rule (loadedMilesFor) is re-applied whenever Short or Practical changes.
  const loaded = loadedMilesFor(args.field === "short" ? value : row.miles_shortest, args.field === "practical" ? value : row.miles_practical);
  await client.query(
    `UPDATE mdata.loads
        SET ${col} = $3::numeric,
            loaded_miles = $6::numeric,
            miles_choice = coalesce(miles_choice, '{}'::jsonb) || jsonb_build_object($4::text, $5::jsonb),
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [args.loadId, args.operatingCompanyId, value, args.field, JSON.stringify(choice), loaded]
  );
  await appendCrudAudit(client as never, args.actorUserId, "dispatch.load.miles_choice", {
    resource_type: "mdata.loads",
    resource_id: args.loadId,
    load_id: args.loadId,
    field: args.field,
    column: col,
    old_value: columnValue,
    old_source: (prior?.source as string | undefined) ?? null,
    new_value: value,
    new_source: args.source,
    historical: h,
    google: g,
    reason: choice.reason,
    flag_far_from_both: flagFarFromBoth,
  });
  return (await milesRecommendationsForLoad(client, { operatingCompanyId: args.operatingCompanyId, loadId: args.loadId }, route))!;
}

/**
 * Record the source of every miles field that carries a value but no recorded source as 'document' (Creator / historical
 * loads: the settlement's own miles), with both recommendations at this moment. Never changes a value.
 */
export async function recordDocumentMilesSources(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; actorUserId: string },
  route: RouteFn = computeRouteReference
): Promise<{ recorded: MilesField[] }> {
  const recs = await milesRecommendationsForLoad(client, args, route);
  if (!recs) return { recorded: [] };
  const recorded: MilesField[] = [];
  for (const f of MILES_FIELDS) {
    const cur = recs.fields[f].current;
    if (cur?.value == null || cur.source != null) continue;
    await setMilesChoice(client, { ...args, field: f, source: "document" }, route);
    recorded.push(f);
  }
  return { recorded };
}

// ---------------------------------------------------------------------------------------------------------------------
// RULING 443.86 #1 (CC-3) — DEADHEAD where a previous load exists. The Settlement Creator writes miles_deadhead only from
// the document's printed empty miles (settlement-creator-seed-loads.ts), so a load whose document prints none was left
// NULL even when the truck ran a load before it. fillLoadDeadhead computes it with the same Google engine the empty-miles
// recommendation uses:
//   google_practical_prev_stop          the unit's previous load's last stop -> this load's first pickup
//   google_practical_samsara_position   the unit's FIRST load: the truck's Samsara position at dispatch (last fix at or before
//                                       the first pickup, within 48 h) -> the first pickup
//   otherwise                           nothing written; the reason is returned and listed ("no previous load", ...)
// Only a NULL miles_deadhead is filled — a document or user value is never replaced. Only miles_deadhead, its method and
// miles_choice.empty are written: loaded miles, pay and invoice amounts are untouched (document miles stay the pay basis).
export type DeadheadFillResult = {
  load_id: string; load_number: string | null;
  status: "filled" | "already_set" | "not_filled";
  miles: number | null; method: "google_practical_prev_stop" | "google_practical_samsara_position" | null; reason: string | null;
};

export async function fillLoadDeadhead(
  client: Queryable,
  args: { operatingCompanyId: string; loadId: string; actorUserId: string },
  route: RouteFn = computeRouteReference
): Promise<DeadheadFillResult> {
  const row = (
    await client.query<{ load_number: string | null; miles_deadhead: string | null; unit: string | null }>(
      `SELECT load_number, miles_deadhead::text, assigned_unit_id::text AS unit FROM mdata.loads
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL FOR UPDATE`,
      [args.loadId, args.operatingCompanyId]
    )
  ).rows[0];
  const base = { load_id: args.loadId, load_number: row?.load_number ?? null };
  if (!row) return { ...base, status: "not_filled", miles: null, method: null, reason: "load not found" };
  if (row.miles_deadhead != null) return { ...base, status: "already_set", miles: Number(row.miles_deadhead), method: null, reason: null };
  const recs = await milesRecommendationsForLoad(client, { operatingCompanyId: args.operatingCompanyId, loadId: args.loadId }, route);
  const empty = recs?.fields.empty;
  let miles: number | null = empty?.google?.value ?? null;
  let method: DeadheadFillResult["method"] = miles != null ? "google_practical_prev_stop" : null;
  let reason: string | null = miles != null ? null : empty?.google_missing_reason ?? "no recommendation";
  let from: string | null = miles != null ? "previous load's last stop" : null;

  if (miles == null && reason === "no previous load for this unit" && row.unit) {
    const { stops, firstAt } = await loadStopPoints(client, args.operatingCompanyId, args.loadId);
    const first = stops[0];
    if (!first || !located(first) || !firstAt) reason = "no previous load; the first stop has no real point or time";
    else {
      const fix = (
        await client.query<{ lat: number; lng: number; captured_at: string }>(
          `SELECT lat::float8 AS lat, lng::float8 AS lng, captured_at::text FROM telematics.vehicle_locations
            WHERE unit_id = $1::uuid AND captured_at <= $2::timestamptz AND captured_at > $2::timestamptz - interval '48 hours'
              AND lat IS NOT NULL AND lng IS NOT NULL
            ORDER BY captured_at DESC LIMIT 1`,
          [row.unit, firstAt]
        )
      ).rows[0];
      if (!fix) reason = "no previous load and no Samsara position for the truck in the 48 h before the first pickup";
      else {
        const leg = await googleLegMiles(client, { lat: Number(fix.lat), lng: Number(fix.lng) }, { lat: Number(first.latitude), lng: Number(first.longitude) }, route);
        if (!leg) reason = "Google had no route from the truck's Samsara position";
        else { miles = leg.miles; method = "google_practical_samsara_position"; reason = null; from = `truck Samsara position ${fix.captured_at}`; }
      }
    }
  }
  if (miles == null || !method) return { ...base, status: "not_filled", miles: null, method: null, reason };

  const choice = {
    value: miles, source: "google", historical: empty?.historical?.value ?? null, google: miles, document_value: null,
    reason: `443.86 deadhead: ${from} -> first pickup (Google practical)`, flag_far_from_both: false,
    chosen_by: args.actorUserId, chosen_at: new Date().toISOString(),
  };
  await client.query(
    `UPDATE mdata.loads
        SET miles_deadhead = $3::numeric, deadhead_miles_calculation_method = $4,
            miles_choice = coalesce(miles_choice, '{}'::jsonb) || jsonb_build_object('empty', $5::jsonb), updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND miles_deadhead IS NULL`,
    [args.loadId, args.operatingCompanyId, miles, method, JSON.stringify(choice)]
  );
  await appendCrudAudit(client as never, args.actorUserId, "dispatch.load.deadhead_filled", {
    resource_type: "mdata.loads", resource_id: args.loadId, load_id: args.loadId, operating_company_id: args.operatingCompanyId,
    miles_deadhead: miles, method, from,
  });
  return { ...base, status: "filled", miles, method, reason: null };
}
