import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { withLuciaBypass } from "../auth/db.js";
import { queuePayment } from "./settlement-payment.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

export const DRIVER_SETTLEMENT_AUTO_PAY_JOB = "driver_finance.settlement_auto_pay_cron";

const CRON_EXPRESSION = "0 6 * * 5";
const CRON_TZ = "America/Chicago";
const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

let initialized = false;

type AutoPayCandidate = {
  settlement_id: string;
  operating_company_id: string;
  driver_id: string;
};

async function listAutoPayCandidatesForCompany(operatingCompanyId: string): Promise<AutoPayCandidate[]> {
  assertTenantContext(operatingCompanyId, DRIVER_SETTLEMENT_AUTO_PAY_JOB);
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<AutoPayCandidate>(
      `
        SELECT s.id AS settlement_id, s.operating_company_id, s.driver_id
        FROM driver_finance.driver_settlements s
        JOIN mdata.drivers d ON d.id = s.driver_id
        WHERE s.operating_company_id = $1
          AND d.settlement_auto_pay_enabled = true
          AND s.status IN ('locked', 'final')
          AND COALESCE(s.payment_state, 'unpaid') = 'unpaid'
        ORDER BY s.updated_at ASC
        LIMIT 200
      `,
      [operatingCompanyId]
    );
    return res.rows;
  });
}

async function listActiveOperatingCompanyIds() {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
        ORDER BY id
      `
    );
    return res.rows.map((row) => row.id);
  });
}

export function initializeDriverSettlementAutoPayCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON ?? "true").trim() === "false") {
    app.log.info("Driver settlement auto-pay cron disabled via ENABLE_DRIVER_SETTLEMENT_AUTO_PAY_CRON=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(DRIVER_SETTLEMENT_AUTO_PAY_JOB, async () => {
        const companyIds = await listActiveOperatingCompanyIds();
        let queued = 0;
        let candidates = 0;
        for (const operatingCompanyId of companyIds) {
          const rows = await listAutoPayCandidatesForCompany(operatingCompanyId);
          candidates += rows.length;
          for (const row of rows) {
            try {
              await queuePayment(row.settlement_id, SYSTEM_USER_ID);
              await withLuciaBypass(async (client) => {
                await appendCrudAudit(
                  client,
                  SYSTEM_USER_ID,
                  "driver_pay.settlement.auto_pay_queued",
                  {
                    resource_type: "driver_finance.driver_settlements",
                    resource_id: row.settlement_id,
                    operating_company_id: row.operating_company_id,
                    driver_id: row.driver_id,
                  },
                  "info",
                  "P5-T5-AUTO-PAY"
                );
              });
              queued += 1;
            } catch (error) {
              app.log.warn(
                { err: error, settlementId: row.settlement_id, driverId: row.driver_id },
                "driver settlement auto-pay skipped"
              );
            }
          }
        }
        app.log.info({ candidates, queued, companies: companyIds.length }, "driver settlement auto-pay cron tick");
      });
    },
    { timezone: CRON_TZ }
  );
  app.log.info("Driver settlement auto-pay cron scheduled (Friday 06:00 America/Chicago)");
}
