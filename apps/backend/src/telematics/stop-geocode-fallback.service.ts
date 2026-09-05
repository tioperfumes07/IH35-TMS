// D5 (STANDING-DIRECTIVES-2026-09-05.md, "D5 Book Load auto-geofence FE trigger", owner ruling
// 2026-09-05 21:35Z-ish — build as a separate service/util, own worktree, do not touch
// BookLoadModalV4.tsx while GATE-ROT-07's WIP is unresolved there): the real gap behind D5's
// remaining "0 of 114 stops have lat/lng" number was never a missing endpoint or wizard field --
// telematics/auto-geofence.service.ts's geocodeStopIfNeeded() has been a literal stub since it
// was written ("Non-blocking MVP: rely on stop/location coordinates. External geocoder
// integration can be added without changing CAP-2 callsites."). This module IS that geocoder
// integration -- it reuses the SAME Trimble/Google provider chain already built + owner-ruled
// "must return real addresses" for the address-search field (integrations/trimble/
// geocoding.routes.ts's activeProvider()), rather than inventing a new one.
import { isPcmilerEnabled, isTrimbleConfigured, singleSearchGeocode } from "../integrations/trimble/trimble-maps-client.js";
import { isGooglePlacesEnabled, isGooglePlacesConfigured, searchAddress } from "../integrations/google/google-places-client.js";

export type GeocodableAddress = {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

export type LatLng = { latitude: number; longitude: number };

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Same provider preference as geocoding.routes.ts's activeProvider() -- Trimble/PC*MILER first
 *  when flagged+configured, Google Places Text Search as the fallback, null when neither is on.
 *  Duplicated here deliberately (2 lines) rather than exporting/importing a shared helper from
 *  the route file, per this item's own scope: a separate service/util, minimal touch elsewhere. */
function activeGeocodeProvider(): "trimble" | "google" | null {
  if (isPcmilerEnabled() && isTrimbleConfigured()) return "trimble";
  if (isGooglePlacesEnabled() && isGooglePlacesConfigured()) return "google";
  return null;
}

function addressQuery(a: GeocodableAddress): string | null {
  const parts = [a.address_line1, a.city, a.state, a.postal_code, a.country].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  if (parts.length === 0) return null;
  return parts.join(", ");
}

/**
 * Geocodes one address to lat/lng using whichever provider is active. Returns null (never
 * throws) when no provider is configured, the address has nothing to search on, the provider
 * returns zero candidates, or the call fails -- every caller already treats "no coordinates" as
 * legitimate, non-blocking state (CAP-2's own design), so a geocode failure must degrade the
 * same way a missing address always has, not surface as a 500.
 */
export async function geocodeAddress(address: GeocodableAddress): Promise<LatLng | null> {
  const provider = activeGeocodeProvider();
  if (!provider) return null;
  const query = addressQuery(address);
  if (!query) return null;
  try {
    const results = provider === "trimble" ? await singleSearchGeocode(query, 1) : await searchAddress(query, 1);
    const first = results[0];
    if (!first || typeof first.lat !== "number" || typeof first.lon !== "number") return null;
    return { latitude: first.lat, longitude: first.lon };
  } catch {
    // Never log the key/url (same discipline as geocoding.routes.ts); a transient provider
    // failure degrades to "no coordinates yet", not an error surfaced to the caller.
    return null;
  }
}

export type BackfillResult = {
  stops_checked: number;
  stops_geocoded: number;
  stops_already_had_coordinates: number;
  stops_geocode_failed: number;
};

/**
 * Finds this load's stops with no lat/lng, geocodes each from its address, and persists the
 * result onto mdata.load_stops. Read + write both happen through the caller-supplied,
 * already-scoped client (withCompanyScope/withCurrentUser) -- this function does not open its
 * own transaction or set its own tenant context.
 */
export async function backfillStopCoordinatesForLoad(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string
): Promise<BackfillResult> {
  const stopsRes = await client.query<{
    id: string;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
      SELECT s.id::text AS id, s.address_line1, s.city, s.state, s.postal_code, s.country, s.latitude, s.longitude
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      WHERE l.operating_company_id = $1::uuid
        AND l.id = $2::uuid
        AND s.soft_deleted_at IS NULL
      ORDER BY s.sequence_number ASC
    `,
    [operatingCompanyId, loadId]
  );

  let geocoded = 0;
  let alreadyHad = 0;
  let failed = 0;
  for (const stop of stopsRes.rows) {
    if (stop.latitude != null && stop.longitude != null) {
      alreadyHad += 1;
      continue;
    }
    const center = await geocodeAddress(stop);
    if (!center) {
      failed += 1;
      continue;
    }
    const updated = await client.query<{ id: string }>(
      `
        UPDATE mdata.load_stops
        SET latitude = $3, longitude = $4, updated_at = now()
        WHERE id = $1::uuid
          AND load_id = $2::uuid
          AND latitude IS NULL
          AND longitude IS NULL
        RETURNING id::text AS id
      `,
      [stop.id, loadId, center.latitude, center.longitude]
    );
    if (updated.rows[0]?.id) geocoded += 1;
    else failed += 1;
  }

  return {
    stops_checked: stopsRes.rows.length,
    stops_geocoded: geocoded,
    stops_already_had_coordinates: alreadyHad,
    stops_geocode_failed: failed,
  };
}
