#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cronFile = path.join(ROOT, "apps/backend/src/cron/plaid-daily-sync.ts");
const syncStateFile = path.join(ROOT, "apps/backend/src/integrations/plaid/plaid-sync-state.ts");
const indexFile = path.join(ROOT, "apps/backend/src/index.ts");

function fail(message) {
  console.error(`verify:plaid-cron-registered FAIL: ${message}`);
  process.exit(1);
}

for (const target of [cronFile, syncStateFile, indexFile]) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
}

const cron = fs.readFileSync(cronFile, "utf8");
const syncState = fs.readFileSync(syncStateFile, "utf8");
const index = fs.readFileSync(indexFile, "utf8");

if (!cron.includes("initializePlaidDailySyncCron")) {
  fail("plaid-daily-sync.ts must export initializePlaidDailySyncCron");
}
if (!cron.includes("banking.plaid_daily_sync_cron") && !cron.includes("PLAID_DAILY_SYNC_JOB")) {
  fail("plaid-daily-sync cron job name missing");
}
if (!syncState.includes("markPlaidItemSyncSucceeded")) {
  fail("plaid-sync-state.ts must export markPlaidItemSyncSucceeded");
}
if (!index.includes("initializePlaidDailySyncCron")) {
  fail("index.ts must initialize plaid daily sync cron");
}

console.log("verify:plaid-cron-registered PASS");
