import type { FastifyInstance } from "fastify";
import { initializeCbpWaitTimesRefreshCron } from "../border-crossing/cbp-wait-times-refresh.job.js";
import { initializeComplianceReminderCron } from "../compliance/compliance-reminder.job.js";
import { initializeDeadheadRefreshCron } from "../reports/deadhead-refresh.job.js";
import { initializeLaneProfitabilityRefreshCron } from "../reports/lane-profitability-refresh.job.js";

export function registerComplianceSchedulerJobs(app: FastifyInstance) {
  initializeComplianceReminderCron(app);
  initializeDeadheadRefreshCron(app);
  initializeLaneProfitabilityRefreshCron(app);
  initializeCbpWaitTimesRefreshCron(app);
}
