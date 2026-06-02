#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const job = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/lane-profitability-refresh.job.ts"), "utf8");
const scheduler = fs.readFileSync(path.join(ROOT, "apps/backend/src/scheduler/jobs.index.ts"), "utf8");

if (!job.includes('"0 2 * * *"')) {
  console.error("verify:lane-profitability-refresh-job-registered FAIL: nightly 02:00 cron missing");
  process.exit(1);
}
if (!job.includes("America/Chicago")) {
  console.error("verify:lane-profitability-refresh-job-registered FAIL: America/Chicago timezone missing");
  process.exit(1);
}
if (!scheduler.includes("initializeLaneProfitabilityRefreshCron")) {
  console.error("verify:lane-profitability-refresh-job-registered FAIL: scheduler wiring missing");
  process.exit(1);
}

console.log("verify:lane-profitability-refresh-job-registered PASS");
