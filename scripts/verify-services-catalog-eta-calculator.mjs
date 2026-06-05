#!/usr/bin/env node
/**
 * CLOSURE-11 — maintenance services catalog + ETA calculator gap-close guard.
 * Core catalogs.maintenance_service_tasks shipped via P3-T11.21.5a; ETA module is CLOSURE delta.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateServiceEta } from "../apps/backend/src/catalogs/maintenance/eta-calculator.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogIndex = path.join(ROOT, "apps/backend/src/catalogs/maintenance/index.ts");
const servicesListPage = path.join(
  ROOT,
  "apps/frontend/src/pages/lists/maintenance/MaintenanceServiceTasksListPage.tsx"
);
const etaModule = path.join(ROOT, "apps/backend/src/catalogs/maintenance/eta-calculator.ts");
const migration = path.join(ROOT, "db/migrations/0066_p3_t11_21_5a_maintenance_catalogs.sql");

function fail(message) {
  console.error(`verify:services-catalog-eta-calculator FAIL: ${message}`);
  process.exit(1);
}

for (const file of [catalogIndex, servicesListPage, etaModule, migration]) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(ROOT, file)}`);
}

const indexSrc = fs.readFileSync(catalogIndex, "utf8");
const servicesPage = fs.readFileSync(servicesListPage, "utf8");
const migrationSrc = fs.readFileSync(migration, "utf8");

if (!indexSrc.includes('tableName: "maintenance_service_tasks"')) {
  fail("catalog index must register maintenance_service_tasks");
}
if (!indexSrc.includes('urlSegment: "service-tasks"')) {
  fail("catalog index must expose /catalogs/maintenance/service-tasks");
}
if (!servicesPage.includes("maintenanceServiceTasksCatalogClient")) {
  fail("MaintenanceServiceTasksListPage must use maintenanceServiceTasksCatalogClient");
}
if (!migrationSrc.includes("'maintenance_service_tasks'")) {
  fail("migration 0066 must create catalogs.maintenance_service_tasks");
}

/** Acceptance: unit at 10k mi, last oil change at 5k, 25k interval → next due 30k. */
const eta = calculateServiceEta({
  intervalMiles: 25_000,
  intervalMonths: null,
  lastCompletedOdometer: 5_000,
  lastCompletedDate: null,
  currentOdometer: 10_000,
  asOf: new Date("2026-06-05"),
});

if (eta.dueAtMiles !== 30_000) {
  fail(`expected dueAtMiles 30000, got ${eta.dueAtMiles}`);
}
if (eta.milesUntilDue !== 20_000) {
  fail(`expected milesUntilDue 20000, got ${eta.milesUntilDue}`);
}
if (eta.daysUntilDue == null || eta.daysUntilDue <= 0) {
  fail("expected positive daysUntilDue from 12k mi/mo default");
}
if (eta.status !== "ok") {
  fail(`expected status ok for 20k miles remaining, got ${eta.status}`);
}

console.log("verify:services-catalog-eta-calculator PASS");
