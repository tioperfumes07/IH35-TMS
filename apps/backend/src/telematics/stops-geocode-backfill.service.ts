/**
 * ENGINE: stop geocode backfill — geocodes load stops with no coordinates, links or creates the mdata.locations row, creates the stop's custom geofence
 * SCHEDULE: on demand — POST /api/v1/telematics/stops/geocode-backfill (stops-geocode-backfill.routes.ts) and dispatch/book-load.service.ts (post-book)
 * WRITES: mdata.load_stops (lat / lng, geocode_*, location_id), mdata.locations, geo.geofences; external: geocode provider (geocodeAddressWithEvidence)
 * IDEMPOTENCY: ADVISORY LOCK <company>|<normalized address> (location) and geo.location_fence|<company>|<location> + SAME-STATEMENT WHERE NOT EXISTS an active fence for that location
 * OVERLAP: the second caller waits on the lock, then finds the location / fence and inserts nothing; stop updates rewrite the same values
 * REVERSE: NOT-A-DOCUMENT — geocode enrichment; a fence is retired through telematics/geofences.routes.ts PATCH /api/v1/telematics/geofences/:id
 * NEVER: must never accept 0,0 coordinates and never create a location or fence from a locality-only geocode; never draw a fence
 *        around a zip / city center; unstamped coordinates are never a rooftop pin (443.38)
 * (ROUND 337 header — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { withCurrentUser } from "../auth/db.js";
import { squareVerticesFromCenter } from "./auto-geofence.service.js";
import { stableProviderFailureReason, geocodeAddressWithEvidence } from "./stop-geocode-fallback.service.js";
import { matchSamsaraAddressForStop, normName } from "./samsara-stop-match.js";
import { isGooglePlacesConfigured, isGooglePlacesEnabled, searchAddress, type AddressResult } from "../integrations/google/google-places-client.js";
import { ensureSamsaraAddressLocation, parseFormattedAddress } from "../integrations/samsara/geofences/address-import.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
type StopRow = {
  stop_id: string; load_id: string; sequence_number: number; stop_type: string;
  location_id: string | null; address_line1: string | null; facility_name: string | null; city: string | null;
  state: string | null; postal_code: string | null; country: string | null;
  latitude: number | null; longitude: number | null; geocode_precision: string | null; geocode_source: string | null;
  location_latitude: number | null; location_longitude: number | null; location_has_street: boolean | null;
};
/** A stop with no owner street and no Samsara address: placed at its zip / city center, NO location, NO fence — listed for the owner. */
export type StopListedForOwner = { stop_id: string; load_id: string; city: string | null; state: string | null; postal_code: string | null; reason: string };
export type StopGeocodeFailure = { stop_id: string; load_id: string; reason: string };
export type StopsGeocodeBackfillResult = {
  stops_checked: number; stops_geocoded: number; locations_linked: number;
  geofences_created: number; rooftop: number; locality: number; failures: StopGeocodeFailure[];
  samsara_matched: number; zip_center_listed: StopListedForOwner[];
  street_from_location?: number; street_from_place?: number;
};

/**
 * 443.43 (iii) — pure: the one place result that IS this facility: its name matches the facility (one contains the other,
 * normalized), its city and state equal the stop's, and it has a street. Confidence 0.9 on an exact name, 0.75 otherwise.
 * Several distinct matching addresses = ambiguous = none (never guessed).
 */
export function pickPlaceForFacility(
  facility: string,
  stop: { city: string | null; state: string | null },
  results: AddressResult[]
): { result: AddressResult; confidence: number } | null {
  const want = normName(facility);
  const eq = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase() && String(a ?? "").trim() !== "";
  const hits = results.filter((r) => {
    const have = normName(r.name ?? "");
    return have.length >= 4 && (have === want || have.includes(want) || want.includes(have))
      && eq(r.city, stop.city) && eq(r.state, stop.state) && looksLikeStreet(r.address_line1) && r.lat != null && r.lon != null;
  });
  const distinct = [...new Map(hits.map((h) => [normName(h.address_line1), h])).values()];
  if (distinct.length !== 1) return null;
  const r = distinct[0]!;
  return { result: r, confidence: normName(r.name ?? "") === want ? 0.9 : 0.75 };
}

