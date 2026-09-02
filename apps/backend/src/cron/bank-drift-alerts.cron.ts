// GO-20 slice A (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — "A detector that runs after every
// reconciliation finalize [see apps/backend/src/banking/p7-wave2.routes.ts's finalize route] and
// once nightly." This is the nightly leg.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { runDriftDetectors } from "../banking/drift-alerts.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const CRON_NAME = "banking.reconciliation_drift_alerts_nightly";
const CRON_EXPRESSION = "40 5 * * *";
const CRON_TZ = "America/Chicago";

let initialized = false;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function listActiveOperatingCompanyIds(client: DbClient): Promise<string[]> {
  const result = await client.query<{ operating_company_id: string }>(
    `SELECT id::text AS operating_company_id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
  );
  return result.rows.map((row) => row.operating_company_id);
}

export async function runBankDriftAlertsCronTick(deps?: { withLuciaBypassImpl?: typeof withLuciaBypass }) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const companyIds = await withLuciaBypassImpl(async (client) => listActiveOperatingCompanyIds(client));
  const summary = { company_count: companyIds.length, opened: 0, closed: 0 };

  for (const operatingCompanyId of companyIds) {
    assertTenantContext(operatingCompanyId, CRON_NAME);
    const result = await withLuciaBypassImpl(async (client) => runDriftDetectors(client, operatingCompanyId));
    summary.opened += result.session_variance.opened + result.live_balance.opened + result.stale_feed.opened;
    summary.closed += result.session_variance.closed + result.live_balance.closed + result.stale_feed.closed;
  }

  return summary;
}

export function initializeBankDriftAlertsCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runBankDriftAlertsCronTick();
          app.log.info(summary, "bank drift alerts nightly cron completed");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */,
      timezone: CRON_TZ,
    }
  );

  app.log.info("Bank drift alerts cron scheduled (nightly 05:40 America/Chicago)");
}
