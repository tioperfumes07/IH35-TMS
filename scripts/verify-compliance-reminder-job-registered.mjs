#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const job = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/compliance-reminder.job.ts"), "utf8");
const scheduler = fs.readFileSync(path.join(ROOT, "apps/backend/src/scheduler/jobs.index.ts"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/compliance.routes.ts"), "utf8");
if (!job.includes("initializeComplianceReminderCron") || !job.includes("cron.schedule")) {
  console.error("verify:compliance-reminder-job-registered FAIL: cron job not defined");
  process.exit(1);
}
if (!scheduler.includes("initializeComplianceReminderCron")) {
  console.error("verify:compliance-reminder-job-registered FAIL: jobs.index.ts must register reminder cron");
  process.exit(1);
}
if (!routes.includes("registerComplianceSchedulerJobs")) {
  console.error("verify:compliance-reminder-job-registered FAIL: compliance.routes must call scheduler registration");
  process.exit(1);
}
console.log("verify:compliance-reminder-job-registered PASS");
