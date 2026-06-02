import type { FastifyInstance } from "fastify";
import { initializeComplianceReminderCron } from "../compliance/compliance-reminder.job.js";
import { initializeDeadheadRefreshCron } from "../reports/deadhead-refresh.job.js";

export function registerComplianceSchedulerJobs(app: FastifyInstance) {
  initializeComplianceReminderCron(app);
  initializeDeadheadRefreshCron(app);
}
