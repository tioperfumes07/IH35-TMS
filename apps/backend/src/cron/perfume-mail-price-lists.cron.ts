// @cron-tenant-agnostic: PERFUME desk (TIO Perfumes / ScentsX LLC, isolated perfume schema) — no operating_company_id; runs as the desk owner under RLS perfume.is_owner().
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { recordBackgroundJobDisabled, wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { PERFUME_MAIL_JOB, runMailImport } from "../perfume/mail/engine.js";

/**
 * PERFUME mail price lists (owner 2026-11-25 17:29 CT: "GETS ALL THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW
 * PRICES … THIS WAY YOU DO NOT DO IT DAILY"). Reads the connected TIO mailboxes and saves the vendors' price lists
 * (engine.ts). Single-fire under the shared job lease (two backend instances run node-cron). The owner can also press
 * "Check mail now" on the desk at any time.
 *
 * WHEN (owner 2026-11-25 22:50 CT: "check the last 10 days so we can have approx times how often that vendors sends list").
 * Measured from the Mac Mail database: 506 list emails from 36 vendors, 10/11–11/25/2026, usual arrival (Central time):
 *   overnight  WCDI 05:04 · PDI 06:24 · Le Parfum 02:09 · ET's evening list of the day before ...... check 06:30
 *   morning    Perfume Center 07:11 · ET sales@ 07:27 · Euro 07:36 · Jizan 08:36 · Fragsense 09:24 .... check 09:30
 *   late am    Lux 10:34 · Perfumora 11:06 · Parlux/QFG 11:09 · HAZ 11:14 · United 11:26 ............ check 12:30
 *   afternoon  Sushmaa 15:23 · Sanya 15:49 · B&S 16:05 ............................................. check 17:00
 *   evening    ET etperfume@ 21:11 (Saturdays too) · Mod up to 20:42 ................................. check 21:45
 * Monday–Saturday at all five; Sunday once at 21:45.
 */
let initialized = false;
export const PERFUME_MAIL_CRON_EXPRESSIONS = ["30 6 * * 1-6", "30 9 * * 1-6", "30 12 * * 1-6", "0 17 * * 1-6", "45 21 * * *"] as const;
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

  for (const expr of PERFUME_MAIL_CRON_EXPRESSIONS) {
    cron.schedule(
      expr,
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
  }

  app.log.info("Perfume mail price-list cron scheduled (Mon–Sat 06:30 09:30 12:30 17:00 21:45, Sun 21:45 America/Chicago)");
}
