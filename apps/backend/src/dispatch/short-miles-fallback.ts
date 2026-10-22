/**
 * LEAD 443.233 — OWNER MILES RULE (owner 10-22 9:39 AM CT, verbatim: "use historical data, or use shortest miles from google
 * maps"). A load with no AlwaysTrack L.Miles gets its pay (short) miles, in order:
 *   1. lane_history — the median recorded short miles of prior USMCA loads on the same lane (first pickup city/state -> last
 *      delivery city/state). Only RECORDED short miles count: a value this rule itself derived is never history (no feedback).
 *   2. google_shortest — Google Routes' shortest driving distance over the load's real geocoded stops, leg by leg (alternatives,
 *      traffic-unaware). Never a straight line, never a guess: a stop without coordinates refuses.
 * A candidate above the load's practical miles is refused (loads_miles_shortest_not_over_practical; short is never longer).
 * The value is written by applyShortMilesFallback with its source on mdata.loads.miles_choice.short, audited. AlwaysTrack
 * L.Miles arriving later replaces it through the same driver-bill engine (Edit Load) and re-prices.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { loadedMilesFor } from "./loaded-miles.js";
import { computeShortestRouteMilesOrReason, type LatLng } from "../integrations/google/routes-api-client.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type ShortMilesSource = "lane_history" | "google_shortest";
export type ShortMilesFallback =
  | { miles: number; source: ShortMilesSource; detail: string }
  | { miles: null; reason: string };

const DERIVED_SOURCES = ["lane_history", "google_shortest"];

/** Pure: the median of recorded lane miles, 0.1 mi. */
export function medianMiles(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

export async function resolveShortMilesFallback(
  client: DbClient,
  input: { operatingCompanyId: string; loadId: string },
  deps: { shortestLeg?: typeof computeShortestRouteMilesOrReason } = {}
): Promise<ShortMilesFallback> {
  const practical = Number(
    (await client.query<{ p: string | null }>(`SELECT miles_practical::text AS p FROM mdata.loads WHERE id = $1::uuid`, [input.loadId])).rows[0]?.p ?? NaN
  );
  const fits = (m: number) => !(Number.isFinite(practical) && practical > 0 && m > practical);
  const reasons: string[] = [];

  // 1. lane history
  const lane = (await client.query<{ o: string | null; d: string | null }>(
    `SELECT (SELECT lower(trim(s.city)) || '|' || lower(trim(s.state)) FROM mdata.load_stops s
              WHERE s.load_id = $1::uuid AND s.stop_type = 'pickup' AND s.city IS NOT NULL ORDER BY s.sequence_number ASC LIMIT 1) AS o,
            (SELECT lower(trim(s.city)) || '|' || lower(trim(s.state)) FROM mdata.load_stops s
              WHERE s.load_id = $1::uuid AND s.stop_type = 'delivery' AND s.city IS NOT NULL ORDER BY s.sequence_number DESC LIMIT 1) AS d`,
    [input.loadId]
  )).rows[0];
  if (lane?.o && lane?.d) {
    const hist = (await client.query<{ m: string }>(
      `SELECT l.miles_shortest::text AS m
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.id <> $2::uuid
          AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND l.miles_shortest > 0
          AND COALESCE(l.miles_choice->'short'->>'source', '') <> ALL($5::text[])
          AND (SELECT lower(trim(s.city)) || '|' || lower(trim(s.state)) FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.stop_type = 'pickup' AND s.city IS NOT NULL ORDER BY s.sequence_number ASC LIMIT 1) = $3
          AND (SELECT lower(trim(s.city)) || '|' || lower(trim(s.state)) FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.stop_type = 'delivery' AND s.city IS NOT NULL ORDER BY s.sequence_number DESC LIMIT 1) = $4`,
      [input.operatingCompanyId, input.loadId, lane.o, lane.d, DERIVED_SOURCES]
    )).rows.map((r) => Number(r.m));
    const med = medianMiles(hist);
    if (med != null && fits(med)) {
      return { miles: med, source: "lane_history", detail: `median of ${hist.length} recorded USMCA load(s) on ${lane.o.replace("|", ", ")} -> ${lane.d.replace("|", ", ")}` };
    }
    reasons.push(med == null ? "no recorded lane history" : `lane median ${med} exceeds practical ${practical}`);
  } else {
    reasons.push("lane unknown (pickup / delivery city missing)");
  }

  // 2. Google shortest over the real geocoded stops
  const stops = (await client.query<{ lat: string | null; lng: string | null }>(
    `SELECT latitude::text AS lat, longitude::text AS lng FROM mdata.load_stops
      WHERE load_id = $1::uuid AND stop_type IN ('pickup', 'delivery') ORDER BY sequence_number ASC`,
    [input.loadId]
  )).rows;
  const pts: LatLng[] = stops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) }));
  if (pts.length < 2 || pts.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || (p.lat === 0 && p.lng === 0))) {
    reasons.push("stops not geocoded");
    return { miles: null, reason: reasons.join("; ") };
  }
  const leg = deps.shortestLeg ?? computeShortestRouteMilesOrReason;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const r = await leg(pts[i - 1]!, pts[i]!);
    if (r.miles == null) {
      reasons.push(`google: ${(r as { reason: string }).reason}`);
      return { miles: null, reason: reasons.join("; ") };
    }
    total += r.miles;
  }
  total = Math.round(total * 10) / 10;
  if (!(total > 0) || !fits(total)) {
    reasons.push(`google shortest ${total} exceeds practical ${practical}`);
    return { miles: null, reason: reasons.join("; ") };
  }
  return { miles: total, source: "google_shortest", detail: `Google Routes shortest over ${pts.length} geocoded stops (${pts.length - 1} leg(s))` };
}

/** Writes the resolved short miles onto the load with its source (miles_choice.short), audited. Only when none is recorded. */
export async function applyShortMilesFallback(
  client: DbClient,
  input: { operatingCompanyId: string; loadId: string; actorUserId: string },
  r: { miles: number; source: ShortMilesSource; detail: string }
): Promise<boolean> {
  // 443.233 (CC-3, verify-loaded-miles-derived red on main): loaded_miles is re-derived by the one rule (loadedMilesFor) from the
  // new short and the load's practical, in the same write.
  const practical = (await client.query<{ p: string | null }>(
    `SELECT miles_practical::text AS p FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.loadId, input.operatingCompanyId]
  )).rows[0]?.p ?? null;
  const loaded = loadedMilesFor(r.miles, practical);
  const upd = await client.query<{ id: string }>(
    `UPDATE mdata.loads
        SET miles_shortest = $3,
            loaded_miles = $7::numeric,
            miles_choice = COALESCE(miles_choice, '{}'::jsonb) || jsonb_build_object('short', jsonb_build_object(
              'value', $3::numeric, 'source', $4::text, 'reason', $5::text, 'chosen_at', now(), 'chosen_by', $6::text)),
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND COALESCE(miles_shortest, 0) = 0
        -- LEAD 443.240: the fallback (lane history / Google) never runs over a signed-settlement document value
        AND NOT (COALESCE(miles_choice->'short'->>'source', '') = 'document' AND miles_choice->'short'->>'document_value' IS NOT NULL)
      RETURNING id::text`,
    [input.loadId, input.operatingCompanyId, r.miles, r.source, r.detail, input.actorUserId, loaded]
  );
  if (!upd.rows[0]) return false;
  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "dispatch.load.short_miles_resolved",
    { operating_company_id: input.operatingCompanyId, load_id: input.loadId, miles_shortest: r.miles, miles_source: r.source, detail: r.detail },
    "info",
    "LEAD-443.233"
  );
  return true;
}
