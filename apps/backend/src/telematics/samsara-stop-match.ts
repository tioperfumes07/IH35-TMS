/**
 * ROUND 443.38 (owner 2026-10-11 00:30 CT) — a booked stop resolves to the owner's Samsara address when one is his:
 * matched by facility name (same state, or within NAME_RADIUS_M), else by being the ONE Samsara address within
 * PROXIMITY_RADIUS_M of the stop in the same city. Ambiguity is never guessed: no match, and the next step of the
 * resolution order runs (owner-file street, then zip / city center with no fence).
 */
import { parseFormattedAddress, type SamsaraAddressMirrorRow } from "../integrations/samsara/geofences/address-import.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const NAME_RADIUS_M = 50_000;
export const PROXIMITY_RADIUS_M = 1_000;

export type SamsaraCandidate = SamsaraAddressMirrorRow & { distance_m: number | null };
export type SamsaraStopMatch = { address: SamsaraCandidate; how: "name" | "proximity" };

export const normName = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase() && String(a ?? "").trim() !== "";

/** Pure: the one Samsara address this stop is, or null. */
export function pickSamsaraMatch(
  stop: { facility_name: string | null; city: string | null; state: string | null },
  candidates: SamsaraCandidate[]
): SamsaraStopMatch | null {
  const want = normName(stop.facility_name);
  if (want.length >= 4) {
    const hits = candidates.filter((c) => {
      const have = normName(c.name);
      if (have.length < 4 || !(have === want || have.includes(want) || want.includes(have))) return false;
      const where = parseFormattedAddress(c.formatted_address);
      return (where.state && same(where.state, stop.state)) || (c.distance_m != null && c.distance_m <= NAME_RADIUS_M);
    });
    if (hits.length === 1) return { address: hits[0]!, how: "name" };
    if (hits.length > 1) {
      const near = hits.filter((c) => c.distance_m != null && c.distance_m <= NAME_RADIUS_M).sort((a, b) => a.distance_m! - b.distance_m!);
      // Several same-name sites: only the nearest when it is clearly the one (the next is at least twice as far).
      if (near.length === 1 || (near.length > 1 && near[1]!.distance_m! >= 2 * near[0]!.distance_m!)) return { address: near[0]!, how: "name" };
      return null;
    }
  }
  const close = candidates.filter((c) => c.distance_m != null && c.distance_m <= PROXIMITY_RADIUS_M && same(parseFormattedAddress(c.formatted_address).city, stop.city));
  return close.length === 1 ? { address: close[0]!, how: "proximity" } : null;
}

export async function matchSamsaraAddressForStop(
  client: DbClient,
  companyId: string,
  stop: { facility_name: string | null; city: string | null; state: string | null; latitude: number | null; longitude: number | null }
): Promise<SamsaraStopMatch | null> {
  const rows = (
    await client.query<SamsaraCandidate>(
      `SELECT samsara_address_id, name, formatted_address, lat, lng, geofence_json, raw_json,
              CASE WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN NULL
                   ELSE 111320 * sqrt(power(lat - $2::double precision, 2) +
                        power((lng - $3::double precision) * cos(radians($2::double precision)), 2)) END AS distance_m
         FROM integrations.samsara_addresses
        WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL`,
      [companyId, stop.latitude, stop.longitude]
    )
  ).rows.map((r) => ({ ...r, distance_m: r.distance_m == null ? null : Number(r.distance_m) }));
  return pickSamsaraMatch(stop, rows);
}
