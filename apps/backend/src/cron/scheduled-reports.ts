import type { FastifyBaseLogger } from "fastify";
import cron from "node-cron";
import { loadEnabledSchedules, runScheduledReport, type ScheduledReportId } from "../reports/scheduled-report-runner.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

const TIMEZONE = "America/Chicago";

type CronDefinition = {
  reportId: ScheduledReportId;
  expression: string;
};

const DEFINITIONS: CronDefinition[] = [
  { reportId: "dispatch-board", expression: "0 7 * * *" },
  { reportId: "cash-position-ar", expression: "0 18 * * *" },
  { reportId: "profit-per-truck-week", expression: "0 8 * * 1" },
  { reportId: "settlements-ready", expression: "0 17 * * 5" },
  { reportId: "maintenance-open-wos", expression: "0 8 * * 1" },
  // First day of quarter at 08:00 CT (Jan/Apr/Jul/Oct).
  { reportId: "ifta-quarterly-state", expression: "0 8 1 1,4,7,10 *" },
];

let initialized = false;

export function initializeScheduledReportsCron(logger: FastifyBaseLogger) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_SCHEDULED_REPORT_CRON === "false") {
    logger.info("Scheduled reports cron disabled via ENABLE_SCHEDULED_REPORT_CRON=false");
    return;
  }

  for (const definition of DEFINITIONS) {
    cron.schedule(
      definition.expression,
      async () => {
        try {
          const schedules = await loadEnabledSchedules(definition.reportId);
          for (const schedule of schedules) {
            assertTenantContext(schedule.operating_company_id, "scheduled.reports_cron");
            try {
              await runScheduledReport({
                reportId: definition.reportId,
                operatingCompanyId: schedule.operating_company_id,
                recipientRoles: schedule.recipient_roles ?? [],
                trigger: "scheduled",
              });
            } catch (error) {
              logger.error({ err: error, reportId: definition.reportId }, "Scheduled report run failed");
            }
          }
        } catch (error) {
          logger.error({ err: error, reportId: definition.reportId }, "Scheduled report fetch failed");
        }
      },
      { timezone: TIMEZONE }
    );
  }

  logger.info("Scheduled reports cron initialized: 6 jobs registered");
}

