import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { createNotification, listCompanyNotifyUserIds } from "../notifications/notification.service.js";

const CRON_NAME = "insurance.monthly_report_by_5th";
const CRON_TZ = "America/Chicago";
let initialized = false;

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type CompanyRow = { operating_company_id: string };

type ReportRow = {
  total_units: number;
  covered_units: number;
  uncovered_units: number;
  total_trailers: number;
  covered_trailers: number;
  uncovered_trailers: number;
  total_drivers: number;
  covered_drivers: number;
  uncovered_drivers: number;
  total_insured_value: number | null;
  total_premium: number | null;
};

/**
 * Gather insurance coverage counts for a single operating company.
 * Units, trailers, drivers, and aggregate insured values.
 */
async function gatherReportData(client: DbClient, operatingCompanyId: string): Promise<ReportRow> {
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);

  // Units with active auto policy coverage
  const unitCounts = await client.query<{ total: number; covered: number }>(
    `SELECT
       count(DISTINCT u.unit_id)::int AS total,
       count(DISTINCT pu.unit_id)::int AS covered
     FROM mdata.units u
     LEFT JOIN insurance.policy_unit pu
       ON pu.unit_id = u.unit_id
       AND pu.removed_at IS NULL
     LEFT JOIN insurance.policy p
       ON p.policy_id = pu.policy_id
       AND p.status = 'active'
       AND p.tenant_id = $1::uuid
     WHERE u.deactivated_at IS NULL`
  );

  // Trailers with active auto policy coverage
  const trailerCounts = await client.query<{ total: number; covered: number }>(
    `SELECT
       count(DISTINCT t.trailer_id)::int AS total,
       count(DISTINCT pt.trailer_id)::int AS covered
     FROM mdata.trailers t
     LEFT JOIN insurance.policy_trailer pt
       ON pt.trailer_id = t.trailer_id
       AND pt.removed_at IS NULL
     LEFT JOIN insurance.policy p
       ON p.policy_id = pt.policy_id
       AND p.status = 'active'
       AND p.tenant_id = $1::uuid
     WHERE t.deactivated_at IS NULL`
  );

  // Drivers with active auto policy coverage
  const driverCounts = await client.query<{ total: number; covered: number }>(
    `SELECT
       count(DISTINCT d.driver_id)::int AS total,
       count(DISTINCT pd.driver_id)::int AS covered
     FROM mdata.drivers d
     LEFT JOIN insurance.policy_driver pd
       ON pd.driver_id = d.driver_id
       AND pd.removed_at IS NULL
     LEFT JOIN insurance.policy p
       ON p.policy_id = pd.policy_id
       AND p.status = 'active'
       AND p.tenant_id = $1::uuid
     WHERE d.deactivated_at IS NULL`
  );

  // Aggregate insured value and premium from active policies
  const valueRow = await client.query<{ total_insured_value: number | null; total_premium: number | null }>(
    `SELECT
       COALESCE(sum(p.coverage_limit), 0)::numeric AS total_insured_value,
       COALESCE(sum(p.premium_amount), 0)::numeric AS total_premium
     FROM insurance.policy p
     WHERE p.tenant_id = $1::uuid
       AND p.status = 'active'`
  );

  const units = unitCounts.rows[0] ?? { total: 0, covered: 0 };
  const trailers = trailerCounts.rows[0] ?? { total: 0, covered: 0 };
  const drivers = driverCounts.rows[0] ?? { total: 0, covered: 0 };
  const values = valueRow.rows[0] ?? { total_insured_value: 0, total_premium: 0 };

  return {
    total_units: units.total,
    covered_units: units.covered,
    uncovered_units: units.total - units.covered,
    total_trailers: trailers.total,
    covered_trailers: trailers.covered,
    uncovered_trailers: trailers.total - trailers.covered,
    total_drivers: drivers.total,
    covered_drivers: drivers.covered,
    uncovered_drivers: drivers.total - drivers.covered,
    total_insured_value: values.total_insured_value,
    total_premium: values.total_premium,
  };
}

/**
 * Create alarm notifications for a company's insurance report.
 * ALARMS on any coverage gap — never fails silently.
 */
