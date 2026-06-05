import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { pullChartOfAccountsFromQbo } from "./chart-of-accounts-puller.js";
import { reconcileChartOfAccounts } from "./chart-of-accounts-reconciler.js";
import { pullItemsFromQbo } from "./items-puller.js";
import { reconcileItems } from "./items-reconciler.js";
import { countUnresolvedDrift, detectDriftForCompany } from "./drift-detector.js";
import { maybeFireDriftAlert } from "./sync-alerts.js";

let initialized = false;

async function pullEntityIfModuleExists(modulePath: string, exportName: string, operatingCompanyId: string) {
  try {
    const mod = (await import(modulePath)) as Record<string, (id: string) => Promise<unknown>>;
    const fn = mod[exportName];
    if (typeof fn === "function") {
      await fn(operatingCompanyId);
    }
  } catch {
    // optional puller not yet deployed (e.g. QBO-SYNC-3 customers/vendors)
  }
}

async function reconcileEntityIfModuleExists(modulePath: string, exportName: string, operatingCompanyId: string) {
  try {
    const mod = (await import(modulePath)) as Record<string, (id: string) => Promise<unknown>>;
    const fn = mod[exportName];
    if (typeof fn === "function") {
      await fn(operatingCompanyId);
    }
  } catch {
    // optional reconciler not yet deployed
  }
}

async function runScheduledSyncForCompany(operatingCompanyId: string, log?: FastifyInstance["log"]) {
  await pullChartOfAccountsFromQbo(operatingCompanyId);
  await reconcileChartOfAccounts(operatingCompanyId);

  await pullItemsFromQbo(operatingCompanyId);
  await reconcileItems(operatingCompanyId);

  await pullEntityIfModuleExists("./customers-puller.js", "pullCustomersFromQbo", operatingCompanyId);
  await reconcileEntityIfModuleExists("./customers-reconciler.js", "reconcileCustomers", operatingCompanyId);

  await pullEntityIfModuleExists("./vendors-puller.js", "pullVendorsFromQbo", operatingCompanyId);
  await reconcileEntityIfModuleExists("./vendors-reconciler.js", "reconcileVendors", operatingCompanyId);

  const driftResults = await detectDriftForCompany(operatingCompanyId);
  for (const result of driftResults) {
    const unresolved = await countUnresolvedDrift(operatingCompanyId, result.entityType);
    const alert = await maybeFireDriftAlert({
      operatingCompanyId,
      entityType: result.entityType,
      driftCount: unresolved,
    });
    log?.info(
      {
        operating_company_id: operatingCompanyId,
        entity_type: result.entityType,
        inserted: result.inserted,
        unresolved,
        alert_sent: alert.sent,
      },
      "[qbo-sync-scheduler] drift detection complete"
    );
  }
}

export async function runQboSyncSchedulerTick(log?: FastifyInstance["log"]) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    for (const company of companies.rows) {
      await runScheduledSyncForCompany(company.id, log);
    }
  });
}

export function initializeQboSyncDriftScheduler(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.QBO_DRIFT_SYNC_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("QBO drift sync scheduler disabled (QBO_DRIFT_SYNC_CRON_ENABLED=false)");
    return;
  }

  cron.schedule(
    "0 */4 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "qbo_sync.drift_scheduler",
        async () => {
          app.log.info("QBO drift sync scheduler tick (every 4h, America/Chicago)");
          await runQboSyncSchedulerTick(app.log);
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("QBO drift sync scheduler initialized (every 4h America/Chicago)");
}
