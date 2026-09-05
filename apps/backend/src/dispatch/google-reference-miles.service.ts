// DSP-48 (owner ruling 2026-09-05, "LAW §2 row: Google distance = REFERENCE ONLY"). Persists a
// Google Routes computeRoutes distance per leg of a load's practical route (pickup -> ... ->
// delivery), purely for operator comparison against the typed Practical/Short miles -- NEVER
// read by pay/RPM/settlement (LINKAGE, by design: load_stops -> load_stop_legs <-> mdata.loads,
// no FK to any money table). verify-google-reference-miles.mjs enforces that boundary at every
// call site that touches miles_practical/miles_shortest.
//
// mdata.load_stop_legs is a forward-ref pending CC-1's migration (docs/bus/INBOX-CC-1.md,
// 2026-09-05) -- every write here is try/catch degrade-safe on a relation-absent error, same
// discipline as the existing forward-refs in scripts/canonical-relations.json's
// KNOWN_PHANTOM_DEBT list (e.g. tasks.task_link). Until that migration lands, this is a
// build-and-hold no-op; once it lands, no code change is needed here.
import { computeRouteReference, isGoogleRoutesConfigured, isGoogleRoutesEnabled } from "../integrations/google/routes-api-client.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type GoogleReferenceMilesInput = {
  operating_company_id: string;
  load_id: string;
};

export type GoogleReferenceMilesResult = {
  legs_checked: number;
  legs_persisted: number;
};

// Same convention as book-load.service.ts's RELATION_ABSENT_CODES -- a forward-ref to a table/
// column that doesn't exist yet must degrade to a no-op, never a 500 on the booking path.
const RELATION_ABSENT_CODES = new Set(["42P01", "42703", "42883", "3F000", "42704"]);

function isRelationAbsentError(err: unknown): boolean {
  return typeof err === "object" && err !== null && RELATION_ABSENT_CODES.has((err as { code?: string }).code ?? "");
}

/**
 * Computes + persists the Google reference distance for each consecutive stop-to-stop leg of
 * this load's practical route (pickup -> ... -> delivery). Stops without coordinates are
 * skipped (the leg simply isn't quoted -- same honest-gap discipline as auto-geofence.service.ts's
 * skipped_missing_coordinates). One Routes API call per leg (DSP-48's own requirement), so one
 * bad leg never blocks the others.
 */
export async function computeAndPersistLoadRouteReference(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string
): Promise<GoogleReferenceMilesResult> {
  if (!isGoogleRoutesEnabled() || !isGoogleRoutesConfigured()) {
    return { legs_checked: 0, legs_persisted: 0 };
  }

  const stopsRes = await client.query<{ id: string; latitude: number | null; longitude: number | null }>(
    `
      SELECT s.id::text AS id, s.latitude, s.longitude
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      WHERE l.operating_company_id = $1::uuid
        AND l.id = $2::uuid
        AND s.soft_deleted_at IS NULL
      ORDER BY s.sequence_number ASC
    `,
    [operatingCompanyId, loadId]
  );
  const stops = stopsRes.rows;

  let checked = 0;
  let persisted = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i];
    const to = stops[i + 1];
    if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) continue;
    checked += 1;
    const reference = await computeRouteReference(
      { lat: from.latitude, lng: from.longitude },
      { lat: to.latitude, lng: to.longitude }
    );
    if (!reference) continue;
    try {
      await client.query(
        `
          INSERT INTO mdata.load_stop_legs (
            load_id, operating_company_id, leg_index, leg_kind, from_stop_id, to_stop_id,
            google_reference_miles, google_reference_fetched_at
          )
          VALUES ($1::uuid, $2::uuid, $3, 'practical', $4::uuid, $5::uuid, $6, now())
          ON CONFLICT (load_id, leg_index) DO UPDATE
            SET google_reference_miles = EXCLUDED.google_reference_miles,
                google_reference_fetched_at = EXCLUDED.google_reference_fetched_at
        `,
        [loadId, operatingCompanyId, i, from.id, to.id, reference.miles]
      );
      persisted += 1;
    } catch (err) {
      if (!isRelationAbsentError(err)) throw err;
      // mdata.load_stop_legs not migrated yet -- degrade to computed-but-not-persisted.
    }
  }

  return { legs_checked: checked, legs_persisted: persisted };
}

/** Same self-contained-transaction shape as telematics/auto-geofence.service.ts's
 *  autoCreateGeofencesForLoad -- the one entry point bookLoad() fires non-blocking after commit. */
export async function computeAndPersistGoogleReferenceMilesForLoad(
  actorUserId: string,
  input: GoogleReferenceMilesInput
): Promise<GoogleReferenceMilesResult> {
  const { withCurrentUser } = await import("../auth/db.js");
  return withCurrentUser(actorUserId, async (client) => {
    await setScopedCompanyContext(client, actorUserId, input.operating_company_id);
    return computeAndPersistLoadRouteReference(client as DbClient, input.operating_company_id, input.load_id);
  });
}

/**
 * Nightly expiry (Google ToS: cached route data may not be retained past 30 days). Nulls out
 * google_reference_miles/google_reference_fetched_at on rows older than 30 days -- the row
 * itself (and its from/to stop linkage) stays, only the Google-sourced figures are cleared.
 */
export async function expireStaleGoogleReferenceMiles(client: DbClient): Promise<{ expired: number }> {
  try {
    const res = await client.query<{ id: string }>(
      `
        UPDATE mdata.load_stop_legs
        SET google_reference_miles = NULL, google_reference_fetched_at = NULL
        WHERE google_reference_fetched_at IS NOT NULL
          AND google_reference_fetched_at < now() - interval '30 days'
        RETURNING id::text AS id
      `
    );
    return { expired: res.rows.length };
  } catch (err) {
    if (!isRelationAbsentError(err)) throw err;
    return { expired: 0 };
  }
}