/** A street starts with a house number ("514 Nafta Blvd"); a facility name ("Aldi Salisbury") is not a street. */
export const looksLikeStreet = (v: string | null | undefined) => /^\s*\d+[a-z]?\s+\S/i.test(String(v ?? ""));

const ENTER_RADIUS_M = 402; // 0.25 miles
const EXIT_RADIUS_M = 805; // 0.50 miles
const PROVIDER_PACING_MS = 250;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function paceProviderCalls(previousAt: number): Promise<number> {
  const remaining = PROVIDER_PACING_MS - (Date.now() - previousAt);
  if (remaining > 0) await sleep(remaining);
  return Date.now();
}

function labelOf(stop: StopRow) {
  return [stop.address_line1, stop.city, stop.state, stop.postal_code, stop.country]
    .map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
}

async function candidateStops(client: DbClient, companyId: string, loadId?: string, reresolve = false): Promise<StopRow[]> {
  const values: unknown[] = [companyId];
  const loadClause = loadId ? "AND l.id = $2::uuid" : "";
  if (loadId) values.push(loadId);
  // 443.38: a NAMED load is always resolved, whatever its status (the Settlement Creator books loads that already ran and
  // are delivered in the same transaction); the open sweep keeps skipping delivered / cancelled. reresolve (owner
  // correction) re-runs the resolution order on every stop of the named load.
  const statusClause = loadId ? "AND l.status <> 'cancelled'" : "AND l.status NOT IN ('cancelled','delivered')";
  const pickClause = reresolve && loadId ? "" : `AND (
         s.latitude IS NULL OR s.longitude IS NULL
         OR (
           s.latitude IS NOT NULL AND s.longitude IS NOT NULL
           AND coalesce(s.geocode_precision, 'rooftop') <> 'locality'
           AND NOT EXISTS (
             SELECT 1 FROM geo.geofences g
              WHERE g.operating_company_id = $1::uuid
                AND g.location_ref_id = s.location_id
                AND g.is_active
           )
         )
       )`;
  return (await client.query<StopRow>(`
    SELECT s.id::text stop_id, s.load_id::text load_id, s.sequence_number, s.stop_type::text,
           s.location_id::text, s.address_line1, s.facility_name, s.city, s.state, s.postal_code, s.country,
           s.latitude::double precision, s.longitude::double precision, s.geocode_precision, s.geocode_source,
           loc.latitude::double precision location_latitude, loc.longitude::double precision location_longitude,
           (nullif(trim(loc.address_line1), '') IS NOT NULL) location_has_street
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      LEFT JOIN mdata.locations loc ON loc.id=s.location_id AND loc.operating_company_id=$1::uuid AND loc.deactivated_at IS NULL
     WHERE l.operating_company_id = $1::uuid
       AND l.soft_deleted_at IS NULL ${statusClause}
       AND s.soft_deleted_at IS NULL ${loadClause}
       ${pickClause}
     ORDER BY l.load_number, s.sequence_number`, values)).rows;
}

