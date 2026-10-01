/**
 * GAP-61 / CAP-11 — Fuel fraud detector.
 *
 * ROUND 306 E-21: runs ONCE PER FUEL-INGEST COMPLETION (fuel/fuel-ingest-hooks.ts), not every 15
 * minutes — 672 runs a week re-scanned the same rows. Only real motor-fuel purchases are scanned
 * (fuel/fuel-purchase-eligibility.ts — DEF charges and gallon-less rows are charges, not purchases),
 * pump-time rules are skipped on date-only rows, and a purchase is a FINDING only when two rules
 * with independent evidence agree (fraud-detector/signal-independence.ts). One rule alone is
 * recorded as a 'warn' suspicion and never dispatches a critical notification.
 * Still behind ENABLE_FUEL_FRAUD_DETECTOR_WORKER (default OFF): it writes fuel.fraud_alerts.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { recordBackgroundJobDisabled } from "../lib/background-jobs.js";
import { dispatchCriticalFuelFraudAlerts } from "../integrations/fuel/fraud-detector/alerter.service.js";
import {
  evaluateTransactionRules,
  insertFraudAlerts,
} from "../integrations/fuel/fraud-detector/rules.service.js";
import { classifyFraudMatches } from "../integrations/fuel/fraud-detector/signal-independence.js";
import { fuelPurchaseIneligibleReason } from "../fuel/fuel-purchase-eligibility.js";

let initialized = false;

const CRON_NAME = "fuel.fraud_detector_worker";

export type FuelFraudDetectorTickSummary = {
  companies_processed: number;
  transactions_scanned: number;
  alerts_created: number;
  critical_notifications: number;
  findings: number;
  suspicions: number;
  skipped_not_purchases: number;
};

export async function processCompanyFuelFraudDetection(
  client: {
    query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
  },
  operatingCompanyId: string
): Promise<{ transactions_scanned: number; alerts_created: number; critical_notifications: number; findings: number; suspicions: number; skipped_not_purchases: number }> {
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
        ft.location_state,
        ft.fuel_type,
        (SELECT count(*) FROM fuel.fuel_transactions x
          WHERE x.operating_company_id = ft.operating_company_id AND x.transaction_at = ft.transaction_at
            AND x.voided_at IS NULL)::int AS same_stamp_count
      FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid
        AND ft.archived_at IS NULL
        AND ft.voided_at IS NULL
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
  let findings = 0;
  let suspicions = 0;
  let skippedNotPurchases = 0;

  for (const txn of txns.rows) {
    const eligibility = {
      fuel_type: (txn.fuel_type as string | null) ?? null,
      gallons: (txn.gallons as number | null) ?? null,
      transaction_at: String(txn.transaction_at),
      voided_at: null,
      same_stamp_count: Number(txn.same_stamp_count ?? 1),
    };
    const reason = fuelPurchaseIneligibleReason(eligibility, { requirePumpTime: false });
    if (reason) {
      skippedNotPurchases += 1;
      continue;
    }
    const dateOnly = fuelPurchaseIneligibleReason(eligibility, { requirePumpTime: true }) === "date_only_precision";
    const verdict = classifyFraudMatches(await evaluateTransactionRules(client, txn), { dateOnly });
    if (verdict.classification === "none") continue;
    if (verdict.classification === "finding") findings += 1;
    else suspicions += 1;
    const createdAlerts = await insertFraudAlerts(client, operatingCompanyId, String(txn.id), verdict.matches);
    alertsCreated += createdAlerts.length;
    if (verdict.classification === "finding") {
      const dispatch = await dispatchCriticalFuelFraudAlerts(client, operatingCompanyId, createdAlerts);
      criticalNotifications += dispatch.notifications_sent;
    }
  }

  return {
    transactions_scanned: txns.rows.length,
    alerts_created: alertsCreated,
    critical_notifications: criticalNotifications,
    findings,
    suspicions,
    skipped_not_purchases: skippedNotPurchases,
  };
}

export function fuelFraudDetectorEnabled(): boolean {
  return (process.env.ENABLE_FUEL_FRAUD_DETECTOR_WORKER ?? "false").trim() === "true";
}

/** One pass for the given companies (or all active ones). Called by fuel/fuel-ingest-hooks.ts. */
export async function runFuelFraudDetectorTick(companyIds?: string[]): Promise<FuelFraudDetectorTickSummary> {
  const summary: FuelFraudDetectorTickSummary = {
    companies_processed: 0,
    transactions_scanned: 0,
    alerts_created: 0,
    critical_notifications: 0,
    findings: 0,
    suspicions: 0,
    skipped_not_purchases: 0,
  };

  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM org.companies
        WHERE is_active = true
          AND deactivated_at IS NULL
          AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
        ORDER BY id
      `,
      [companyIds ?? null]
    );

    for (const company of companies.rows) {
      assertTenantContext(company.id, CRON_NAME);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      const result = await processCompanyFuelFraudDetection(client, company.id);
      summary.companies_processed += 1;
      summary.transactions_scanned += result.transactions_scanned;
      summary.alerts_created += result.alerts_created;
      summary.critical_notifications += result.critical_notifications;
      summary.findings += result.findings;
      summary.suspicions += result.suspicions;
      summary.skipped_not_purchases += result.skipped_not_purchases;
    }
  });

  return summary;
}

export function initializeFuelFraudDetectorWorker(app: FastifyInstance): void {
  if (initialized) return;
  initialized = true;
  if (!fuelFraudDetectorEnabled()) {
    app.log.info(
      "Fuel fraud detector disabled (default OFF; set ENABLE_FUEL_FRAUD_DETECTOR_WORKER=true to enable)"
    );
    // GO-0017-L3: an early return is an outcome, not an absence — record it so
    // _system.background_jobs stays fresh (refreshed on every boot) instead of frozen forever.
    recordBackgroundJobDisabled(CRON_NAME).catch((err) => app.log.warn({ err }, `[background-job:${CRON_NAME}] failed to record disabled-outcome`));
    return;
  }
  // ROUND 306 E-21: no schedule. The detector runs from fuel/fuel-ingest-hooks.ts when a fuel
  // ingest completes — the only time there is anything new to look at.
  app.log.info("Fuel fraud detector armed — runs on fuel-ingest completion, not on a timer");
}

export const FUEL_FRAUD_DETECTOR_JOB = CRON_NAME;
