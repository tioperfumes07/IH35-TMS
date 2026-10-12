/**
 * ENGINE: stop GPS verification — every pickup / delivery stop is checked against where the truck actually stopped.
 * WHY (LEAD 443.74, owner 2026-10-11 16:57 CT verbatim: "Probably the gps is source of truth or verification"): load 13660's
 *   document pickup is "US Cold Storage, 240 Bruce Costin Road, Warsaw NC"; the truck never came within 96 km of it and
 *   loaded in Lumberton NC. A stop the truck never visited has a fence nothing enters, legs Google measures to the wrong
 *   point, and a load the in-transit engine can never move.
 * HOW (per load):
 *   1. The unit's recorded GPS fixes over the load's window (first stop day - 36 h .. last stop day + 48 h, the documents are
 *      day-level) -> dwells (detectStops, the same detector as the odometer capture) of at least LOADING_DWELL_MINUTES.
 *      A dwell at a fuel stop (fuel_stop fence) or at the company yard is never a pickup / delivery.
 *   2. Walking the stops in sequence (each stop's dwell must start after the previous stop's dwell), a stop is
 *        "verified"  — a dwell within VERIFY_RADIUS_M of the stop's point on the stop's day (+- 1 day);
 *        "disagrees" — no such dwell, but the truck dwelled elsewhere that day: the longest such dwell is the stop
 *                      (pickup: the earliest of the longest ties, delivery: the latest);
 *        "no_gps"    — no GPS fixes for the stop's day; "no_dwell" — fixes but no qualifying dwell; "no_point" — the stop
 *                      has no coordinates. These stay as the document says, marked not GPS-verified.
 *   3. A disagreeing dwell resolves to its facility: the owner's Samsara address within FACILITY_RADIUS_M of the dwell point
 *      first, else Google's facility at the point (facilityAtPoint — fuel stops excluded).
 *   4. APPLY (opt-in): the stop takes the verified facility (name, street, city, state, zip, point, google_place_id,
 *      geocode_source 'gps_dwell_samsara' | 'gps_dwell_google'); an audit row keeps the DOCUMENT address, the verified
 *      address and the distance; the stop resolver (geocodeStopsWithClient, the ONE fence writer) draws its location +
 *      fence and queues the fence to Samsara; dispatch.relearn_load_miles re-learns leg miles and deadhead from the verified
 *      points through the mileage engine. Pay miles are never touched.
 * NEVER: moves a stop without a dwell; takes a fuel stop or the yard as a stop; changes an amount, a rate or pay miles.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { facilityAtPoint, isGooglePlacesConfigured, isGooglePlacesEnabled, searchAddress } from "../integrations/google/google-places-client.js";
import { detectStops, type PositionFix, type StopEvent } from "./stop-odometer-capture.service.js";
import { geocodeStopsWithClient } from "./stops-geocode-backfill.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const LOADING_DWELL_MINUTES = 30;
/** Any stop of the truck (>= the detector's 3 min) this close to the stop's point verifies it: docks and lots sit off the pin. */
export const VERIFY_RADIUS_M = 1500;
/** A dwell this close to ANOTHER load's stop of the same truck is that stop, never this one. */
export const OTHER_STOP_RADIUS_M = 1500;
/** Beyond this the truck was simply somewhere else on the document's dates (measured 2026-10-11: dwells 1,350-2,530 km from the
 *  stop) — the load's dates or unit disagree with the GPS, not its address. Listed as gps_elsewhere, never moved. 13660 = 96 km. */
export const MAX_CORRECTION_M = 250_000;
export const FACILITY_RADIUS_M = 400;
/** RULING 443.86 #2: a ZIP-CENTER stop (no street, the point is the zip centroid) takes the truck's loading dwell within this
 *  distance of the centroid on the document date — the city the document names, never another town. */
export const ZIP_CITY_RADIUS_M = 40_000;
const DAY_MS = 86_400_000;

export type StopGpsVerdict = {
  load_id: string; load_number: string; stop_id: string; sequence_number: number; stop_type: string;
  document_address: string;
  verdict: "verified" | "disagrees" | "gps_elsewhere" | "no_gps" | "no_dwell" | "no_point" | "zip_center_resolved" | "zip_center_unresolved";
  /** 443.86 #2 — why a zip-center stop stayed on its centroid. */
  reason?: string;
  dwell: { lat: number; lng: number; started_at: string; ended_at: string; minutes: number } | null;
  distance_m: number | null;
  facility: { source: "samsara" | "google"; name: string | null; street: string; city: string; state: string; zip: string;
    lat: number; lng: number; place_id: string | null; samsara_address_id: string | null } | null;
  /** The facility is CONFIRMED (the owner's own Samsara address, or a Google facility sharing a distinctive name word with the
   *  document's facility) — only a confirmed facility is applied; an unconfirmed one is listed, never written. */
  confirmed: boolean;
  applied: boolean;
};

