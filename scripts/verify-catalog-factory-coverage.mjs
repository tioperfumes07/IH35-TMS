#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const CATALOGS_DIR = path.join(ROOT, "apps/backend/src/catalogs");
const GENERIC_FACTORY = path.join(CATALOGS_DIR, "generic-catalog.factory.ts");
const GENERIC_ROUTES = path.join(CATALOGS_DIR, "generic-catalog.routes.ts");
const MIGRATION = path.join(ROOT, "db/migrations/0383_catalog_excel_upload_jobs.sql");

function fail(message) {
  console.error(`verify:catalog-factory-coverage FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify:catalog-factory-coverage PASS${message ? ` (${message})` : ""}`);
}

for (const target of [GENERIC_FACTORY, GENERIC_ROUTES, MIGRATION]) {
  if (!fs.existsSync(target)) {
    fail(`missing required file ${path.relative(ROOT, target)}`);
  }
}

const factorySource = fs.readFileSync(GENERIC_FACTORY, "utf8");
const routesSource = fs.readFileSync(GENERIC_ROUTES, "utf8");
const migrationSource = fs.readFileSync(MIGRATION, "utf8");

if (!factorySource.includes("createGenericCatalogRoutes")) {
  fail("generic-catalog.factory.ts must export createGenericCatalogRoutes");
}
if (!factorySource.includes("export.csv")) {
  fail("factory must expose export.csv endpoint");
}
if (!factorySource.includes("/import")) {
  fail("factory must expose import endpoint");
}
if (!routesSource.includes("fleet.equipment_types")) {
  fail("routes must register fleet.equipment_types example catalog");
}
if (!routesSource.includes("registerExcelUploadJobRoute")) {
  fail("routes must register excel upload job status endpoint");
}
if (!migrationSource.includes("catalogs.excel_upload_jobs")) {
  fail("migration must create catalogs.excel_upload_jobs");
}

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const catalogTables = new Set();
for (const filename of migrationFiles) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
  const matches = sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+catalogs\.([a-z_][a-z0-9_]*)/gi);
  for (const match of matches) {
    catalogTables.add(match[1]);
  }
}

const routeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.name.endsWith(".routes.ts")) {
      routeFiles.push(fullPath);
    }
  }
}
walk(CATALOGS_DIR);

const registeredTables = new Set();
for (const filePath of routeFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const tableMatches = source.matchAll(/tableName:\s*"([a-z_][a-z0-9_]*)"/g);
  for (const match of tableMatches) {
    registeredTables.add(match[1]);
  }
  const createMatches = source.matchAll(/createCatalogRoutes\([\s\S]*?tableName:\s*"([a-z_][a-z0-9_]*)"/g);
  for (const match of createMatches) {
    registeredTables.add(match[1]);
  }
}

const ignoredTables = new Set(["excel_upload_jobs"]);
const factoryBackedTables = [...catalogTables].filter(
  (table) => !ignoredTables.has(table) && !table.includes("_ledger_")
);
const missingFactoryBacked = factoryBackedTables.filter((table) => !registeredTables.has(table));

if (!registeredTables.has("equipment_types")) {
  fail("example catalog fleet.equipment_types must be factory-backed");
}

pass(
  `${registeredTables.size} factory-backed catalogs; ${missingFactoryBacked.length} legacy tables pending migration`
);
