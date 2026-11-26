// @cron-tenant-agnostic: PERFUME desk (TIO Perfumes / ScentsX LLC, isolated perfume schema) — no operating_company_id; runs as the desk owner under RLS perfume.is_owner().
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { recordBackgroundJobDisabled, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { PERFUME_MAIL_JOB, runMailImport } from "../perfume/mail/engine.js";

/**
 * PERFUME mail price lists (owner 2026-11-25 17:29 CT: "GETS ALL THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW
 * PRICES … THIS WAY YOU DO NOT DO IT DAILY"). Every day 06:15 America/Chicago: reads the connected TIO mailboxes and saves
 * the vendors' price lists (engine.ts). Single-fire under the shared job lease (two backend instances run node-cron).
 * The owner can also press "Check mail now" on the desk at any time.
 */
let initialized = false;
const CRON_EXPRESSION = "15 6 * * *";
const CRON_TZ = "America/Chicago";
/** Longer than the shared 600 s: one run reads two mailboxes and can save many large lists. */
const LEASE_SECONDS = 1800;

export function initializePerfumeMailPriceListsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.PERFUME_MAIL_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Perfume mail price-list cron disabled via PERFUME_MAIL_CRON_ENABLED=false");
    void recordBackgroundJobDisabled(PERFUME_MAIL_JOB);
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        PERFUME_MAIL_JOB,
        async () => {
          const sum = await runMailImport({ trigger: "schedule" });
          if (sum) app.log.info({ perfume_mail: sum }, "[PERFUME] mail price lists run finished");
        },
        app.log, { leaseSeconds: LEASE_SECONDS }
      );
    },
    { maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Perfume mail price-list cron scheduled (daily 06:15 America/Chicago)");
}