const GENERIC = new Set(["inc", "llc", "corp", "company", "the", "and", "logistics", "warehouse", "distribution", "center", "services",
  "service", "foods", "food", "group", "transport", "trucking", "freight", "site", "dock", "plant", "store", "texas", "laredo",
  "manufacturing", "industries", "supply", "international", "world", "wide", "depot", "terminal", "cold"]);
/** True when the two facility names share a distinctive word (US COLD STORAGE ~ United States Cold Storage; WAL MART ~ Walmart). */
export function sameFacilityName(a: string | null | undefined, b: string | null | undefined, places: Array<string | null | undefined> = []): boolean {
  const norm = (v: string | null | undefined) => String(v ?? "").toLowerCase().replace(/wal[\s-]*mart/g, "walmart").replace(/\bu\.?\s?s\.?\b/g, "united states");
  // A city / state word is where, not who (13605: "CAMPBELL SOUP CO.- LUMBERTON, NC" is not "… Lumberton" cold storage).
  const placeWords = new Set(places.flatMap((p) => norm(p).split(/[^a-z0-9]+/)).filter(Boolean));
  const words = (v: string | null | undefined) => new Set(norm(String(v ?? "").split(" — ")[0]).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w) && !placeWords.has(w)));
  const A = words(a), B = words(b);
  return [...A].some((w) => B.has(w));
}

