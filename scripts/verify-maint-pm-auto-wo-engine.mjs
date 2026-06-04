#!/usr/bin/env node
/**
 * Block B28: PM auto-WO engine — migration 0360, hourly cron, dashboard, vitest.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0360_maint_pm_auto_engine.sql"),
  service: path.join(ROOT, "apps/backend/src/maintenance/pm-auto-engine.service.ts"),
  cron: path.join(ROOT, "apps/backend/src/maintenance/pm-auto-engine.cron.ts"),
  serviceTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/pm-auto-engine.service.test.ts"),
  page: path.join(ROOT, "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx"),
  pageTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/PmAutoEnginePage.test.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-pm-auto-wo-engine FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const migration = read(paths.migration);
  const service = read(paths.service);
  const cron = read(paths.cron);
  const serviceTest = read(paths.serviceTest);
  const page = read(paths.page);
  const pageTest = read(paths.pageTest);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const maintenanceApi = read(paths.maintenanceApi);
  const archDesign = read(paths.archDesign);

  if (!migration.includes("maintenance.pm_schedule_runs")) failures.push("migration must create pm_schedule_runs");
  if (!migration.includes("maintenance.pm_auto_wo_log")) failures.push("migration must create pm_auto_wo_log");
  if (!migration.includes("maintenance.pm_auto_engine_settings")) failures.push("migration must create pm_auto_engine_settings");

  if (!service.includes("runPmAutoEngineForTenant")) failures.push("service must export runPmAutoEngineForTenant");
  if (!service.includes('app.get("/api/v1/maintenance/pm-auto-engine/runs"')) {
    failures.push("service must expose runs dashboard endpoint");
  }
  if (!service.includes('app.post("/api/v1/maintenance/pm-auto-engine/settings"')) {
    failures.push("service must expose pause/resume settings endpoint");
  }
  if (!service.includes("origin = 'pm_schedule'") && !service.includes("'pm_schedule'")) {
    failures.push("service must create WOs with pm_schedule origin");
  }
  if (!cron.includes("5 * * * *")) failures.push("cron must schedule hourly evaluation");
  if ((serviceTest.match(/\bit\(/g) ?? []).length < 6) {
    failures.push("pm-auto-engine.service.test must include at least 6 vitest cases");
  }
  if (!page.includes("maint-pm-auto-engine")) failures.push("PmAutoEnginePage must expose test id");
  if (!page.includes("Pause engine")) failures.push("PmAutoEnginePage must offer pause control");
  if ((pageTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("PmAutoEnginePage.test must include at least 3 vitest cases");
  }
  if (!manifest.includes('path="/maintenance/pm-auto-engine"')) {
    failures.push("manifest must register /maintenance/pm-auto-engine route");
  }
  if (!index.includes("registerMaintenancePmAutoEngineRoutes")) {
    failures.push("backend index must register pm auto-engine routes");
  }
  if (!index.includes("initializePmAutoEngineCron")) {
    failures.push("backend index must initialize pm auto-engine cron");
  }
  if (!maintenanceApi.includes("getMaintenancePmAutoEngineDashboard")) {
    failures.push("maintenance API must expose getMaintenancePmAutoEngineDashboard");
  }
  if (!archDesign.includes("verify:maint-pm-auto-wo-engine")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-pm-auto-wo-engine");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-pm-auto-wo-engine PASS");
}

main();
