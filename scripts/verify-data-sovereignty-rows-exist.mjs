#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const mustExist = [
  "apps/backend/src/integrations/qbo/mirror-integrity.service.ts",
  "apps/backend/src/integrations/qbo/reconciliation-report.service.ts",
  "apps/backend/src/integrations/samsara/config-bootstrap.service.ts",
  "apps/backend/src/integrations/samsara/vehicle-import.service.ts",
  "apps/backend/src/integrations/samsara/driver-import.service.ts",
  "apps/backend/src/integrations/samsara/daily-sync-job.ts",
  "apps/backend/src/integrations/integration-health.routes.ts",
  "apps/backend/src/integrations/__tests__/ds-suite.test.ts",
  "apps/backend/scripts/ds-verify-and-report.mjs",
  "db/migrations/202606080212_qbo_reconciliation_alerts.sql",
  ".block-ready/GAP-51.json",
];

for (const rel of mustExist) {
  if (!fs.existsSync(rel)) failures.push(`MISSING ${rel}`);
}

const health = fs.readFileSync("apps/backend/src/integrations/integration-health.routes.ts", "utf8");
if (!/samsara.*green/i.test(health)) failures.push("DS-7 green indicator missing");

const indexTs = fs.readFileSync("apps/backend/src/index.ts", "utf8");
if (!indexTs.includes("registerIntegrationHealthRoutes")) failures.push("index missing registerIntegrationHealthRoutes");
if (!indexTs.includes("initializeDataSovereigntyDailySync")) failures.push("index missing DS-6 daily sync worker");

if (failures.length) {
  console.error("verify:data-sovereignty-rows-exist — FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("verify:data-sovereignty-rows-exist — OK");
