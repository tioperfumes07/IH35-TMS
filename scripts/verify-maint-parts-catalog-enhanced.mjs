#!/usr/bin/env node
/**
 * CLOSURE-10 — Enhanced maintenance parts master catalog CI guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:maint-parts-catalog-enhanced";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const migration = read("apps/backend/src/migrations/202606080242-maintenance-parts-catalog.sql");
const routes = read("apps/backend/src/catalogs/maintenance/parts.routes.ts");
const seed = read("apps/backend/src/catalogs/maintenance/parts-seed.ts");
const hook = read("apps/frontend/src/hooks/useMaintenancePartsCatalog.ts");
const page = read("apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx");

// Migration checks
if (!migration.includes("mdata.maintenance_parts")) fail("migration must create mdata.maintenance_parts");
if (!migration.includes("ENABLE ROW LEVEL SECURITY")) fail("migration must enable RLS");
if (!migration.includes("ih35_app")) fail("migration must grant to ih35_app");
if (!migration.includes("manufacturer")) fail("migration must include manufacturer column");
if (!migration.includes("typical_unit_cost_cents")) fail("migration must include typical_unit_cost_cents");

// Route checks
if (!routes.includes("/api/v1/catalogs/maintenance/parts-master")) fail("routes must expose /parts-master endpoint");
if (!routes.includes("manufacturer")) fail("routes must support manufacturer filter");
if (!routes.includes("category")) fail("routes must support category filter");
if (!routes.includes("registerMaintenancePartsMasterRoutes")) fail("routes must export registerMaintenancePartsMasterRoutes");

// Seed checks
if (!seed.includes("detroit-diesel.csv")) fail("seed must reference detroit-diesel.csv");
if (!seed.includes("cummins.csv")) fail("seed must reference cummins.csv");
if (!seed.includes("freightliner.csv")) fail("seed must reference freightliner.csv");
if (!seed.includes("peterbilt.csv")) fail("seed must reference peterbilt.csv");
if (!seed.includes("kenworth.csv")) fail("seed must reference kenworth.csv");
if (!seed.includes("seedMaintenanceParts")) fail("seed must export seedMaintenanceParts");

// Hook checks
if (!hook.includes("useMaintenancePartsCatalog")) fail("hook must export useMaintenancePartsCatalog");
if (!hook.includes("/api/v1/catalogs/maintenance/parts-master")) fail("hook must call parts-master endpoint");

// Page checks
if (!page.includes("MaintenancePartsCatalog")) fail("page must export MaintenancePartsCatalog");
if (!page.includes("manufacturer")) fail("page must support manufacturer filter");

// CSV row count checks (each should have 50+ rows)
const csvFiles = {
  "data/seeds/maintenance-parts/detroit-diesel.csv": 70,
  "data/seeds/maintenance-parts/cummins.csv": 65,
  "data/seeds/maintenance-parts/freightliner.csv": 70,
  "data/seeds/maintenance-parts/peterbilt.csv": 50,
  "data/seeds/maintenance-parts/kenworth.csv": 50,
};

let totalRows = 0;
for (const [file, minRows] of Object.entries(csvFiles)) {
  const content = read(file);
  const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("sku,"));
  if (lines.length < minRows) fail(`${file} must have >= ${minRows} rows, found ${lines.length}`);
  totalRows += lines.length;
}

if (totalRows < 300) fail(`total seed rows must be >= 300, found ${totalRows}`);

console.log(`[${LABEL}] PASS — ${totalRows} parts across 5 manufacturer CSVs`);
