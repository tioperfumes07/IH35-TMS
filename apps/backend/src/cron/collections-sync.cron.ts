import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { syncCollectionTasks } from "../accounting/collections.service.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

let initialized = false;
const CRON_NAME = "accounting.collections_sync_cron";
const CRON_EXPRESSION = "0 4 * * *";
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

export async function runCollectionsSyncCronTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
  syncCollectionTasksImpl?: typeof syncCollectionTasks;
  assertTenantContextImpl?: typeof assertTenantContext;
}) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const syncCollectionTasksImpl = deps?.syncCollectionTasksImpl ?? syncCollectionTasks;
  const assertTenantContextImpl: typeof assertTenantContext = deps?.assertTenantContextImpl ?? assertTenantContext;

  return withLuciaBypassImpl(async (client) => {
    const companyIds = await listActiveOperatingCompanyIds(client);
    for (const operatingCompanyId of companyIds) {
      assertTenantContextImpl(operatingCompanyId, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      await syncCollectionTasksImpl({
        operatingCompanyId,
        actorUserId: null,
      });
    }
    return { company_count: companyIds.length };
  });
}

export function initializeCollectionsSyncCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.ACCOUNTING_COLLECTIONS_SYNC_ENABLED ?? "true").trim() === "false") {
    app.log.info("Collections sync cron disabled via ACCOUNTING_COLLECTIONS_SYNC_ENABLED=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await runCollectionsSyncCronTick();
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("Collections sync cron scheduled (daily 04:00 America/Chicago)");
}
