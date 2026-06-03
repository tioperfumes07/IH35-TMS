#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cronFile = path.join(ROOT, "apps/backend/src/cron/loves-card-import.cron.ts");
const importFile = path.join(ROOT, "apps/backend/src/sync/loves-card-import.ts");
const indexFile = path.join(ROOT, "apps/backend/src/index.ts");
const renderFile = path.join(ROOT, "render.yaml");

function fail(message) {
  console.error(`verify:loves-cron-registered FAIL: ${message}`);
  process.exit(1);
}

for (const target of [cronFile, importFile, indexFile, renderFile]) {
  if (!fs.existsSync(target)) fail(`missing ${path.relative(ROOT, target)}`);
}

const cron = fs.readFileSync(cronFile, "utf8");
const importSrc = fs.readFileSync(importFile, "utf8");
const index = fs.readFileSync(indexFile, "utf8");
const render = fs.readFileSync(renderFile, "utf8");

if (!cron.includes("initializeLovesCardImportCron")) {
  fail("loves-card-import.cron.ts must export initializeLovesCardImportCron");
}
if (!cron.includes("fuel.loves_card_import_cron") && !cron.includes("LOVES_CARD_IMPORT_JOB")) {
  fail("loves-card-import cron job name missing");
}
if (!importSrc.includes("parseLovesCsv")) {
  fail("loves-card-import.ts must export parseLovesCsv");
}
if (!index.includes("initializeLovesCardImportCron")) {
  fail("index.ts must initialize loves-card-import cron");
}
if (!index.includes("registerLovesSyncStatusRoutes")) {
  fail("index.ts must register GET /api/v1/sync/loves/status routes");
}
if (!render.includes("loves-card-import")) {
  fail("render.yaml must list loves-card-import cron service");
}
if (!render.includes("type: cron")) {
  fail("render.yaml must declare a cron service for loves-card-import");
}

console.log("verify:loves-cron-registered PASS");
