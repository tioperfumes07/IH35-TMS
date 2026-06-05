#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const CATALOGS_DIR = path.join(ROOT, "apps/backend/src/catalogs");
const GENERIC_ROUTES = path.join(CATALOGS_DIR, "generic-catalog.routes.ts");
const GENERIC_FACTORY = path.join(CATALOGS_DIR, "generic-catalog.factory.ts");
const EXCEL_UPLOADER = path.join(CATALOGS_DIR, "excel-uploader.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0383_catalog_excel_upload_jobs.sql");

const EXCLUDED_TABLE_SUFFIXES = [
  "_dedup_ledger",
  "_line_item_templates",
  "_templates",
  "excel_upload_jobs",
  "form_425c_company_profiles",
];

/** Grandfathered catalog tables that exist in schema but are not yet on the generic factory. */
const KNOWN_STUB_TABLES = [];

function fail(message) {
  console.error(`verify:catalog-factory-coverage FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`verify:catalog-factory-coverage PASS${message ? ` (${message})` : ""}`);
}

function walkFiles(dir, matcher, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, matcher, acc);
      continue;
    }
    if (matcher(full)) acc.push(full);
  }
  return acc;
}

function extractCatalogTablesFromMigrations() {
  const tables = new Set();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const createTablePattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+catalogs\.([a-z_][a-z0-9_]*)/gi;

  for (const file of files) {
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    let match = createTablePattern.exec(source);
    while (match) {
      tables.add(match[1]);
      match = createTablePattern.exec(source);
    }
    createTablePattern.lastIndex = 0;
  }

  return [...tables].filter((table) => !EXCLUDED_TABLE_SUFFIXES.some((suffix) => table.endsWith(suffix) || table.includes(suffix)));
}

function collectRouteSources() {
  return walkFiles(
    CATALOGS_DIR,
    (filePath) => /(?:\.routes|-routes)\.ts$/.test(filePath) && !filePath.endsWith(".test.ts")
  );
}

function collectFactorySources() {
  return walkFiles(
    CATALOGS_DIR,
    (filePath) => filePath.endsWith("/factory.ts") || filePath.endsWith("/index.ts") || filePath.endsWith("generic-catalog.factory.ts")
  );
}

function hasTableRegistration(source, tableName) {
  return (
    new RegExp(`tableName:\\s*["']${tableName}["']`).test(source) ||
    new RegExp(`catalogName:\\s*["'][^"']*\\.${tableName}["']`).test(source) ||
    new RegExp(`catalogs\\.${tableName}\\b`).test(source)
  );
}

for (const required of [GENERIC_ROUTES, GENERIC_FACTORY, EXCEL_UPLOADER, MIGRATION_FILE]) {
  if (!fs.existsSync(required)) {
    fail(`missing required file ${path.relative(ROOT, required)}`);
  }
}

const genericRoutesSource = fs.readFileSync(GENERIC_ROUTES, "utf8");
const genericFactorySource = fs.readFileSync(GENERIC_FACTORY, "utf8");
const migrationSource = fs.readFileSync(MIGRATION_FILE, "utf8");

if (!genericFactorySource.includes("createCatalogRoutes")) fail("generic-catalog.factory must export createCatalogRoutes");
if (!genericFactorySource.includes("export.csv")) fail("generic factory must expose export.csv route");
if (!genericFactorySource.includes("/import")) fail("generic factory must expose import route");
if (!genericRoutesSource.includes("fleet.equipment_types")) fail("generic routes must wire fleet.equipment_types example catalog");
if (!migrationSource.includes("catalogs.excel_upload_jobs")) fail("migration must create catalogs.excel_upload_jobs");

const routeSources = collectRouteSources().map((filePath) => ({
  filePath,
  source: fs.readFileSync(filePath, "utf8"),
}));
const factorySources = collectFactorySources().map((filePath) => ({
  filePath,
  source: fs.readFileSync(filePath, "utf8"),
}));

const catalogTables = extractCatalogTablesFromMigrations();
const missing = [];

for (const tableName of catalogTables) {
  const inRoutes = routeSources.some(({ source }) => hasTableRegistration(source, tableName));
  const inFactory = factorySources.some(({ source }) => hasTableRegistration(source, tableName));
  if (!inRoutes && !inFactory) {
    missing.push(tableName);
  }
}

const unexpectedMissing = missing.filter((tableName) => !KNOWN_STUB_TABLES.includes(tableName)).sort();
if (unexpectedMissing.length > 0) {
  fail(`catalog tables without factory registration: ${unexpectedMissing.join(", ")}`);
}

const sortedMissing = [...missing].sort();
const sortedKnownStubs = [...KNOWN_STUB_TABLES].sort();
if (sortedMissing.join(",") !== sortedKnownStubs.join(",")) {
  fail(
    `catalog stub baseline drift: expected [${sortedKnownStubs.join(", ")}] but found [${sortedMissing.join(", ")}]`
  );
}

pass(`${catalogTables.length} catalog tables checked; ${sortedKnownStubs.length} grandfathered stubs; fleet.equipment_types wired`);