async function alarmReport(
  client: DbClient,
  operatingCompanyId: string,
  report: ReportRow
): Promise<void> {
  const recipientUserIds = await listCompanyNotifyUserIds(client, operatingCompanyId, [
    "Owner",
    "Administrator",
    "Safety",
  ]);

  const hasGaps =
    report.uncovered_units > 0 ||
    report.uncovered_trailers > 0 ||
    report.uncovered_drivers > 0;

  const severity = hasGaps ? "critical" : "info";
  const title = hasGaps
    ? `Insurance monthly report — ${report.uncovered_units} uncovered units, ${report.uncovered_trailers} trailers, ${report.uncovered_drivers} drivers`
    : `Insurance monthly report — all assets covered`;

  const body = [
    `Units: ${report.covered_units}/${report.total_units} covered (${report.uncovered_units} gaps)`,
    `Trailers: ${report.covered_trailers}/${report.total_trailers} covered (${report.uncovered_trailers} gaps)`,
    `Drivers: ${report.covered_drivers}/${report.total_drivers} covered (${report.uncovered_drivers} gaps)`,
    `Total insured value: $${Number(report.total_insured_value ?? 0).toLocaleString()}`,
    `Total premium: $${Number(report.total_premium ?? 0).toLocaleString()}`,
  ].join("\n");

  for (const userId of recipientUserIds) {
    await createNotification(
      {
        operating_company_id: operatingCompanyId,
        user_id: userId,
        type: "insurance_monthly_report",
        severity,
        title,
        body,
        action_link: "/safety/insurance",
        entity_type: "insurance",
        entity_id: operatingCompanyId,
        source_block: "insurance-monthly-report-by-5th",
      },
      client
    );
  }
}

export async function runInsuranceMonthlyReportTick(app: FastifyInstance) {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<CompanyRow>(
      `SELECT DISTINCT operating_company_id::text AS operating_company_id
       FROM mdata.drivers
       WHERE deactivated_at IS NULL`
    );

    for (const row of companies.rows) {
      const operatingCompanyId = String(row.operating_company_id ?? "");
      if (!operatingCompanyId) continue;

      try {
        const report = await gatherReportData(client, operatingCompanyId);
        await alarmReport(client, operatingCompanyId, report);
        app.log.info(
          { operatingCompanyId, ...report },
          `[${CRON_NAME}] report generated and alarmed`
        );
      } catch (err) {
        // A missed report is a coverage argument — ALARM, never fail silently.
        app.log.error({ operatingCompanyId, err }, `[${CRON_NAME}] FAILED to generate report — alarming`);

        const recipientUserIds = await listCompanyNotifyUserIds(client, operatingCompanyId, [
          "Owner",
          "Administrator",
          "Safety",
        ]);
        for (const userId of recipientUserIds) {
          await createNotification(
            {
              operating_company_id: operatingCompanyId,
              user_id: userId,
              type: "insurance_monthly_report_error",
              severity: "critical",
              title: "Insurance monthly report FAILED — manual review required",
              body: `The monthly insurance report for ${operatingCompanyId} failed to generate. Error: ${err instanceof Error ? err.message : String(err)}. Manual review required — do not ignore.`,
              action_link: "/safety/insurance",
              entity_type: "insurance",
              entity_id: operatingCompanyId,
              source_block: "insurance-monthly-report-by-5th",
            },
            client
          );
        }
      }
    }
  });
}

export function initializeInsuranceMonthlyReportCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_INSURANCE_MONTHLY_REPORT === "false") {
    app.log.info("Insurance monthly report disabled via ENABLE_INSURANCE_MONTHLY_REPORT=false");
    return;
  }

  // Run on the 5th of every month at 07:00 America/Chicago.
  // The 5th gives a few days grace after month-end for data to settle.
  cron.schedule(
    "0 7 5 * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          await runInsuranceMonthlyReportTick(app);
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000,
      timezone: CRON_TZ,
    }
  );

  app.log.info(`Insurance monthly report scheduled (5th of month 07:00 ${CRON_TZ})`);
}
