/**
 * Reconciler cron (13d) — every 15 minutes, America/Chicago, USMCA only.
 *
 * Runs every invariant and records the result in reconciler.exceptions / reconciler.runs
 * (migration 202614291200). It writes only the reconciler's own history tables; it never touches a
 * load, invoice, bill, settlement or any other transaction row. A repair stays the owner's click on
 * the engine each exception names.
 *
 * Off switch: ENABLE_RECONCILER_CRON=false.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { USMCA_COMPANY_ID } from "../org/companies.routes.js";
import { persistReconcilerRun } from "./persist.js";
import { runReconciler } from "./run.js";

const CRON_NAME = "reconciler.persist_cron";
let initialized = false;

export async function reconcilerTick(operatingCompanyId: string) {
  assertTenantContext(operatingCompanyId, CRON_NAME);
  return withLuciaBypass(async (client) => {
    const run = await runReconciler(client, operatingCompanyId);
    return persistReconcilerRun(client, run);
  });
}

export function registerReconcilerCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_RECONCILER_CRON === "false") {
    app.log.info("Reconciler cron disabled via ENABLE_RECONCILER_CRON=false");
    return;
  }

  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await reconcilerTick(USMCA_COMPANY_ID);
          app.log.info(summary, "reconciler tick");
          if (summary.errored_invariants.length) {
            app.log.warn({ errored: summary.errored_invariants }, "reconciler: invariant(s) could not be checked; their open exceptions were left open");
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago",
    }
  );

  app.log.info("Reconciler cron scheduled (every 15 min, America/Chicago, USMCA)");
}
