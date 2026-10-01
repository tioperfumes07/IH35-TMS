/**
 * One definition of "the odometer at a moment" for every real-driven-miles consumer (E-15 PM cost per
 * mile, ORDER-2026-09-04 load/leg real driven miles). Sources are real reads only:
 * telematics.vehicle_locations.odometer_mi and telematics.odometer_readings (measured | entered).
 * Never interpolated, never practical/short miles.
 */

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const MOVING_ANCHOR_MAX_MINUTES = 30;
/** A reading AFTER the boundary is only looked for this far out (the truck must not have moved in between). */
export const AFTER_ANCHOR_MAX_HOURS = 24;

export type OdometerAnchor = { odometer_mi: number; read_at: string; source: "vehicle_locations" | "odometer_readings" };

/**
 * Pure: the odometer at a boundary.
 * 1. The latest real reading AT/BEFORE the boundary, valid when the truck did not move between that reading
 *    and the boundary (no position fix over 1 mph or of unknown speed -> the odometer cannot have changed, any
 *    age), or when it is within MOVING_ANCHOR_MAX_MINUTES of the boundary.
 * 2. Else the earliest reading AFTER the boundary (within AFTER_ANCHOR_MAX_HOURS) with NO moving fix between
 *    the boundary and it -- the truck sat still, so the odometer then equals the odometer at the boundary.
 *    (A reading after the boundary with movement in between would drop or add miles; it is never used.)
 * Otherwise the boundary is NOT measurable and the reason says why.
 * Measured 2026-10-01: positions flowed every day 2026-08-27..2026-09-29 while odometer_mi was empty on all
 * of them -- the trucks moved, the odometer was not captured, so those boundaries refuse.
 */
export function pickAnchor(
  boundaryIso: string,
  before: OdometerAnchor | null,
  movingFixesSinceBefore: number,
  after: OdometerAnchor | null = null,
  movingFixesUntilAfter = 0
): { anchor: OdometerAnchor | null; reason: string | null } {
  if (before) {
    const ageMin = (new Date(boundaryIso).getTime() - new Date(before.read_at).getTime()) / 60_000;
    if (movingFixesSinceBefore === 0 || ageMin <= MOVING_ANCHOR_MAX_MINUTES) return { anchor: before, reason: null };
  }
  if (after && movingFixesUntilAfter === 0) return { anchor: after, reason: null };
  if (!before) return { anchor: null, reason: `no odometer reading at or before ${boundaryIso}${after ? " (the truck moved before the next one)" : ""}` };
  const ageMin = (new Date(boundaryIso).getTime() - new Date(before.read_at).getTime()) / 60_000;
  return {
    anchor: null,
    reason:
      `the truck moved (${movingFixesSinceBefore} position fixes over 1 mph or unknown speed) after the last odometer reading ` +
      `(${before.read_at}, ${Math.round(ageMin / 60)} h before ${boundaryIso}) -- odometer not captured, boundary not measurable`,
  };
}

/** Pure: real driven miles between two boundary anchors. */
export function realDrivenMiles(
  start: OdometerAnchor | null,
  end: OdometerAnchor | null,
  startReason: string | null,
  endReason: string | null
): { miles: number | null; reason: string | null } {
  if (!start) return { miles: null, reason: `start: ${startReason ?? "no anchor"}` };
  if (!end) return { miles: null, reason: `end: ${endReason ?? "no anchor"}` };
  const d = end.odometer_mi - start.odometer_mi;
  if (d < 0) return { miles: null, reason: `odometer went backwards by ${Math.abs(d).toFixed(1)} mi between the anchors -- held, not reported` };
  return { miles: Math.round(d * 10) / 10, reason: null };
}

export type BoundaryRequest = { key: string; unit_id: string; at: string };

/**
 * Resolve many boundaries in one round trip. Returns key -> { anchor, reason }.
 */
