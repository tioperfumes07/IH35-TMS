/**
 * ROUND 313 E-23 — keep Samsara Fuel & Energy daily (integrations.samsara_fuel_reports). 05:20 America/Chicago:
 * yesterday + today (Samsara settles a day late). First run on an empty table catches up 30 days. Read-only
 * against Samsara; writes only its own report rows.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { SamsaraClient } from "../integrations/samsara/samsara-client.js";
import { resolveSamsaraApiToken } from "../integrations/samsara/samsara-token.js";
import { ingestSamsaraFuelReports } from "../telematics/samsara-fuel-reports.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CRON_NAME = "telematics.samsara_fuel_reports";
let initialized = false;

export async function runSamsaraFuelReportsTick(operatingCompanyId = USMCA_COMPANY_ID) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const cfg = await getSamsaraConfigForCompany(client as never, operatingCompanyId);
    if (!cfg || !cfg.is_enabled) return { skipped: "samsara_not_configured" };
    const api = new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null });
    const existing = await client.query(`SELECT count(*)::int AS n FROM integrations.samsara_fuel_reports WHERE operating_company_id = $1::uuid`, [operatingCompanyId]);
    const days = Number(existing.rows[0]?.n ?? 0) === 0 ? 30 : 2;
    const result = await ingestSamsaraFuelReports(client as never, operatingCompanyId, (kind, a, b) => api.listFuelEnergyReports(kind, a, b), days);
    return { days, written: result.reduce((s, d) => s + d.written, 0), linked: result.reduce((s, d) => s + d.linked, 0) };
  });
}

export function initializeSamsaraFuelReportsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  cron.schedule("20 5 * * *", async () => {
    await wrapBackgroundJobTick(CRON_NAME, async () => {
      assertTenantContext(USMCA_COMPANY_ID, CRON_NAME);
      app.log.info(await runSamsaraFuelReportsTick(), `${CRON_NAME} complete`);
    }, app.log);
  }, { timezone: "America/Chicago", maxRandomDelay: 30_000 });
  // First boot after deploy on an empty table: catch up 30 days once (~2 min of Samsara reads) instead of waiting
  // for 05:20 -- the tick itself decides (empty -> 30 days, else 2), so a later boot only refreshes 2 days.
  setTimeout(() => {
    void wrapBackgroundJobTick(`${CRON_NAME}.boot`, async () => {
      app.log.info(await runSamsaraFuelReportsTick(), `${CRON_NAME}.boot complete`);
    }, app.log);
  }, 180_000).unref?.();
  app.log.info(`${CRON_NAME} scheduled (daily 05:20 America/Chicago)`);
}
