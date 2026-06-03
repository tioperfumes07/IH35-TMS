#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cronFile = path.join(ROOT, "apps/backend/src/cron/samsara-positions-cron.ts");
const indexFile = path.join(ROOT, "apps/backend/src/index.ts");

if (!fs.existsSync(cronFile)) {
  console.error("verify:samsara-positions-cron-registered FAIL: samsara-positions-cron.ts missing");
  process.exit(1);
}

const cron = fs.readFileSync(cronFile, "utf8");
const index = fs.readFileSync(indexFile, "utf8");

if (!cron.includes("initializeSamsaraPositionsCron")) {
  console.error("verify:samsara-positions-cron-registered FAIL: cron initializer missing");
  process.exit(1);
}
if (!cron.includes("samsara.positions_cron")) {
  console.error("verify:samsara-positions-cron-registered FAIL: cron name missing");
  process.exit(1);
}
if (!cron.includes("*/5 * * * *")) {
  console.error("verify:samsara-positions-cron-registered FAIL: 5-minute schedule missing");
  process.exit(1);
}
if (!index.includes("initializeSamsaraPositionsCron")) {
  console.error("verify:samsara-positions-cron-registered FAIL: index.ts wiring missing");
  process.exit(1);
}
if (!index.includes("samsara-positions-cron")) {
  console.error("verify:samsara-positions-cron-registered FAIL: index.ts import missing");
  process.exit(1);
}

console.log("verify:samsara-positions-cron-registered PASS");
