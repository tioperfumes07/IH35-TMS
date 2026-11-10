/**
 * ENGINE: load real-driven miles — per-stop leg miles and per-load total from odometer captures.
 * SCHEDULE: hourly :25 America/Chicago (node-cron).
 * WRITES: mdata.load_stops (leg_miles_driven_actual*) · mdata.loads (miles_driven_actual*) — UPDATE only, no INSERT
 *   (load-real-driven-miles.service.ts:251, :258) · telematics.odometer_readings (E11 backfill: Samsara's own reads at the
 *   boundaries the compute could not measure; INSERT … ON CONFLICT DO NOTHING).
 * IDEMPOTENCY: DETERMINISTIC OVERWRITE — each UPDATE sets a computed column to a pure function of the captures; no
 *   history or recalculation-log row is inserted.
 * OVERLAP: one instance per tick (job lease, 443.103); a row is written only when a computed value changed, so a
 *   repeat run writes nothing.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { JOB_LEASE_SECONDS, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { computeLoadRealDrivenMiles, loadsDueForRealMiles, runLoadRealDrivenMilesCronTick, storageReady } from "./load-real-driven-miles.service.js";
import { runOdometerHistoryBackfill } from "./odometer-history-backfill.service.js";
import { withLuciaBypass } from "../auth/db.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { filterLiveEngineCompanies } from "../lib/live-engine-companies.js";

/**
 * E11 (ENG-29): before the miles compute, the boundaries it could not measure ask Samsara for the truck's own odometer
 * reads (odometer-history-backfill.service.ts). Per company; the Samsara calls run outside any DB transaction.
 */
export async function runOdometerHistoryBackfillTick(log: { info: (o: unknown, m?: string) => void }): Promise<void> {
  const companies = await withLuciaBypass(async (client) =>
    filterLiveEngineCompanies((await client.query<{ id: string }>(`SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY 1`)).rows.map((r) => r.id)));
  for (const companyId of companies) {
    assertTenantContext(companyId, "telematics.odometer_history_backfill");
    const summary = await runOdometerHistoryBackfill(companyId, {
      withDb: (fn) => withLuciaBypass(async (client) => {
        // membership-scope-exempt: internally-iterated-active-company
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        return fn(client as never);
      }),
      historyFor: async (client, id) => {
        const cfg = await getSamsaraConfigForCompany(client as never, id);
        if (!cfg || !cfg.is_enabled) return null;
        const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });
        return (ids, a, b) => api.listOdometerHistory(ids, a, b);
      },
      gapsFor: async (client, id) => {
        if (!(await storageReady(client as never))) return [];
        const ids = await loadsDueForRealMiles(client as never, id, true);
        const gaps = [];
        for (let i = 0; i < ids.length; i += 200) {
          for (const row of await computeLoadRealDrivenMiles(client as never, id, ids.slice(i, i + 200))) gaps.push(...(row.odometer_gaps ?? []));
        }
        return gaps;
      },
    });
    log.info({ operating_company_id: companyId, ...summary }, "telematics.odometer_history_backfill complete");
  }
}

let initialized = false;

export function initializeLoadRealDrivenMilesCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_LOAD_REAL_DRIVEN_MILES_CRON === "false") {
    app.log.info("Load real-driven-miles cron disabled via ENABLE_LOAD_REAL_DRIVEN_MILES_CRON=false");
    return;
  }

  // ORDER-2026-09-04: stores real driven miles on each delivered load and leg. Hourly at :25 -- loads deliver
  // a few times a day; the read route computes on demand in between. No-op until migration 202615160000 applies.
  cron.schedule(
    "25 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "telematics.load_real_driven_miles_cron",
        async () => {
          // E11: the odometer reads first, so this same tick measures the boundaries they fill.
          await runOdometerHistoryBackfillTick(app.log);
          await runLoadRealDrivenMilesCronTick();
        },
        app.log,
        // 443.103: one instance per tick. Without the lease every instance ran the tick (2 passes an hour, 3-4 around a
        // deploy), each rewriting every due load.
        { leaseSeconds: JOB_LEASE_SECONDS }
      );
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Load real-driven-miles cron scheduled (hourly :25 America/Chicago)");
}
