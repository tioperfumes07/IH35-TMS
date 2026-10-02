import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { registerRepurchaseDueEvents } from "../factoring/repurchase-due.service.js";

// FACTORING (Faro) daily day-95 cron — ALERT ONLY. Lead ROUND 296 / 297 + owner (2026-10-02): "WHEN RECOURSE TIME
// ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY." Each morning it registers, per company, every purchased account
// open on its Repurchase Deadline as an event in the owner's decision queue (and re-asks extensions whose date has
// come). It posts NOTHING: no default-interest accrual (that is a period-close entry, with approval) and no
// chargeback. Guard: scripts/verify-day95-asks-never-recourses.mjs.

let initialized = false;
const CRON_NAME = "accounting.factoring_default_interest_cron";
const CRON_EXPRESSION = "30 5 * * *"; // 05:30 America/Chicago, before the 06:00 recon pass
const CRON_TZ = "America/Chicago";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function listActiveOperatingCompanyIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ operating_company_id: string }>(
    `
      SELECT id::text AS operating_company_id
      FROM org.companies
      WHERE is_active = true
        AND deactivated_at IS NULL
      ORDER BY id
    `
  );
  return res.rows.map((row) => row.operating_company_id);
}

export async function runFactoringDefaultInterestCronTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
  registerImpl?: typeof registerRepurchaseDueEvents;
  asOfDateIso?: string;
}) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const registerImpl = deps?.registerImpl ?? registerRepurchaseDueEvents;
  const asOf = deps?.asOfDateIso ?? companyBusinessDate();

  const companyIds = await withLuciaBypassImpl(async (client) => listActiveOperatingCompanyIds(client));

  let registered = 0;
  let reasked = 0;
  for (const operatingCompanyId of companyIds) {
    assertTenantContext(operatingCompanyId, CRON_NAME);
    const r = await withLuciaBypassImpl(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      return registerImpl(client, operatingCompanyId, asOf);
    });
    registered += r.registered;
    reasked += r.reasked;
  }
  return { company_count: companyIds.length, repurchase_due_registered: registered, repurchase_due_reasked: reasked };
}

export function initializeFactoringDefaultInterestCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.ACCOUNTING_FACTORING_INTEREST_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Factoring default-interest cron disabled via ACCOUNTING_FACTORING_INTEREST_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runFactoringDefaultInterestCronTick();
          if (summary.repurchase_due_registered > 0 || summary.repurchase_due_reasked > 0) {
            app.log.info(summary, "factoring day-95 cron registered repurchase-due events for the owner");
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Factoring day-95 repurchase-due cron scheduled (daily 05:30 America/Chicago, alert only)");
}
