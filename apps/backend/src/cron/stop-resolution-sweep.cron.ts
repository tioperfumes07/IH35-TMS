/**
 * ENGINE: stop resolution sweep
 * SCHEDULE: 15 *\/6 * * * (+ once ~3 min after boot)
 * WRITES: mdata.load_stops (street / coordinates / geocode_* / location_id), mdata.locations, geo.geofences — only through
 *         geocodeStopsWithClient (telematics/stops-geocode-backfill.service.ts); external: Google Places text search
 * IDEMPOTENCY: ADVISORY LOCK (geocodeStopsWithClient locks <company>|<address> per location and geo.location_fence|<company>|<location>
 *              per fence, SAME-STATEMENT WHERE NOT EXISTS an active fence) + DETERMINISTIC OVERWRITE of the stop's own geocode columns;
 *              a stop already on a street is never re-picked
 * OVERLAP: lease per tick (withJobLease); a second instance skips
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * Lead 443.43 #4 (owner 2026-10-11): a stop that carries a facility name but still sits at a zip / city center is re-resolved
 * on the server — where the app geocoder's Places key lives — through the same resolution order every booking uses:
 * Samsara address by facility + city > existing location with a street > the geocoder's PLACE lookup (name + city/state must
 * match, source 'geocoder_place') > left at the zip center, listed. New Samsara addresses or locations resolve old stops too.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { listSamsaraIngestionTenantIds } from "../integrations/samsara/ingestion-tenants.service.js";
import { geocodeStopsWithClient } from "../telematics/stops-geocode-backfill.service.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";

const CRON_NAME = "dispatch.stop_resolution_sweep";
const SYSTEM_ACTOR = SYSTEM_ACTOR_USER_ID;
let initialized = false;

/** One sweep: every load of every ingestion tenant with a named stop still at a zip / city center, re-resolved. */
export async function runStopResolutionSweepTick(limit = 200) {
  return withLuciaBypass(async (client) => {
    const out: Array<{ operating_company_id: string; loads: number; resolved: number; still_zip_center: number }> = [];
    for (const operatingCompanyId of await listSamsaraIngestionTenantIds(client)) {
      assertTenantContext(operatingCompanyId, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      const loads = (
        await client.query<{ load_id: string }>(
          `SELECT DISTINCT s.load_id::text AS load_id
             FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
            WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.status <> 'cancelled'
              AND s.soft_deleted_at IS NULL AND s.facility_name IS NOT NULL
              AND s.geocode_source IN ('zip_center', 'city_center')
              AND (s.geocode_attempted_at IS NULL OR s.geocode_attempted_at < now() - interval '5 hours')
            LIMIT $2`,
          [operatingCompanyId, limit]
        )
      ).rows;
      let resolved = 0, still = 0;
      for (const { load_id } of loads) {
        const r = await geocodeStopsWithClient(client as never, SYSTEM_ACTOR, operatingCompanyId, load_id, { reresolve: true });
        resolved += r.samsara_matched + (r.street_from_location ?? 0) + (r.street_from_place ?? 0);
        still += r.zip_center_listed.length;
      }
      out.push({ operating_company_id: operatingCompanyId, loads: loads.length, resolved, still_zip_center: still });
    }
    return out;
  });
}

export function initializeStopResolutionSweepCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  const tick = (name: string) =>
    wrapBackgroundJobTick(name, async () => {
      app.log.info({ result: await runStopResolutionSweepTick() }, `${name} complete`);
    }, app.log, { leaseSeconds: JOB_LEASE_SECONDS });
  cron.schedule("15 */6 * * *", async () => { await tick(CRON_NAME); }, { timezone: "America/Chicago", maxRandomDelay: 30_000 });
  setTimeout(() => { void tick(`${CRON_NAME}.boot`); }, 180_000).unref?.();
  app.log.info(`${CRON_NAME} scheduled (every 6 h at :15 America/Chicago, + once after boot)`);
}