export async function fetchOdometerAnchors(
  client: DbClient,
  operatingCompanyId: string,
  boundaries: BoundaryRequest[]
): Promise<Map<string, { anchor: OdometerAnchor | null; reason: string | null }>> {
  const out = new Map<string, { anchor: OdometerAnchor | null; reason: string | null }>();
  if (boundaries.length === 0) return out;
  const r = await client.query<{
    k: string; at: string;
    b_odo: string | null; b_at: string | null; b_src: OdometerAnchor["source"] | null; b_moving: string | null;
    a_odo: string | null; a_at: string | null; a_src: OdometerAnchor["source"] | null; a_moving: string | null;
  }>(
    `WITH q AS (SELECT * FROM unnest($2::text[], $3::uuid[], $4::timestamptz[]) AS q(k, unit_id, ts))
     SELECT q.k, q.ts::text AS at,
            sb.odo::text AS b_odo, sb.at::text AS b_at, sb.src AS b_src, smv.n::text AS b_moving,
            sa.odo::text AS a_odo, sa.at::text AS a_at, sa.src AS a_src, amv.n::text AS a_moving
       FROM q
       LEFT JOIN LATERAL (SELECT * FROM (
           (SELECT odometer_mi AS odo, captured_at AS at, 'vehicle_locations' AS src FROM telematics.vehicle_locations
             WHERE operating_company_id = $1::uuid AND unit_id = q.unit_id AND odometer_mi IS NOT NULL AND captured_at <= q.ts
             ORDER BY captured_at DESC LIMIT 1)
           UNION ALL
           (SELECT odometer_miles, read_at, 'odometer_readings' FROM telematics.odometer_readings
             WHERE operating_company_id = $1::uuid AND unit_id = q.unit_id AND odometer_miles IS NOT NULL
               AND confidence IN ('measured','entered') AND read_at <= q.ts
             ORDER BY read_at DESC LIMIT 1)
         ) x ORDER BY at DESC LIMIT 1) sb ON true
       LEFT JOIN LATERAL (SELECT count(*) AS n FROM telematics.vehicle_locations v
          WHERE v.operating_company_id = $1::uuid AND v.unit_id = q.unit_id AND (v.speed_mph IS NULL OR v.speed_mph > 1)
            AND v.captured_at > sb.at AND v.captured_at <= q.ts) smv ON true
       LEFT JOIN LATERAL (SELECT * FROM (
           (SELECT odometer_mi AS odo, captured_at AS at, 'vehicle_locations' AS src FROM telematics.vehicle_locations
             WHERE operating_company_id = $1::uuid AND unit_id = q.unit_id AND odometer_mi IS NOT NULL
               AND captured_at > q.ts AND captured_at <= q.ts + make_interval(hours => $5::int)
             ORDER BY captured_at ASC LIMIT 1)
           UNION ALL
           (SELECT odometer_miles, read_at, 'odometer_readings' FROM telematics.odometer_readings
             WHERE operating_company_id = $1::uuid AND unit_id = q.unit_id AND odometer_miles IS NOT NULL
               AND confidence IN ('measured','entered') AND read_at > q.ts AND read_at <= q.ts + make_interval(hours => $5::int)
             ORDER BY read_at ASC LIMIT 1)
         ) x ORDER BY at ASC LIMIT 1) sa ON true
       LEFT JOIN LATERAL (SELECT count(*) AS n FROM telematics.vehicle_locations v
          WHERE v.operating_company_id = $1::uuid AND v.unit_id = q.unit_id AND (v.speed_mph IS NULL OR v.speed_mph > 1)
            AND v.captured_at >= q.ts AND v.captured_at < sa.at) amv ON true`,
    [operatingCompanyId, boundaries.map((b) => b.key), boundaries.map((b) => b.unit_id), boundaries.map((b) => b.at), AFTER_ANCHOR_MAX_HOURS]
  );
  for (const row of r.rows) {
    const before = row.b_odo != null && row.b_at && row.b_src ? { odometer_mi: Number(row.b_odo), read_at: row.b_at, source: row.b_src } : null;
    const after = row.a_odo != null && row.a_at && row.a_src ? { odometer_mi: Number(row.a_odo), read_at: row.a_at, source: row.a_src } : null;
    out.set(row.k, pickAnchor(row.at, before, Number(row.b_moving ?? 0), after, Number(row.a_moving ?? 0)));
  }
  return out;
}
