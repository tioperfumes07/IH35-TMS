import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { indexDriversForCompany, indexLoadsForCompany } from "../search/universal/indexer.service.js";

let initialized = false;

export async function runSearchIndexerIncrementalTick() {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ operating_company_id: string }>(
      `
        SELECT DISTINCT operating_company_id::text AS operating_company_id
        FROM dispatch.loads
        WHERE operating_company_id IS NOT NULL
      `
    );

    for (const row of companies.rows) {
      const operatingCompanyId = String(row.operating_company_id ?? "");
      if (!operatingCompanyId) continue;
      assertTenantContext(operatingCompanyId, "search.indexer_incremental");
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await indexLoadsForCompany(client, operatingCompanyId);
      await indexDriversForCompany(client, operatingCompanyId);
    }
  });
}

export function initializeSearchIndexerIncremental(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_SEARCH_INDEXER_INCREMENTAL === "false") {
    app.log.info("Search indexer incremental disabled via ENABLE_SEARCH_INDEXER_INCREMENTAL=false");
    return;
  }

  cron.schedule(
    "0 3 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "search.indexer_incremental",
        async () => {
          await runSearchIndexerIncrementalTick();
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );
}
