import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import {
  accrueDefaultInterestForCompany,
  triggerDay95RecourseForCompany,
} from "../accounting/factoring-posting/default-interest.service.js";

// FACTORING (Faro) daily default-interest accrual + day-95 auto-recourse cron. FINANCIAL / §1.4: every post
// is gated behind FACTORING_GL_POSTING_ENABLED (default OFF, TRANSP only) inside the engine — so with the
// flag OFF this cron runs but posts NOTHING (pure no-op). Runs once daily, early, in Central time. Order:
// ACCRUE first (bring every outstanding advance's compounding interest current), THEN recourse (so a day-95
// recourse reads a fully-accrued liability). Both motions are idempotent per (advance, day) / per advance.

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
  accrueImpl?: typeof accrueDefaultInterestForCompany;
  recourseImpl?: typeof triggerDay95RecourseForCompany;
  asOfDateIso?: string;
}) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const accrueImpl = deps?.accrueImpl ?? accrueDefaultInterestForCompany;
  const recourseImpl = deps?.recourseImpl ?? triggerDay95RecourseForCompany;

  const companyIds = await withLuciaBypassImpl(async (client) => listActiveOperatingCompanyIds(client));

  let accrualsPosted = 0;
  let recoursed = 0;
  for (const operatingCompanyId of companyIds) {
    assertTenantContext(operatingCompanyId, CRON_NAME);
    const accrual = await accrueImpl({ operating_company_id: operatingCompanyId, as_of_date_iso: deps?.asOfDateIso });
    accrualsPosted += accrual.accruals_posted;
    const recourse = await recourseImpl({ operating_company_id: operatingCompanyId, as_of_date_iso: deps?.asOfDateIso });
    recoursed += recourse.recoursed;
  }
  return { company_count: companyIds.length, accruals_posted: accrualsPosted, recoursed };
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
          if (summary.accruals_posted > 0 || summary.recoursed > 0) {
            app.log.info(summary, "factoring default-interest cron posted accruals / recourses");
          }
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Factoring default-interest cron scheduled (daily 05:30 America/Chicago)");
}
