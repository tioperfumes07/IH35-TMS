import type { FastifyInstance } from "fastify";
import { initializeComplianceReminderCron } from "../compliance/compliance-reminder.job.js";

export function registerComplianceSchedulerJobs(app: FastifyInstance) {
  initializeComplianceReminderCron(app);
}
