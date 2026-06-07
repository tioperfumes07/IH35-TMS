/**
 * GAP-61 / CAP-11 — Fuel fraud detector worker.
 * Runs every 15 minutes over recent fuel transactions.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { dispatchCriticalFuelFraudAlerts } from "../integrations/fuel/fraud-detector/alerter.service.js";
import {
  evaluateTransactionRules,
  insertFraudAlerts,
} from "../integrations/fuel/fraud-detector/rules.service.js";

let initialized = false;

const CRON_EXPRESSION = "*/15 * * * *";
const CRON_TZ = "America/Chicago";
const CRON_NAME = "fuel.fraud_detector_worker";

export type FuelFraudDetectorTickSummary = {
  companies_processed: number;
  transactions_scanned: number;
  alerts_created: number;
  critical_notifications: number;
};

export async function processCompanyFuelFraudDetection(
  client: {
    query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  operatingCompanyId: string
): Promise<{ transactions_scanned: number; alerts_created: number; critical_notifications: number }> {
  const txns = await client.query<Record<string, unknown>>(
    `
      SELECT
        ft.id::text AS id,
        ft.operating_company_id::text AS operating_company_id,
        ft.unit_id::text AS unit_id,
        ft.driver_id::text AS driver_id,
        ft.load_id::text AS load_id,
        ft.transaction_at::text AS transaction_at,
        ft.gallons::float8 AS gallons,
        ft.location_lat::float8 AS location_lat,
        ft.location_lng::float8 AS location_lng,
        ft.location_city,
        ft.location_state
      FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid
        AND ft.archived_at IS NULL
        AND ft.transaction_at >= now() - interval '7 days'
        AND NOT EXISTS (
          SELECT 1
          FROM fuel.fraud_alerts fa
          WHERE fa.operating_company_id = ft.operating_company_id
            AND fa.fuel_transaction_uuid = ft.id
        )
      ORDER BY ft.transaction_at DESC
      LIMIT 500
    `,
    [operatingCompanyId]
  );

  let alertsCreated = 0;
  let criticalNotifications = 0;

  for (const txn of txns.rows) {
    const matches = await evaluateTransactionRules(client, txn);
    if (matches.length === 0) continue;
    const createdAlerts = await insertFraudAlerts(client, operatingCompanyId, String(txn.id), matches);
    alertsCreated += createdAlerts.length;
    const dispatch = await dispatchCriticalFuelFraudAlerts(client, operatingCompanyId, createdAlerts);
    criticalNotifications += dispatch.notifications_sent;
  }

  return {
    transactions_scanned: txns.rows.length,
    alerts_created: alertsCreated,
    critical_notifications: criticalNotifications,
  };
}

export async function runFuelFraudDetectorTick(): Promise<FuelFraudDetectorTickSummary> {
  const summary: FuelFraudDetectorTickSummary = {
    companies_processed: 0,
    transactions_scanned: 0,
    alerts_created: 0,
    critical_notifications: 0,
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
      const result = await processCompanyFuelFraudDetection(client, company.id);
      summary.companies_processed += 1;
      summary.transactions_scanned += result.transactions_scanned;
      summary.alerts_created += result.alerts_created;
      summary.critical_notifications += result.critical_notifications;
    }
  });

  return summary;
}

export function initializeFuelFraudDetectorWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_FUEL_FRAUD_DETECTOR_WORKER === "false") {
    app.log.info("Fuel fraud detector worker disabled via ENABLE_FUEL_FRAUD_DETECTOR_WORKER=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runFuelFraudDetectorTick();
          app.log.info({ summary }, "[fuel-fraud-detector-worker] tick complete");
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("Fuel fraud detector worker scheduled (every 15 minutes, America/Chicago)");
}