async function findOrCreateLocation(client: DbClient, companyId: string, actorId: string, stop: StopRow, lat: number, lng: number, source: string) {
  const normalized = [stop.address_line1, stop.city, stop.state, stop.postal_code, stop.country]
    .map((value) => String(value ?? "").trim().toLowerCase()).join("|");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${companyId}|${normalized}`]);
  const found = await client.query<{ id: string }>(`
    SELECT id::text FROM mdata.locations
     WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL
       AND lower(coalesce(address_line1,'')) = lower(coalesce($2,''))
       AND lower(coalesce(city,'')) = lower(coalesce($3,''))
       AND upper(coalesce(state,'')) = upper(coalesce($4,''))
       AND lower(coalesce(postal_code,'')) = lower(coalesce($5,''))
       AND upper(coalesce(country,'US')) = upper(coalesce($6,'US'))
     ORDER BY created_at LIMIT 1`, [companyId, stop.address_line1, stop.city, stop.state, stop.postal_code, stop.country]);
  if (found.rows[0]) return found.rows[0].id;
  const inserted = await client.query<{ id: string }>(`
    INSERT INTO mdata.locations
      (operating_company_id, location_name, location_type, address_line1, city, state, postal_code, country,
       latitude, longitude, geocoded_at, geocoding_source, created_by_user_id, updated_by_user_id)
    VALUES ($1::uuid,$2,'other',$3,$4,$5,$6,coalesce($7,'US'),$8,$9,now(),$10,$11::uuid,$11::uuid)
    RETURNING id::text`, [companyId, labelOf(stop), stop.address_line1, stop.city, stop.state, stop.postal_code, stop.country, lat, lng, source, actorId]);
  return inserted.rows[0]!.id;
}

export async function geocodeStopsWithClient(
  client: DbClient,
  actorId: string,
  companyId: string,
  loadId?: string,
  opts: { reresolve?: boolean } = {}
): Promise<StopsGeocodeBackfillResult> {
  const stops = await candidateStops(client, companyId, loadId, opts.reresolve === true);
  const failures: StopGeocodeFailure[] = [];
  const listed: StopListedForOwner[] = [];
  let geocoded = 0, locations = 0, fences = 0, rooftop = 0, locality = 0, samsara = 0, lastProviderAt = 0;
  let streetFromLocation = 0, streetFromPlace = 0;

  async function existingStreetLocation(facility: string, stop: StopRow) {
    const rows = (await client.query<{ id: string; latitude: number; longitude: number; address_line1: string; postal_code: string | null; location_name: string }>(
      `SELECT id::text, latitude::double precision, longitude::double precision, address_line1, postal_code, location_name
         FROM mdata.locations
        WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND address_line1 ~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S'
          AND lower(coalesce(city,'')) = lower(coalesce($2,'')) AND upper(coalesce(state,'')) = upper(coalesce($3,''))`,
      [companyId, stop.city, stop.state])).rows;
    const want = normName(facility);
    const hits = rows.filter((r) => { const have = normName(r.location_name); return have.length >= 4 && (have === want || have.includes(want) || want.includes(have)); });
    const distinct = [...new Map(hits.map((h) => [normName(h.address_line1), h])).values()];
    return distinct.length === 1 ? distinct[0]! : null;
  }

  async function placeLookup(facility: string, stop: StopRow): Promise<{ result: AddressResult; confidence: number } | null> {
    if (!isGooglePlacesEnabled() || !isGooglePlacesConfigured() || !stop.city || !stop.state) return null;
    lastProviderAt = await paceProviderCalls(lastProviderAt);
    let results: AddressResult[] = [];
    try {
      results = await searchAddress([facility, stop.city, [stop.state, stop.postal_code].filter(Boolean).join(" ")].join(", "), 5);
    } catch {
      return null;
    }
    const pick = pickPlaceForFacility(facility, stop, results);
    return pick;
  }
  // Lead 2026-10-01 (measured on load 13593, stops c83ba2a2/886d3f7f: booked 2026-09-30 05:13Z with
  // city/state only, latitude NULL, geocode_attempted_at NULL, geocode_failure_reason NULL — zero
  // evidence a geocode was ever tried). The whole sweep ran as ONE transaction, so any throw after
  // the first stop (provider, locations insert, geofence insert) rolled back every stamp written so
  // far and the post-book caller only console.error'd it. Each stop now runs inside its own
  // SAVEPOINT: a thrown error is rolled back to that savepoint, the stop is stamped with a stable
  // failure reason (durable evidence, re-swept later), and the loop continues.
  for (const stop of stops) {
    await client.query("SAVEPOINT geocode_stop");
    try {
      await geocodeOneStop(stop);
      await client.query("RELEASE SAVEPOINT geocode_stop");
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT geocode_stop");
      const reason = `unexpected:${stableProviderFailureReason(error)}`;
      await client.query(`UPDATE mdata.load_stops SET geocode_attempted_at=now(), geocode_failure_reason=$2, updated_at=now() WHERE id=$1::uuid`, [stop.stop_id, reason]);
      failures.push({ stop_id: stop.stop_id, load_id: stop.load_id, reason });
      await client.query("RELEASE SAVEPOINT geocode_stop");
    }
  }
  return { stops_checked: stops.length, stops_geocoded: geocoded, locations_linked: locations, geofences_created: fences, rooftop, locality, failures, samsara_matched: samsara, zip_center_listed: listed, street_from_location: streetFromLocation, street_from_place: streetFromPlace };

  /**
   * 443.38 RESOLUTION ORDER (every booking, every source):
   *   (a) the stop's existing mdata.locations row, when that location has a street;
   *   (b) the owner's Samsara address (samsara-stop-match.ts) — its street, coordinates and its own geofence polygon
   *       (geo.geofences.samsara_address_id) via ensureSamsaraAddressLocation;
   *   (c) the street from the owner's files on the stop, geocoded (the provider's precision; rooftop only from a street);
   *   (d) zip / city center: precision 'locality', geocode_source zip_center / city_center, NO location, NO fence —
   *       listed for the owner. Never a fence around a zip center.
   */
  async function geocodeOneStop(stop: StopRow): Promise<void> {
    let placeOutcome: { ok: true; latitude: number; longitude: number; source: string; confidence: number; precision: "rooftop" } | null = null;
    const placeTried = isGooglePlacesEnabled() && isGooglePlacesConfigured();
    if (!(stop.location_id && stop.location_has_street && stop.location_latitude != null && stop.location_longitude != null)) {
      const match = await matchSamsaraAddressForStop(client, companyId, {
        facility_name: stop.facility_name ?? (looksLikeStreet(stop.address_line1) ? null : stop.address_line1),
        city: stop.city, state: stop.state,
        latitude: stop.latitude ?? stop.location_latitude, longitude: stop.longitude ?? stop.location_longitude,
      });
      if (match) {
        const locationId = await ensureSamsaraAddressLocation(client as never, companyId, match.address);
        const where = parseFormattedAddress(match.address.formatted_address);
        const updated = await client.query<{ id: string }>(`
          UPDATE mdata.load_stops SET location_id=$2::uuid, latitude=$3, longitude=$4,
            address_line1 = CASE WHEN address_line1 ~ '^\s*[0-9]+[A-Za-z]?\s+\S' THEN address_line1 ELSE coalesce($5, address_line1) END,
            facility_name = coalesce(facility_name, CASE WHEN address_line1 !~ '^\s*[0-9]+[A-Za-z]?\s+\S' THEN address_line1 END, $6),
            postal_code = coalesce(postal_code, $7),
            geocode_source=$8, geocode_confidence=1, geocode_precision='rooftop', geocode_attempted_at=now(),
            geocode_failure_reason=NULL, updated_at=now()
          WHERE id=$1::uuid RETURNING id::text`,
          [stop.stop_id, locationId, match.address.lat, match.address.lng, where.street, match.address.name, where.zip,
            match.how === "name" ? "samsara_address" : "samsara_address_proximity"]);
        if (updated.rows[0]) { geocoded += 1; locations += 1; rooftop += 1; samsara += 1; }
        return;
      }
      const facility = stop.facility_name ?? (looksLikeStreet(stop.address_line1) ? null : stop.address_line1);
      if (!looksLikeStreet(stop.address_line1) && facility && normName(facility).length >= 4) {
        // 443.43 (ii): an existing location of the owner's for this facility in this city that already has a street.
        const known = await existingStreetLocation(facility, stop);
        if (known) {
          const updated = await client.query<{ id: string }>(`
            UPDATE mdata.load_stops SET location_id=$2::uuid, latitude=$3, longitude=$4,
              address_line1=$5, postal_code=coalesce(postal_code, $6), facility_name=coalesce(facility_name, $7),
              geocode_source='location_existing', geocode_confidence=0.9, geocode_precision='rooftop',
              geocode_attempted_at=now(), geocode_failure_reason=NULL, updated_at=now()
            WHERE id=$1::uuid RETURNING id::text`,
            [stop.stop_id, known.id, known.latitude, known.longitude, known.address_line1, known.postal_code, facility]);
          if (updated.rows[0]) { geocoded += 1; locations += 1; rooftop += 1; streetFromLocation += 1; }
          return;
        }
        // 443.43 (iii): the app geocoder's PLACE lookup by facility name + city / state / zip — accepted only when the place's
        // name matches the facility AND its city and state match the stop; stored as 'geocoder_place' with its confidence.
        const place = await placeLookup(facility, stop);
        if (place) {
          await client.query(
            `UPDATE mdata.load_stops SET address_line1=$2, postal_code=coalesce(postal_code, $3), facility_name=coalesce(facility_name, $4), updated_at=now() WHERE id=$1::uuid`,
            [stop.stop_id, place.result.address_line1, place.result.zip || null, facility]);
          stop = { ...stop, address_line1: place.result.address_line1, postal_code: stop.postal_code ?? (place.result.zip || null), location_id: null };
          placeOutcome = { ok: true, latitude: place.result.lat!, longitude: place.result.lon!, source: "geocoder_place", confidence: place.confidence, precision: "rooftop" };
          streetFromPlace += 1;
        }
      }
      if (!placeOutcome && !looksLikeStreet(stop.address_line1) && !(stop.geocode_source && stop.geocode_source !== "picker")) {
        // (d) no street, no Samsara address: the zip / city center, honestly labelled, and nothing drawn around it.
        let lat = stop.latitude, lng = stop.longitude, source = stop.postal_code ? "zip_center" : "city_center";
        if (lat == null || lng == null) {
          lastProviderAt = await paceProviderCalls(lastProviderAt);
          const centre = await geocodeAddressWithEvidence({ ...stop, address_line1: null });
          if (!centre.ok || (centre.latitude === 0 && centre.longitude === 0)) {
            const reason = centre.ok ? "zero_coordinates_rejected" : centre.reason;
            await client.query(`UPDATE mdata.load_stops SET geocode_attempted_at=now(), geocode_failure_reason=$2, updated_at=now() WHERE id=$1::uuid`, [stop.stop_id, reason]);
            failures.push({ stop_id: stop.stop_id, load_id: stop.load_id, reason });
            return;
          }
          lat = centre.latitude; lng = centre.longitude;
        }
        const updated = await client.query<{ id: string }>(`
          UPDATE mdata.load_stops SET latitude=$2, longitude=$3, geocode_source=$4, geocode_confidence=0.5,
            geocode_precision='locality', geocode_attempted_at=now(),
            -- 443.44: say WHY the stop has no street, and whether the server-side place step has looked yet (the sweep picks
            -- 'no_street_source' stops it has not tried; a place-key-less run records 'no_street_source_place_untried').
            geocode_failure_reason=$5, location_id=NULL, updated_at=now()
          WHERE id=$1::uuid RETURNING id::text`, [stop.stop_id, lat, lng, source, placeTried ? "no_street_source" : "no_street_source_place_untried"]);
        if (updated.rows[0]) {
          geocoded += 1; locality += 1;
          listed.push({ stop_id: stop.stop_id, load_id: stop.load_id, city: stop.city, state: stop.state, postal_code: stop.postal_code, reason: "no_owner_street_no_samsara_address" });
        }
        return;
      }
      if (!placeOutcome && looksLikeStreet(stop.address_line1) && !(stop.geocode_source && stop.geocode_source !== "picker")) {
        // (c) the owner's street: geocode the street itself, never trust unstamped coordinates as a rooftop pin.
        stop = { ...stop, location_id: null, latitude: null, longitude: null, location_latitude: null, location_longitude: null };
      }
    }
    const hasPickerCoordinates = stop.latitude != null && stop.longitude != null && !!stop.geocode_source && stop.geocode_source !== "picker";
    const hasCanonicalCoordinates = stop.location_latitude != null && stop.location_longitude != null;
    if (!hasPickerCoordinates && !hasCanonicalCoordinates) lastProviderAt = await paceProviderCalls(lastProviderAt);
    const outcome = placeOutcome
      ? placeOutcome
      : hasPickerCoordinates
      // Lead 2026-10-01: coordinates already on the stop keep the precision they were stamped with
      // (13508's pickup carried GEOMETRIC_CENTER from Google; relabelling it 'rooftop' here would
      // lie to E-25's radius rule). Only a stop with no stamped precision is treated as a picker pin.
      ? { ok: true as const, latitude: stop.latitude!, longitude: stop.longitude!, source: stop.geocode_source!, confidence: 1, precision: (stop.geocode_precision ?? "range") as "rooftop" }
      : hasCanonicalCoordinates
      ? { ok: true as const, latitude: stop.location_latitude!, longitude: stop.location_longitude!, source: "location_existing", confidence: 1, precision: "range" as const }
      : await geocodeAddressWithEvidence(stop);
    if (!outcome.ok || (outcome.latitude === 0 && outcome.longitude === 0)) {
      const reason = outcome.ok ? "zero_coordinates_rejected" : outcome.reason;
      await client.query(`UPDATE mdata.load_stops SET geocode_attempted_at=now(), geocode_failure_reason=$2, updated_at=now() WHERE id=$1::uuid`, [stop.stop_id, reason]);
      failures.push({ stop_id: stop.stop_id, load_id: stop.load_id, reason });
      return;
    }
    if (outcome.precision === "locality") {
      const updated = await client.query<{ id: string }>(`
        UPDATE mdata.load_stops SET latitude=$2, longitude=$3, geocode_source=$4,
          geocode_confidence=$5, geocode_precision='locality', geocode_attempted_at=now(),
          geocode_failure_reason=NULL, location_id=NULL, updated_at=now()
        WHERE id=$1::uuid RETURNING id::text`, [stop.stop_id, outcome.latitude, outcome.longitude, outcome.source, outcome.confidence]);
      if (updated.rows[0]) { geocoded += 1; locality += 1; }
      return;
    }
    const locationId = stop.location_id ?? await findOrCreateLocation(client, companyId, actorId, stop, outcome.latitude, outcome.longitude, outcome.source);
    const updated = await client.query<{ id: string }>(`
      UPDATE mdata.load_stops SET location_id=$2::uuid, latitude=$3, longitude=$4,
        geocode_source=$5, geocode_confidence=$6, geocode_precision=$7, geocode_attempted_at=now(), geocode_failure_reason=NULL, updated_at=now()
      WHERE id=$1::uuid RETURNING id::text`, [stop.stop_id, locationId, outcome.latitude, outcome.longitude, outcome.source, outcome.confidence, outcome.precision]);
    if (!updated.rows[0]) return;
    geocoded += 1; locations += 1; rooftop += 1;
    // ROUND 329: geo.geofences has no unique key on location_ref_id, and findOrCreateLocation's lock is only taken for
    // a NEW location — lock the location itself so the NOT EXISTS below cannot race a twin fence in.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`geo.location_fence|${companyId}|${locationId}`]);
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO geo.geofences
        (operating_company_id,label,location_kind,location_ref_id,vertices_json,is_active,source,
         center_lat,center_lng,radius_m,approach_radius_m,enter_radius_m,exit_radius_m,created_by_user_uuid,updated_by_user_uuid)
      SELECT $1::uuid,$2,'custom',$3::uuid,$4::jsonb,true,'auto_dispatch',$5,$6,$7,$8,$7,$8,$9::uuid,$9::uuid
      WHERE NOT EXISTS (SELECT 1 FROM geo.geofences WHERE operating_company_id=$1::uuid AND location_ref_id=$3::uuid AND is_active)
      RETURNING id::text`, [companyId, labelOf(stop), locationId, JSON.stringify(squareVerticesFromCenter(outcome.latitude, outcome.longitude, ENTER_RADIUS_M * 2)), outcome.latitude, outcome.longitude, ENTER_RADIUS_M, EXIT_RADIUS_M, actorId]);
    if (inserted.rows[0]) fences += 1;
  }
}

export async function geocodeStopsBackfill(actorId: string, companyId: string, loadId?: string, opts: { reresolve?: boolean } = {}) {
  return withCurrentUser(actorId, async (client) => {
    await setScopedCompanyContext(client, actorId, companyId);
    return geocodeStopsWithClient(client as DbClient, actorId, companyId, loadId, opts);
  });
}
