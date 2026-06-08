/**
 * GAP-56 / CAP-4 — Auto status switch worker.
 * Runs every 5 minutes over active loads with live GPS.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import {
  listActiveLoadsForAutoStatus,
  processDriftForLoad,
  recordPositionSnapshotsForCompany,
} from "../integrations/samsara/auto-status-switch/detector.service.js";

let initialized = false;

const CRON_EXPRESSION = "*/5 * * * *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "integrations.auto_status_switch_worker";

export type AutoStatusSwitchTickSummary = {
  companies_processed: number;
  snapshots_recorded: number;
  loads_scanned: number;
  auto_applied: number;
  issues_flagged: number;
  skipped: number;
};

export async function runAutoStatusSwitchTick(): Promise<AutoStatusSwitchTickSummary> {
  const summary: AutoStatusSwitchTickSummary = {
    companies_processed: 0,
    snapshots_recorded: 0,
    loads_scanned: 0,
    auto_applied: 0,
    issues_flagged: 0,
    skipped: 0,
  };

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
        ORDER BY id
      `
    );

    for (const company of companies.rows) {
      assertTenantContext(company.id, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);

      summary.snapshots_recorded += await recordPositionSnapshotsForCompany(client, company.id);
      const loadIds = await listActiveLoadsForAutoStatus(client, company.id);

      for (const loadUuid of loadIds) {
        summary.loads_scanned += 1;
        const processed = await processDriftForLoad(client, company.id, loadUuid);
        if (!processed.drift) continue;
        if (processed.drift.action === "flag_intransit_issue") {
          if (processed.result?.flagged) summary.issues_flagged += 1;
          else summary.skipped += 1;
        } else if (processed.result?.applied) {
          summary.auto_applied += 1;
        } else {
          summary.skipped += 1;
        }
      }

      summary.companies_processed += 1;
    }
  });

  return summary;
}

export function initializeAutoStatusSwitchWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_AUTO_STATUS_SWITCH_WORKER === "false") {
    app.log.info("Auto status switch worker disabled via ENABLE_AUTO_STATUS_SWITCH_WORKER=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runAutoStatusSwitchTick();
          app.log.info({ summary }, "[auto-status-switch-worker] tick complete");
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("Auto status switch worker scheduled (every 5 minutes, America/Chicago)");
}