/** 443.87: a zip-center stop's facility must carry the document's own name; short acronyms count (JVL, TCI, GFS). */
export function zipFacilityConfirmed(documentFacility: string | null | undefined, found: string | null | undefined, places: Array<string | null | undefined> = []): boolean {
  if (sameFacilityName(documentFacility, found, places)) return true;
  const placeWords = new Set(places.flatMap((p) => String(p ?? "").toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));
  const acr = String(documentFacility ?? "").split(/[^A-Za-z0-9]+/).filter((w) => w.length === 3 && w === w.toUpperCase() && /[A-Z]/.test(w) && !placeWords.has(w.toLowerCase()));
  const words = String(found ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const f = new Set(words);
  // ... or the acronym is the initials of three consecutive words (GFS = Gordon Food Service).
  const initials = new Set(words.slice(0, -2).map((w, i) => w[0]! + words[i + 1]![0]! + words[i + 2]![0]!));
  return acr.some((w) => f.has(w) || initials.has(w));
}
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

type StopIn = { stop_id: string; sequence_number: number; stop_type: string; lat: number | null; lng: number | null; day: Date | null; document_address: string };
type Dwell = StopEvent & { lat: number; lng: number };

/** Pure: the verdict for each stop given the load's qualifying dwells (fuel stops / yard already removed) and fix coverage. */
export function classifyStops(stops: StopIn[], dwells: Dwell[], hasFixesOn: (day: Date) => boolean,
  nearestFixM: (lat: number, lng: number) => number | null = () => null): Array<Omit<StopGpsVerdict, "load_id" | "load_number" | "facility" | "confirmed" | "applied">> {
  const out: Array<Omit<StopGpsVerdict, "load_id" | "load_number" | "facility" | "confirmed" | "applied">> = [];
  let after = 0;
  for (const s of stops) {
    const base = { stop_id: s.stop_id, sequence_number: s.sequence_number, stop_type: s.stop_type, document_address: s.document_address };
    if (s.lat == null || s.lng == null || !s.day) { out.push({ ...base, verdict: "no_point", dwell: null, distance_m: null }); continue; }
    // 443.80 #4: a document date is day-level and a delivery often lands after it — measured on 4 of the 65 "elsewhere" stops
    // (13498 #2, 13566 #2, 13614 #2, 13659 #2: the load's own truck dwelled at the stop on day +2..+3). Window -2 .. +3 days.
    const dayStart = s.day.getTime() - 2 * DAY_MS, dayEnd = s.day.getTime() + 3 * DAY_MS;
    const inWindow = dwells.filter((d) => d.startedAt.getTime() >= Math.max(dayStart, after) && d.startedAt.getTime() <= dayEnd);
    const near = inWindow.map((d) => ({ d, m: metersBetween(s.lat!, s.lng!, d.lat, d.lng) })).filter((x) => x.m <= VERIFY_RADIUS_M).sort((a, b) => a.m - b.m)[0];
    // A disagreement needs a LOADING-length dwell on the stop's own day (+- 1 day), never a short pause.
    const inDay = inWindow.filter((d) => d.dwellMinutes >= LOADING_DWELL_MINUTES && Math.abs(d.startedAt.getTime() - (s.day!.getTime() + DAY_MS / 2)) <= 1.5 * DAY_MS);
    const pack = (d: Dwell, m: number) => ({ lat: d.lat, lng: d.lng, started_at: d.startedAt.toISOString(), ended_at: d.endedAt.toISOString(), minutes: d.dwellMinutes, m });
    if (near) {
      const p = pack(near.d, near.m);
      out.push({ ...base, verdict: "verified", dwell: { lat: p.lat, lng: p.lng, started_at: p.started_at, ended_at: p.ended_at, minutes: p.minutes }, distance_m: near.m });
      after = near.d.endedAt.getTime();
      continue;
    }
    // The truck PASSED the stop's point (any fix within the verify radius in the load's window): the document point is real.
    const passed = nearestFixM(s.lat, s.lng);
    if (passed != null && passed <= VERIFY_RADIUS_M) {
      out.push({ ...base, verdict: "verified", dwell: null, distance_m: passed });
      continue;
    }
    if (inDay.length) {
      const longest = Math.max(...inDay.map((d) => d.dwellMinutes));
      const ties = inDay.filter((d) => d.dwellMinutes >= longest * 0.8).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
      const pick = s.stop_type === "delivery" ? ties[ties.length - 1]! : ties[0]!;
      const m = metersBetween(s.lat, s.lng, pick.lat, pick.lng);
      out.push({ ...base, verdict: m > MAX_CORRECTION_M ? "gps_elsewhere" : "disagrees", dwell: { lat: pick.lat, lng: pick.lng, started_at: pick.startedAt.toISOString(), ended_at: pick.endedAt.toISOString(), minutes: pick.dwellMinutes }, distance_m: m });
      after = pick.endedAt.getTime();
      continue;
    }
    out.push({ ...base, verdict: hasFixesOn(s.day) ? "no_dwell" : "no_gps", dwell: null, distance_m: null });
  }
  return out;
}

async function resolveFacility(client: DbClient, companyId: string, lat: number, lng: number, documentFacility: string | null): Promise<StopGpsVerdict["facility"]> {
  const sam = (await client.query<{ id: string; name: string | null; formatted_address: string | null; lat: number; lng: number }>(
    `SELECT samsara_address_id::text AS id, name, formatted_address, lat::float8 AS lat, lng::float8 AS lng
       FROM integrations.samsara_addresses
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
        AND 111320 * sqrt(power(lat - $2::float8, 2) + power((lng - $3::float8) * cos(radians($2::float8)), 2)) <= $4
        AND coalesce(name, '') !~* '(love''?s|pilot|flying j|petro|truck ?stop|travel ?center)'
      ORDER BY 111320 * sqrt(power(lat - $2::float8, 2) + power((lng - $3::float8) * cos(radians($2::float8)), 2))
      LIMIT 1`, [companyId, lat, lng, FACILITY_RADIUS_M])).rows[0];
  if (sam?.formatted_address) {
    const m = /^\s*([^,]+),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/.exec(sam.formatted_address);
    if (m && /^\s*\d+[a-z]?\s+\S/i.test(m[1]!)) {
      return { source: "samsara", name: sam.name, street: m[1]!.trim(), city: m[2]!.trim(), state: m[3]!, zip: m[4] ?? "",
        lat: sam.lat, lng: sam.lng, place_id: null, samsara_address_id: sam.id };
    }
  }
  if (!isGooglePlacesEnabled() || !isGooglePlacesConfigured()) return null;
  const g = await facilityAtPoint(lat, lng, 400, documentFacility);
  if (g?.truck_stop) return { source: "google", name: "TRUCK_STOP", street: "", city: "", state: "", zip: "", lat, lng, place_id: null, samsara_address_id: null };
  if (!g || g.lat == null || g.lon == null) return null;
  return { source: "google", name: g.name ?? null, street: g.address_line1, city: g.city, state: g.state, zip: g.zip,
    lat: g.lat, lng: g.lon, place_id: g.place_id ?? null, samsara_address_id: null };
}

/** Verify (and with apply: correct) every pickup / delivery stop of one load against the unit's GPS. Caller owns the transaction. */
export async function verifyLoadStopsAgainstGps(client: DbClient, input: {
  operatingCompanyId: string; loadId: string; apply: boolean; actorUserId: string; reason?: string;
  /** 443.86 #2: only the load's zip-center stops are resolved (and applied); every other stop is left as it is. */
  zipCenterOnly?: boolean;
}): Promise<StopGpsVerdict[]> {
  const load = (await client.query<{ load_number: string; unit_id: string | null }>(
    `SELECT load_number::text, assigned_unit_id::text AS unit_id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.loadId, input.operatingCompanyId])).rows[0];
  if (!load) return [];
  const stops = (await client.query<{ stop_id: string; sequence_number: number; stop_type: string; lat: number | null; lng: number | null;
    day: string | null; facility_name: string | null; address_line1: string | null; city: string | null; state: string | null; postal_code: string | null;
    geocode_source: string | null }>(
    `SELECT s.id::text AS stop_id, s.sequence_number, s.stop_type::text, s.latitude::float8 AS lat, s.longitude::float8 AS lng, s.geocode_source,
            coalesce(s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at)::text AS day,
            s.facility_name, s.address_line1, s.city, s.state, s.postal_code
       FROM mdata.load_stops s
      WHERE s.load_id = $1::uuid AND s.soft_deleted_at IS NULL AND s.stop_type::text IN ('pickup', 'delivery')
      ORDER BY s.sequence_number`, [input.loadId])).rows;
  const docAddr = (s: (typeof stops)[number]) =>
    [s.facility_name, [s.address_line1, s.city, [s.state, s.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
  const stopsIn: StopIn[] = stops.map((s) => ({ stop_id: s.stop_id, sequence_number: s.sequence_number, stop_type: s.stop_type,
    lat: s.lat, lng: s.lng, day: s.day ? new Date(s.day) : null, document_address: docAddr(s) }));
  const days = stopsIn.map((s) => s.day?.getTime()).filter((x): x is number => x != null);
  let dwells: Dwell[] = [];
  let fixDays = new Set<string>();
  let fixPoints: Array<{ lat: number; lng: number }> = [];
  if (load.unit_id && days.length) {
    const from = new Date(Math.min(...days) - 2 * DAY_MS), to = new Date(Math.max(...days) + 3 * DAY_MS);
    const fixes = (await client.query<{ captured_at: string; lat: string | null; lng: string | null; speed_mph: string | null; engine_state: string | null; odometer_mi: string | null; city: string | null; state: string | null }>(
      `SELECT captured_at::text, lat::text, lng::text, speed_mph::text, engine_state, odometer_mi::text, city, state
         FROM telematics.vehicle_locations WHERE unit_id = $1::uuid AND captured_at BETWEEN $2 AND $3 ORDER BY captured_at`,
      [load.unit_id, from.toISOString(), to.toISOString()])).rows;
    const pf: PositionFix[] = fixes.map((f) => ({ capturedAt: new Date(f.captured_at), lat: f.lat == null ? null : Number(f.lat), lng: f.lng == null ? null : Number(f.lng),
      speedMph: f.speed_mph == null ? null : Number(f.speed_mph), engineState: f.engine_state, odometerMi: f.odometer_mi == null ? null : Number(f.odometer_mi), city: f.city, state: f.state }));
    fixDays = new Set(pf.map((f) => f.capturedAt.toISOString().slice(0, 10)));
    fixPoints = pf.filter((f) => f.lat != null && f.lng != null).map((f) => ({ lat: f.lat!, lng: f.lng! }));
    const raw = detectStops(load.unit_id, pf).filter((d): d is Dwell => d.lat != null && d.lng != null);
    // A fuel stop or the company yard is never a pickup / delivery.
    const excluded = (await client.query<{ lat: number; lng: number; r: number }>(
      `SELECT center_lat::float8 AS lat, center_lng::float8 AS lng, greatest(coalesce(enter_radius_m, radius_m, 200), 200)::float8 AS r
         FROM geo.geofences WHERE operating_company_id = $1::uuid AND is_active AND center_lat IS NOT NULL
          AND (location_kind = 'fuel_stop' OR location_kind = 'yard'
               OR location_ref_id IN (SELECT id FROM mdata.locations WHERE operating_company_id = $1::uuid AND is_ih35_yard))`,
      [input.operatingCompanyId])).rows;
    // The owner's own non-shipper addresses in Samsara (the EBT yard, CAT / weigh scales, fuel and truck stops) — measured
    // 2026-10-11: 69 of the first run's 175 "disagreements" were the EBT Yard and 22 were CAT scales.
    const notShipper = (await client.query<{ lat: number; lng: number }>(
      `SELECT lat::float8 AS lat, lng::float8 AS lng FROM integrations.samsara_addresses
        WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
          AND coalesce(name, '') ~* '(yard|cat scale|scale|weigh|love''?s|pilot|flying j|petro|truck ?stop|travel ?center|wash)'`,
      [input.operatingCompanyId])).rows.map((r) => ({ ...r, r: 400 }));
    // Every stop of the same truck's OTHER loads in the window: a dwell there is that load's stop, never this one.
    const otherStops = (await client.query<{ lat: number; lng: number }>(
      `SELECT s.latitude::float8 AS lat, s.longitude::float8 AS lng
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE l.operating_company_id = $1::uuid AND l.assigned_unit_id = $2::uuid AND l.id <> $3::uuid AND l.soft_deleted_at IS NULL
          AND s.soft_deleted_at IS NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
          AND coalesce(s.actual_arrival_at, s.appointment_start_at, s.scheduled_arrival_at) BETWEEN $4 AND $5`,
      [input.operatingCompanyId, load.unit_id, input.loadId, new Date(from.getTime() - 3 * DAY_MS).toISOString(), new Date(to.getTime() + 3 * DAY_MS).toISOString()])).rows
      .map((r) => ({ ...r, r: OTHER_STOP_RADIUS_M }));
    const ours = stopsIn.filter((x) => x.lat != null && x.lng != null);
    dwells = raw.filter((d) =>
      !excluded.some((e) => metersBetween(d.lat, d.lng, e.lat, e.lng) <= e.r) &&
      !notShipper.some((e) => metersBetween(d.lat, d.lng, e.lat, e.lng) <= e.r) &&
      // another load's stop excludes the dwell unless it is ALSO at one of this load's own stops (same facility reused)
      (!otherStops.some((e) => metersBetween(d.lat, d.lng, e.lat, e.lng) <= e.r) || ours.some((o) => metersBetween(d.lat, d.lng, o.lat!, o.lng!) <= VERIFY_RADIUS_M)));
  }
  const nearestFixM = (lat: number, lng: number) => {
    let best: number | null = null;
    for (const f of fixPoints) { const m = metersBetween(lat, lng, f.lat, f.lng); if (best == null || m < best) best = m; }
    return best;
  };
  const hasFixesOn = (day: Date) => [-1, 0, 1].some((k) => fixDays.has(new Date(day.getTime() + k * DAY_MS).toISOString().slice(0, 10)));
  const verdicts = classifyStops(stopsIn, dwells, hasFixesOn, nearestFixM);
  const out: StopGpsVerdict[] = [];
  let moved = 0;
  for (const v of verdicts) {
    const docFacility = stops.find((s) => s.stop_id === v.stop_id)?.facility_name ?? null;
    const zipStop = stops.find((s) => s.stop_id === v.stop_id && s.geocode_source === "zip_center" && !s.address_line1);
    if (input.zipCenterOnly && !zipStop) continue;
    if (zipStop) {
      // 443.86 #2 — a zip centroid is not a place: the truck's loading dwell in that city on the document date is the stop.
      const st = stopsIn.find((x) => x.stop_id === v.stop_id)!;
      let reason: string | null = null;
      let pick: { d: Dwell; f: NonNullable<StopGpsVerdict["facility"]> } | null = null;
      if (!load.unit_id) reason = "the load has no unit";
      else if (st.lat == null || st.lng == null || !st.day) reason = "the stop has no zip point or date";
      else {
        const mid = st.day.getTime() + DAY_MS / 2;
        const cands = dwells
          .filter((d) => d.dwellMinutes >= LOADING_DWELL_MINUTES && Math.abs(d.startedAt.getTime() - mid) <= 1.5 * DAY_MS
            && metersBetween(st.lat!, st.lng!, d.lat, d.lng) <= ZIP_CITY_RADIUS_M)
          .sort((a, b) => b.dwellMinutes - a.dwellMinutes).slice(0, 3);
        if (!cands.length) reason = hasFixesOn(st.day) ? "no loading dwell of the truck in that city on the document date" : "no GPS for the truck on the document date";
        const others: string[] = [];
        for (const d of cands) {
          const f = await resolveFacility(client, input.operatingCompanyId, d.lat, d.lng, docFacility);
          if (!f || f.name === "TRUCK_STOP" || !f.street) continue;
          // 443.87: only the document's own business is written; a dwell at another business (a repair shop, a drop box)
          // is listed for the owner, never fenced.
          if (zipFacilityConfirmed(docFacility, f.name, [zipStop.city, zipStop.state, f.city, f.state])) { pick = { d, f }; break; }
          others.push(`${f.name ?? "unnamed place"} (${f.street}, ${f.city})`);
        }
        if (cands.length && !pick) reason = others.length
          ? `the truck's dwell in that city is at another business, not "${docFacility}": ${others.join("; ")}`
          : "the dwell resolves to no facility with a street (truck stop or no Google / Samsara place)";
      }
      // 443.90 #1: the DOCUMENT names the business — resolve the business when the dwell does not.
      //  a. the same business (facility + zip) already resolved on another stop -> that stop's place (one location, one fence)
      //  b. Google Places text search "<facility> <city> <state> <zip>" -> only a result whose name carries the document
      //     business and whose zip / city match (zipFacilityConfirmed + place check); no match = not fenced.
      let byName: { source: "same_business" | "google_place"; street: string; city: string; state: string; zip: string; lat: number; lng: number;
        place_id: string | null; name: string | null; geocode_source: string; from: string } | null = null;
      if (!pick && zipStop.facility_name) {
        const same = (await client.query<{ stop_id: string; load_number: string; address_line1: string; city: string; state: string; postal_code: string | null;
          lat: number; lng: number; google_place_id: string | null; geocode_source: string }>(
          `SELECT s.id::text AS stop_id, l.load_number::text, s.address_line1, s.city, s.state, s.postal_code, s.latitude::float8 AS lat, s.longitude::float8 AS lng,
                  s.google_place_id, s.geocode_source
             FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
            WHERE l.operating_company_id = $1::uuid AND s.soft_deleted_at IS NULL AND s.id <> $2::uuid
              AND upper(regexp_replace(s.facility_name, '\\s+', ' ', 'g')) = upper(regexp_replace($3, '\\s+', ' ', 'g'))
              AND coalesce(s.postal_code, '') = coalesce($4, '') AND s.address_line1 IS NOT NULL AND s.latitude IS NOT NULL
              AND s.geocode_source IN ('gps_dwell_google', 'gps_dwell_samsara', 'google_place', 'samsara_address')
            ORDER BY s.updated_at DESC LIMIT 1`,
          [input.operatingCompanyId, v.stop_id, zipStop.facility_name, zipStop.postal_code])).rows[0];
        if (same) byName = { source: "same_business", street: same.address_line1, city: same.city, state: same.state, zip: same.postal_code ?? "", lat: same.lat, lng: same.lng,
          place_id: same.google_place_id, name: zipStop.facility_name, geocode_source: same.geocode_source, from: `load ${same.load_number}` };
        else if (isGooglePlacesEnabled() && isGooglePlacesConfigured()) {
          const q = [zipStop.facility_name.split(/\bc\/o\b/i).pop()!.trim(), zipStop.city, zipStop.state, zipStop.postal_code].filter(Boolean).join(" ");
          const hits = await searchAddress(q, 5);
          const zipNorm = String(zipStop.postal_code ?? "").slice(0, 5);
          const ok = hits.find((h) => h.lat != null && h.lon != null && h.address_line1 && h.name
            && zipFacilityConfirmed(zipStop.facility_name, h.name, [zipStop.city, zipStop.state, h.city, h.state])
            && ((zipNorm && h.zip?.slice(0, 5) === zipNorm) || (h.city ?? "").toLowerCase() === String(zipStop.city ?? "").toLowerCase()));
          if (ok) byName = { source: "google_place", street: ok.address_line1, city: ok.city, state: ok.state, zip: ok.zip, lat: ok.lat!, lng: ok.lon!,
            place_id: ok.place_id ?? null, name: ok.name ?? null, geocode_source: "google_place", from: `Google: ${q}` };
          else reason = `${reason ?? "no dwell"}; Google "${q}": ${hits.length ? hits.map((h) => h.name ?? h.formatted).slice(0, 3).join(" | ") : "no result"} — no result carries the business at that zip / city`;
        }
      }
      if (byName && input.apply) {
        await client.query(
          `UPDATE mdata.load_stops
              SET address_line1 = $2, city = $3, state = $4, postal_code = coalesce(nullif($5, ''), postal_code),
                  latitude = $6, longitude = $7, google_place_id = $8, location_id = NULL,
                  geocode_source = $9, geocode_precision = 'rooftop', geocode_confidence = 1, geocode_failure_reason = NULL,
                  geocode_attempted_at = now(), updated_at = now()
            WHERE id = $1::uuid AND geocode_source = 'zip_center'`,
          [v.stop_id, byName.street, byName.city, byName.state, byName.zip, byName.lat, byName.lng, byName.place_id, byName.geocode_source]);
        await appendCrudAudit(client as never, input.actorUserId, "dispatch.load_stop.zip_center_resolved_by_business", {
          resource_type: "mdata.load_stops", resource_id: v.stop_id, operating_company_id: input.operatingCompanyId, load_id: input.loadId,
          load_number: load.load_number, sequence_number: v.sequence_number, document_address: v.document_address,
          resolved_address: `${byName.street}, ${byName.city}, ${byName.state} ${byName.zip}`, business: byName.name, source: byName.source, from: byName.from,
          google_place_id: byName.place_id, reason: "443.90 #1 the document names the business",
        }, "warning", "443.90");
        moved++;
      }
      if (byName) {
        out.push({ ...v, verdict: "zip_center_resolved", reason: undefined, dwell: null, distance_m: st.lat != null ? metersBetween(st.lat, st.lng!, byName.lat, byName.lng) : null,
          load_id: input.loadId, load_number: load.load_number,
          facility: { source: "google", name: byName.name, street: byName.street, city: byName.city, state: byName.state, zip: byName.zip, lat: byName.lat, lng: byName.lng,
            place_id: byName.place_id, samsara_address_id: null },
          confirmed: true, applied: Boolean(input.apply) });
        continue;
      }
      let applied = false;
      if (pick && input.apply) {
        const { d, f } = pick;
        await client.query(
          `UPDATE mdata.load_stops
              SET address_line1 = $2, city = $3, state = $4, postal_code = coalesce(nullif($5, ''), postal_code),
                  latitude = $6, longitude = $7, google_place_id = $8, location_id = NULL,
                  geocode_source = $9, geocode_precision = 'rooftop', geocode_confidence = 1, geocode_failure_reason = NULL,
                  geocode_attempted_at = now(), updated_at = now()
            WHERE id = $1::uuid AND geocode_source = 'zip_center'`,
          [v.stop_id, f.street, f.city, f.state, f.zip, f.lat, f.lng, f.place_id, f.source === "samsara" ? "gps_dwell_samsara" : "gps_dwell_google"]);
        await appendCrudAudit(client as never, input.actorUserId, "dispatch.load_stop.zip_center_resolved_by_gps", {
          resource_type: "mdata.load_stops", resource_id: v.stop_id, operating_company_id: input.operatingCompanyId, load_id: input.loadId,
          load_number: load.load_number, sequence_number: v.sequence_number, document_address: v.document_address,
          resolved_address: `${f.street}, ${f.city}, ${f.state} ${f.zip}`, facility_at_point: f.name, source: f.source,
          samsara_address_id: f.samsara_address_id, google_place_id: f.place_id,
          dwell: { lat: d.lat, lng: d.lng, started_at: d.startedAt.toISOString(), minutes: d.dwellMinutes },
          distance_from_zip_center_m: metersBetween(st.lat!, st.lng!, d.lat, d.lng), reason: input.reason ?? "443.86 #2 zip-center stop resolved by GPS dwell",
        }, "warning", "443.86");
        applied = true;
        moved++;
      }
      out.push({ ...v, verdict: pick ? "zip_center_resolved" : "zip_center_unresolved", reason: reason ?? undefined,
        dwell: pick ? { lat: pick.d.lat, lng: pick.d.lng, started_at: pick.d.startedAt.toISOString(), ended_at: pick.d.endedAt.toISOString(), minutes: pick.d.dwellMinutes } : null,
        distance_m: pick && st.lat != null ? metersBetween(st.lat, st.lng!, pick.d.lat, pick.d.lng) : null,
        load_id: input.loadId, load_number: load.load_number, facility: pick?.f ?? null, confirmed: Boolean(pick), applied });
      continue;
    }
    let facility = v.verdict === "disagrees" && v.dwell ? await resolveFacility(client, input.operatingCompanyId, v.dwell.lat, v.dwell.lng, docFacility) : null;
    if (facility?.name === "TRUCK_STOP" && v.dwell) {
      // The longest dwell was a rest at a truck stop: try the next-longest loading-length dwells of the stop's day (up to 3).
      const st = stopsIn.find((x) => x.stop_id === v.stop_id)!;
      const mid = st.day!.getTime() + DAY_MS / 2;
      const alts = dwells.filter((d) => d.dwellMinutes >= LOADING_DWELL_MINUTES && Math.abs(d.startedAt.getTime() - mid) <= 1.5 * DAY_MS &&
          !(d.lat === v.dwell!.lat && d.lng === v.dwell!.lng)).sort((a, b) => b.dwellMinutes - a.dwellMinutes).slice(0, 3);
      facility = null;
      for (const d of alts) {
        const f = await resolveFacility(client, input.operatingCompanyId, d.lat, d.lng, docFacility);
        if (f && f.name !== "TRUCK_STOP") {
          v.dwell = { lat: d.lat, lng: d.lng, started_at: d.startedAt.toISOString(), ended_at: d.endedAt.toISOString(), minutes: d.dwellMinutes };
          v.distance_m = metersBetween(st.lat!, st.lng!, d.lat, d.lng);
          facility = f;
          break;
        }
      }
    }
    let applied = false;
    // Confirmed = the facility at the dwell carries the document's own distinctive name (any source). An owner Samsara address
    // with ANOTHER name (Semares -> Vilore Foods) is a different business: listed for the owner, never written.
    const docStop = stops.find((x) => x.stop_id === v.stop_id);
    const confirmed = Boolean(facility && facility.name !== "TRUCK_STOP" &&
      sameFacilityName(docFacility, facility.name, [docStop?.city, docStop?.state, facility.city, facility.state]));
    if (input.apply && v.verdict === "disagrees" && facility && confirmed) {
      await client.query(
        `UPDATE mdata.load_stops
            SET facility_name = coalesce($2, facility_name), address_line1 = $3, city = $4, state = $5, postal_code = nullif($6, ''),
                latitude = $7, longitude = $8, google_place_id = $9, location_id = NULL,
                geocode_source = $10, geocode_precision = 'rooftop', geocode_confidence = 1, geocode_failure_reason = NULL,
                geocode_attempted_at = now(), updated_at = now()
          WHERE id = $1::uuid`,
        [v.stop_id, facility.name, facility.street, facility.city, facility.state, facility.zip, facility.lat, facility.lng, facility.place_id,
         facility.source === "samsara" ? "gps_dwell_samsara" : "gps_dwell_google"]);
      await appendCrudAudit(client as never, input.actorUserId, "dispatch.load_stop.gps_verified_location", {
        resource_type: "mdata.load_stops", resource_id: v.stop_id, operating_company_id: input.operatingCompanyId, load_id: input.loadId,
        load_number: load.load_number, sequence_number: v.sequence_number, document_address: v.document_address,
        verified_address: [facility.name, `${facility.street}, ${facility.city}, ${facility.state} ${facility.zip}`].filter(Boolean).join(" — "),
        verified_source: facility.source, samsara_address_id: facility.samsara_address_id, google_place_id: facility.place_id,
        distance_m: v.distance_m, dwell: v.dwell, reason: input.reason ?? "443.74 GPS stop verification",
      }, "warning", "443.74");
      applied = true;
      moved++;
    }
    out.push({ ...v, load_id: input.loadId, load_number: load.load_number, facility, confirmed, applied });
  }
  if (moved > 0) {
    // The ONE fence writer draws the verified location + fence (queued to Samsara); the mileage engine re-learns legs + deadhead.
    await geocodeStopsWithClient(client as never, input.actorUserId, input.operatingCompanyId, input.loadId, { reresolve: true });
    await enqueueOutboxEvent(client as never, "dispatch.relearn_load_miles", { aggregate_type: "mdata.loads", aggregate_id: input.loadId },
      { operating_company_id: input.operatingCompanyId, load_id: input.loadId, actor_user_id: input.actorUserId, record_sources: true },
      `dispatch.relearn_load_miles:${input.loadId}:443.74-gps-${Date.now()}`);
  }
  return out;
}
