import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { listActiveOperatingCompanyIds } from "./depreciation-autopost.cron.js";
import { getDailyPrediction } from "../cash-flow/cash-flow.service.js";

// CASH-FLOW-ACTUAL-VS-PROJECTED-INCOME-STRUCTURALLY-ALWAYS-ZERO — captures each company's daily
// income prediction once, early, before the day's loads have had a chance to deliver/invoice/pay
// (the exact lifecycle progression that makes the LIVE query permanently retreat to $0 for any
// past date). getActualVsProjected() reads this snapshot for dates strictly before "today"; see
// db/migrations/202613180000_cash_flow_projection_snapshots.sql for the schema + full rationale.

const CRON_NAME = "cash_flow.projection_snapshot";
const CRON_EXPRESSION = "10 6 * * *"; // daily 06:10 America/Chicago — after the AM bank-recon cadence
const CRON_TZ = "America/Chicago";
const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-0000-0000-000000000001";

let initialized = false;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function insertCashFlowProjectionSnapshot(
  client: DbClient,
  args: {
    operating_company_id: string;
    prediction_date: string;
    projected_income_cents: number;
    cash_follows_eta: boolean;
  }
): Promise<void> {
  // ON CONFLICT DO NOTHING — a snapshot is captured once and never rewritten. A cron re-run for a
  // date already snapshotted (or a stray manual invocation) is a silent no-op, never an overwrite.
  await client.query(
    `
      INSERT INTO forecast.cash_flow_projection_snapshots
        (operating_company_id, prediction_date, projected_income_cents, cash_follows_eta)
      VALUES ($1::uuid, $2::date, $3, $4)
      ON CONFLICT (operating_company_id, prediction_date) DO NOTHING
    `,
    [args.operating_company_id, args.prediction_date, args.projected_income_cents, args.cash_follows_eta]
  );
}

export async function runCashFlowProjectionSnapshotCronTick(deps?: {
  withLuciaBypassImpl?: typeof withLuciaBypass;
  getDailyPredictionImpl?: typeof getDailyPrediction;
  predictionDate?: string;
}) {
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const getDailyPredictionImpl = deps?.getDailyPredictionImpl ?? getDailyPrediction;
  const predictionDate = deps?.predictionDate ?? companyBusinessDate();

  const companyIds = await withLuciaBypassImpl(async (client) => listActiveOperatingCompanyIds(client));
  const summary = { company_count: companyIds.length, captured: 0, error: 0 };

  for (const operatingCompanyId of companyIds) {
    assertTenantContext(operatingCompanyId, CRON_NAME);
    try {
      const { cashFollowsEta, incomeCents } = await withLuciaBypassImpl(async (client) => {
        const flagEnabled = await isEnabled(client as never, "CASH_FOLLOWS_ETA_ENABLED", {
          operating_company_id: operatingCompanyId,
          user_uuid: SYSTEM_ACTOR_ID,
        });
        const prediction = await getDailyPredictionImpl(client, operatingCompanyId, predictionDate, flagEnabled);
        return { cashFollowsEta: flagEnabled, incomeCents: prediction.income_subtotal_cents };
      });

      await withLuciaBypassImpl(async (client) =>
        insertCashFlowProjectionSnapshot(client, {
          operating_company_id: operatingCompanyId,
          prediction_date: predictionDate,
          projected_income_cents: incomeCents,
          cash_follows_eta: cashFollowsEta,
        })
      );
      summary.captured += 1;
    } catch {
      summary.error += 1;
    }
  }

  return summary;
}

export function initializeCashFlowProjectionSnapshotCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const summary = await runCashFlowProjectionSnapshotCronTick();
          app.log.info(summary, "cash-flow projection snapshot cron completed");
        },
        app.log
      );
    },
    { maxRandomDelay: 20000 /* cron-stagger — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: CRON_TZ }
  );

  app.log.info("Cash-flow projection snapshot cron scheduled (daily 06:10 America/Chicago)");
}
